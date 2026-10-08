require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');
const { userError } = require('./errors');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err) => {
  console.error('[POSTGRES-POOL] Unexpected idle client error:', err.message);
});

const id = () => crypto.randomUUID();

async function createUser({ name, userId, email, passwordHash }) {
  const userKey = id();
  await pool.query(
    `INSERT INTO users (id, name, user_id, email, password_hash)
     VALUES ($1, $2, $3, $4, $5)`,
    [userKey, name, userId, email.toLowerCase(), passwordHash]
  );
  return getUserById(userKey);
}

async function getUserByIdentifier(identifier) {
  const v = String(identifier || '').trim();
  const res = await pool.query(
    `SELECT id, name, user_id, email, password_hash, COALESCE(role, 'user') AS role, last_login_at, login_count FROM users WHERE LOWER(user_id) = LOWER($1) OR LOWER(email) = LOWER($2) LIMIT 1`,
    [v, v]
  );
  return res.rows[0] || null;
}

async function getUserById(uid) {
  const res = await pool.query(
    `SELECT id, name, user_id AS "userId", user_id, email, COALESCE(role, 'user') AS role, created_at AS "createdAt", last_login_at AS "lastLoginAt", login_count AS "loginCount" FROM users WHERE id = $1 LIMIT 1`,
    [uid]
  );
  return res.rows[0] || null;
}

async function savePaper(p) {
  const qJson = JSON.stringify(p.questions || []);
  await pool.query(
    `INSERT INTO papers (id, exam_id, exam_name, stage, test_type, section, language, questions_json, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'READY')
     ON CONFLICT (id) DO UPDATE SET questions_json = EXCLUDED.questions_json, status = EXCLUDED.status`,
    [p.id, p.examId, p.examName, p.stage, p.testType, p.section || '', p.language, qJson]
  );
  return p.id;
}

async function readyCount(p) {
  const res = await pool.query(
    `SELECT COUNT(*) c FROM papers
     WHERE exam_id = $1 AND stage = $2 AND test_type = $3 AND section = $4 AND language = $5 AND status = 'READY'`,
    [p.examId, p.stage, p.testType, p.section || '', p.language]
  );
  return Number(res.rows[0]?.c || 0);
}

async function allocatePaper(userId, p) {
  const res = await pool.query(
    `SELECT p.* FROM papers p
     WHERE p.exam_id = $1 AND p.stage = $2 AND p.test_type = $3 AND p.section = $4 AND p.language = $5 AND p.status = 'READY'
       AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.user_id = $6 AND a.paper_id = p.id)
     ORDER BY p.created_at ASC LIMIT 1`,
    [p.examId, p.stage, p.testType, p.section || '', p.language, userId]
  );
  if (res.rows[0]) {
    const row = res.rows[0];
    return {
      ...row,
      questions_json: typeof row.questions_json === 'string' ? row.questions_json : JSON.stringify(row.questions_json)
    };
  }

  // Fallback: If user has attempted all ready papers in this pool, re-serve any available ready paper (<5ms)
  const fallbackRes = await pool.query(
    `SELECT p.* FROM papers p
     WHERE p.exam_id = $1 AND p.stage = $2 AND p.test_type = $3 AND p.section = $4 AND p.language = $5 AND p.status = 'READY'
     ORDER BY p.created_at DESC LIMIT 1`,
    [p.examId, p.stage, p.testType, p.section || '', p.language]
  );
  if (!fallbackRes.rows[0]) return null;
  const fRow = fallbackRes.rows[0];
  return {
    ...fRow,
    questions_json: typeof fRow.questions_json === 'string' ? fRow.questions_json : JSON.stringify(fRow.questions_json)
  };
}

async function paperById(pid) {
  const res = await pool.query(`SELECT * FROM papers WHERE id = $1 LIMIT 1`, [pid]);
  if (!res.rows[0]) return null;
  const row = res.rows[0];
  return {
    ...row,
    questions_json: typeof row.questions_json === 'string' ? row.questions_json : JSON.stringify(row.questions_json)
  };
}

async function startAttempt(userId, paperId) {
  const res = await pool.query(
    `INSERT INTO attempts (user_id, paper_id, status) VALUES ($1, $2, 'IN_PROGRESS') RETURNING id`,
    [userId, paperId]
  );
  const attemptId = Number(res.rows[0].id);

  // Track seen questions asynchronously in background - NEVER block the user!
  setImmediate(async () => {
    try {
      const pRow = await pool.query(`SELECT questions_json FROM papers WHERE id = $1`, [paperId]);
      if (pRow.rows[0]) {
        let qs = pRow.rows[0].questions_json;
        if (typeof qs === 'string') { try { qs = JSON.parse(qs); } catch {} }
        if (Array.isArray(qs)) {
          const qIds = qs.map(q => q && q.id ? String(q.id) : null).filter(Boolean);
          if (qIds.length > 0) {
            await pool.query(
              `INSERT INTO user_seen_questions (user_id, question_id)
               SELECT $1, unnest($2::text[])
               ON CONFLICT DO NOTHING`,
              [userId, qIds]
            );
          }
        }
      }
    } catch (e) {
      // background warning ignored
    }
  });

  return attemptId;
}

// REAL-TIME AUTO-SAVE FOR UNSOLVED / IN-PROGRESS PAPERS
async function saveDraftProgress(userId, attemptId, { draftAnswers, currentQuestionIndex, totalTimeSeconds }) {
  const timeVal = (totalTimeSeconds !== undefined && totalTimeSeconds !== null) ? Number(totalTimeSeconds) : null;
  const qIdx = (currentQuestionIndex !== undefined && currentQuestionIndex !== null) ? Number(currentQuestionIndex) : null;
  const draftJson = draftAnswers !== undefined ? JSON.stringify(draftAnswers) : null;

  await pool.query(
    `UPDATE attempts SET 
       draft_answers_json = COALESCE($1, draft_answers_json),
       current_question_index = COALESCE($2, current_question_index),
       total_time_seconds = COALESCE($3, total_time_seconds)
     WHERE id = $4 AND user_id = $5 AND (status = 'IN_PROGRESS' OR submitted_at IS NULL)`,
    [draftJson, qIdx, timeVal, attemptId, userId]
  );
}

async function getActiveAttempt(userId) {
  const res = await pool.query(
    `SELECT a.*, p.exam_id, p.exam_name, p.stage, p.test_type, p.section, p.language, p.questions_json
     FROM attempts a JOIN papers p ON p.id = a.paper_id
     WHERE a.user_id = $1 AND a.status = 'IN_PROGRESS' AND a.submitted_at IS NULL
     ORDER BY a.id DESC LIMIT 1`,
    [userId]
  );
  if (!res.rows[0]) return null;
  const r = res.rows[0];
  return {
    ...r,
    questions: typeof r.questions_json === 'string' ? JSON.parse(r.questions_json) : r.questions_json,
    draftAnswers: typeof r.draft_answers_json === 'string' ? JSON.parse(r.draft_answers_json) : (r.draft_answers_json || {})
  };
}

async function submitAttempt(userId, attemptId, grade) {
  const res = await pool.query(
    `SELECT a.*, p.exam_id, p.stage, p.test_type, p.questions_json
     FROM attempts a JOIN papers p ON p.id = a.paper_id
     WHERE a.id = $1 AND a.user_id = $2`,
    [attemptId, userId]
  );
  const a = res.rows[0];
  if (!a) throw userError('Attempt not found', 404);

  if (a.submitted_at) {
    return {
      score: a.score, maxScore: a.max_score, correct: a.correct_count, wrong: a.wrong_count,
      unattempted: a.unattempted_count, accuracy: a.accuracy, totalTimeSeconds: a.total_time_seconds,
      answers: typeof a.answers_json === 'string' ? JSON.parse(a.answers_json || '[]') : a.answers_json,
      sections: typeof a.sections_json === 'string' ? JSON.parse(a.sections_json || '[]') : a.sections_json
    };
  }

  const qs = typeof a.questions_json === 'string' ? JSON.parse(a.questions_json) : a.questions_json;
  const r = grade(qs, a);

  const updateRes = await pool.query(
    `UPDATE attempts SET 
       submitted_at = CURRENT_TIMESTAMP,
       status = 'SUBMITTED',
       score = $1, max_score = $2, correct_count = $3, wrong_count = $4,
       unattempted_count = $5, accuracy = $6, total_time_seconds = $7,
       answers_json = $8, sections_json = $9
     WHERE id = $10 AND user_id = $11 AND submitted_at IS NULL`,
    [r.score, r.maxScore, r.correct, r.wrong, r.unattempted, r.accuracy, r.totalTimeSeconds,
     JSON.stringify(r.answers), JSON.stringify(r.sections), attemptId, userId]
  );

  if (updateRes.rowCount !== 1) throw userError('Attempt already submitted', 409);
  return r;
}

async function history(userId) {
  const res = await pool.query(
    `SELECT a.id AS "attemptId", a.started_at AS "startedAt", a.submitted_at AS "submittedAt",
            a.status, a.score, a.max_score AS "maxScore", a.correct_count AS correct,
            a.wrong_count AS wrong, a.unattempted_count AS unattempted, a.accuracy,
            a.total_time_seconds AS "totalTimeSeconds", p.id AS "paperId", p.exam_id AS "examId",
            p.exam_name AS "examName", p.stage, p.test_type AS "testType", p.section, p.language
     FROM attempts a JOIN papers p ON p.id = a.paper_id
     WHERE a.user_id = $1 ORDER BY a.id DESC`,
    [userId]
  );
  return res.rows;
}

async function attemptDetail(userId, attemptId) {
  const res = await pool.query(
    `SELECT a.*, p.exam_id, p.exam_name, p.stage, p.test_type, p.section, p.language, p.questions_json
     FROM attempts a JOIN papers p ON p.id = a.paper_id
     WHERE a.id = $1 AND a.user_id = $2`,
    [attemptId, userId]
  );
  const row = res.rows[0];
  if (!row) return null;

  const questions = typeof row.questions_json === 'string' ? JSON.parse(row.questions_json) : row.questions_json;
  const answers = typeof row.answers_json === 'string' ? JSON.parse(row.answers_json || '[]') : (row.answers_json || []);
  const sections = typeof row.sections_json === 'string' ? JSON.parse(row.sections_json || '[]') : (row.sections_json || []);
  const draftAnswers = typeof row.draft_answers_json === 'string' ? JSON.parse(row.draft_answers_json || '{}') : (row.draft_answers_json || {});

  return { ...row, questions, answers, sections, draftAnswers };
}

async function saveAiExplanation(userId, attemptId, questionIndex, explanation) {
  const res = await pool.query(
    `SELECT answers_json FROM attempts WHERE id = $1 AND user_id = $2`,
    [attemptId, userId]
  );
  if (!res.rows[0]) return;
  let answers = res.rows[0].answers_json;
  if (typeof answers === 'string') { try { answers = JSON.parse(answers); } catch {} }

  if (Array.isArray(answers) && answers[questionIndex]) {
    answers[questionIndex].aiExplanation = explanation;
    await pool.query(
      `UPDATE attempts SET answers_json = $1 WHERE id = $2 AND user_id = $3`,
      [JSON.stringify(answers), attemptId, userId]
    );
  }
}

async function stats(userId) {
  const rows = (await history(userId)).filter(x => x.submittedAt);
  const tests = rows.length;
  const totalScore = rows.reduce((s, x) => s + Number(x.score || 0), 0);
  const totalMax = rows.reduce((s, x) => s + Number(x.maxScore || 0), 0);
  const averageAccuracy = tests ? rows.reduce((s, x) => s + Number(x.accuracy || 0), 0) / tests : 0;
  const bestScorePercent = tests ? Math.max(...rows.map(x => Number(x.maxScore || 0) ? Number(x.score || 0) / Number(x.maxScore) * 100 : 0)) : 0;

  let correct = 0, wrong = 0, unattempted = 0, totalTimeSeconds = 0;
  const topicMap = new Map(), sectionMap = new Map();

  const completed = (await pool.query(
    `SELECT answers_json, sections_json, total_time_seconds
     FROM attempts WHERE user_id = $1 AND submitted_at IS NOT NULL ORDER BY id DESC`,
    [userId]
  )).rows;

  for (const a of completed) {
    totalTimeSeconds += Number(a.total_time_seconds || 0);
    let answers = a.answers_json, sections = a.sections_json;
    if (typeof answers === 'string') { try { answers = JSON.parse(answers); } catch { answers = []; } }
    if (typeof sections === 'string') { try { sections = JSON.parse(sections); } catch { sections = []; } }

    for (const x of Array.isArray(answers) ? answers : []) {
      if (x.isAttempted) {
        if (x.isCorrect) correct++; else wrong++;
      } else unattempted++;

      const topic = String(x.topic || '').trim();
      const subtopic = String(x.subtopic || '').trim();
      if (topic) {
        const key = topic + '|||' + subtopic;
        if (!topicMap.has(key)) topicMap.set(key, { topic, subtopic, total: 0, attempted: 0, correct: 0, wrong: 0, unattempted: 0 });
        const t = topicMap.get(key); t.total++;
        if (x.isAttempted) { t.attempted++; if (x.isCorrect) t.correct++; else t.wrong++; } else t.unattempted++;
      }
    }

    for (const x of Array.isArray(sections) ? sections : []) {
      const name = String(x.section || 'Questions');
      if (!sectionMap.has(name)) sectionMap.set(name, { section: name, total: 0, correct: 0, wrong: 0, unattempted: 0, score: 0 });
      const s = sectionMap.get(name);
      s.total += Number(x.total || 0); s.correct += Number(x.correct || 0); s.wrong += Number(x.wrong || 0);
      s.unattempted += Number(x.unattempted || 0); s.score += Number(x.score || 0);
    }
  }

  const topics = [...topicMap.values()].map(t => ({ ...t, accuracy: t.attempted ? t.correct / t.attempted * 100 : 0, errorRate: t.attempted ? t.wrong / t.attempted * 100 : 0 }));
  const weakTopics = topics.filter(t => t.attempted > 0).sort((a, b) => b.errorRate - a.errorRate || b.wrong - a.wrong || b.attempted - a.attempted).slice(0, 10);
  const strongTopics = topics.filter(t => t.attempted > 0).sort((a, b) => b.accuracy - a.accuracy || b.correct - a.correct).slice(0, 5);
  const sections = [...sectionMap.values()].map(s => ({ ...s, accuracy: (s.correct + s.wrong) ? s.correct / (s.correct + s.wrong) * 100 : 0 }));

  return {
    tests, totalScore, totalMax, averageAccuracy, bestScorePercent, correct, wrong, unattempted, totalTimeSeconds,
    averageTimeSeconds: tests ? totalTimeSeconds / tests : 0, weakTopics, strongTopics, sections, recent: rows.slice(0, 8)
  };
}

async function getState(key) {
  const res = await pool.query(`SELECT value FROM worker_state WHERE key = $1 LIMIT 1`, [key]);
  return res.rows[0]?.value || null;
}

async function setState(key, value) {
  await pool.query(
    `INSERT INTO worker_state (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
    [key, String(value)]
  );
}

async function importQuestions(items) {
  if (!Array.isArray(items) || !items.length) return { added: 0, skipped: 0 };
  let added = 0;
  for (const q of items) {
    const options = Array.isArray(q.options) ? q.options.map(String) : [];
    const answer = Number(q.answer);
    if (!q.question || !q.sectionId || ![4, 5].includes(options.length) || !Number.isInteger(answer) || answer < 0 || answer >= options.length) {
      continue;
    }
    const res = await pool.query(
      `INSERT INTO question_bank 
       (id, exam_id, stage, section_id, section_name, language, topic, subtopic, difficulty, question, options_json, answer, solution, short_trick, source, group_id, group_type, shared_stem, group_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       ON CONFLICT (id) DO NOTHING`,
      [
        q.id || id(), q.examId || '', q.stage || '', q.sectionId, String(q.sectionName || q.section || q.sectionId),
        String(q.language || 'ENGLISH').toUpperCase(), q.topic || '', q.subtopic || '', String(q.difficulty || 'MEDIUM').toUpperCase(),
        q.question, JSON.stringify(options), answer, q.solution || '', q.shortTrick || '', q.source || 'MASTER_BANK',
        q.groupId || '', String(q.groupType || '').toUpperCase(), q.sharedStem || '', Number(q.groupOrder || 0)
      ]
    );
    if (res.rowCount > 0) added++;
  }
  return { added, skipped: items.length - added };
}

async function bankCounts() {
  const res = await pool.query(
    `SELECT section_id AS "sectionId", section_name AS "sectionName", language, difficulty, COUNT(*) AS count
     FROM question_bank WHERE active = 1
     GROUP BY section_id, section_name, language, difficulty
     ORDER BY section_name, language, difficulty`
  );
  return res.rows;
}

const BANKING_EXAMS = new Set(['ibps-clerk', 'sbi-clerk', 'rbi-assistant', 'ibps-rrb-clerk', 'sbi-po']);
const SSC_EXAMS = new Set(['ssc-cgl', 'ssc-chsl', 'ssc-cpo', 'ssc-gd']);
const RAILWAY_EXAMS = new Set(['rrb-ntpc-graduate', 'rrb-ntpc-ug', 'rrb-group-d', 'rrb-alp', 'rrb-technician-3']);

async function getBankCandidates(userId, { examId, stage, sectionId, language }) {
  const lang = String(language || 'ENGLISH').toUpperCase();
  let secList = [sectionId];
  if (['quant', 'numerical', 'math'].includes(sectionId)) secList = ['quant', 'numerical', 'math'];
  else if (['reasoning', 'general-intelligence'].includes(sectionId)) secList = ['reasoning', 'general-intelligence'];
  else if (['english', 'english-comprehension', 'english-language'].includes(sectionId)) secList = ['english', 'english-comprehension', 'english-language'];

  let examList = [examId, ''];
  if (BANKING_EXAMS.has(examId)) examList = [...BANKING_EXAMS, ''];
  else if (SSC_EXAMS.has(examId)) examList = [...SSC_EXAMS, ''];
  else if (RAILWAY_EXAMS.has(examId)) examList = [...RAILWAY_EXAMS, ''];

  let res = await pool.query(
    `SELECT qb.*, (usq.question_id IS NOT NULL) AS seen
     FROM question_bank qb
     LEFT JOIN user_seen_questions usq ON usq.user_id = $1 AND usq.question_id = qb.id
     WHERE qb.active = 1 AND qb.section_id = ANY($2::text[]) AND qb.language = $3
       AND (qb.exam_id = ANY($4::text[]) OR qb.exam_id = '')
     ORDER BY seen ASC, RANDOM() LIMIT 100`,
    [userId, secList, lang, examList]
  );

  // Instant fallback: If not enough questions in this exact language/exam, borrow from master section questions so user NEVER waits
  if (!res.rows.length) {
    res = await pool.query(
      `SELECT qb.*, false AS seen
       FROM question_bank qb
       WHERE qb.active = 1 AND qb.section_id = ANY($1::text[])
       ORDER BY RANDOM() LIMIT 100`,
      [secList]
    );
  }

  return res.rows.map(r => ({
    id: r.id, sectionId: r.section_id, section: r.section_name, topic: r.topic, subtopic: r.subtopic,
    difficulty: String(r.difficulty || 'MEDIUM').toUpperCase(), question: r.question,
    options: typeof r.options_json === 'string' ? JSON.parse(r.options_json) : r.options_json,
    answer: r.answer, solution: r.solution, shortTrick: r.short_trick,
    groupId: r.group_id || '', groupType: r.group_type || '', sharedStem: r.shared_stem || '',
    groupOrder: Number(r.group_order || 0), seen: !!r.seen
  }));
}

async function recordLogin({ userId, identifier, userName, status, ip, userAgent }) {
  try {
    await pool.query(
      `INSERT INTO login_logs (user_id, identifier, user_name, status, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId || null, identifier || '', userName || null, status, ip || '', userAgent || '']
    );
    if (status === 'SUCCESS' && userId) {
      await pool.query(
        `UPDATE users
         SET last_login_at = CURRENT_TIMESTAMP,
             login_count = COALESCE(login_count, 0) + 1,
             last_ip = $2
         WHERE id = $1`,
        [userId, ip || '']
      );
    }
  } catch (err) {
    console.warn('[DB] recordLogin warning:', err.message);
  }
}

async function getAdminOverview() {
  const [uRes, aRes, pRes, qRes, lTodayRes] = await Promise.all([
    pool.query(`SELECT COUNT(*) total_users FROM users`),
    pool.query(`SELECT COUNT(*) total_attempts, COUNT(submitted_at) submitted_attempts FROM attempts`),
    pool.query(`SELECT COUNT(*) total_papers FROM papers`),
    pool.query(`SELECT COUNT(*) total_questions FROM question_bank`),
    pool.query(`SELECT COUNT(DISTINCT user_id) active_today FROM login_logs WHERE created_at >= CURRENT_DATE AND status = 'SUCCESS'`)
  ]);

  return {
    totalUsers: Number(uRes.rows[0]?.total_users || 0),
    activeToday: Number(lTodayRes.rows[0]?.active_today || 0),
    totalAttempts: Number(aRes.rows[0]?.total_attempts || 0),
    submittedAttempts: Number(aRes.rows[0]?.submitted_attempts || 0),
    totalPapers: Number(pRes.rows[0]?.total_papers || 0),
    totalQuestions: Number(qRes.rows[0]?.total_questions || 0)
  };
}

async function getAdminUsers() {
  const res = await pool.query(`
    SELECT 
      u.id,
      u.name,
      u.user_id AS "userId",
      u.email,
      COALESCE(u.role, 'user') AS role,
      u.created_at AS "createdAt",
      u.last_login_at AS "lastLoginAt",
      u.last_ip AS "lastIp",
      COALESCE(u.login_count, 0) AS "loginCount",
      COUNT(a.id) AS "testsAttempted",
      COUNT(a.submitted_at) AS "testsCompleted",
      AVG(a.accuracy) AS "avgAccuracy",
      MAX(a.started_at) AS "lastTestAt"
    FROM users u
    LEFT JOIN attempts a ON a.user_id = u.id
    GROUP BY u.id, u.name, u.user_id, u.email, u.role, u.created_at, u.last_login_at, u.last_ip, u.login_count
    ORDER BY u.last_login_at DESC NULLS LAST, u.created_at DESC
  `);
  return res.rows.map(r => ({
    ...r,
    testsAttempted: Number(r.testsAttempted || 0),
    testsCompleted: Number(r.testsCompleted || 0),
    avgAccuracy: r.avgAccuracy != null ? Number(Number(r.avgAccuracy).toFixed(1)) : null,
    isOnline: r.lastLoginAt ? (Date.now() - new Date(r.lastLoginAt).getTime() < 15 * 60 * 1000) : false
  }));
}

async function getAdminLoginLogs(limit = 100) {
  const res = await pool.query(
    `SELECT 
       l.id,
       l.user_id AS "userId",
       l.identifier,
       COALESCE(l.user_name, u.name, 'Unknown') AS "userName",
       l.status,
       l.ip_address AS "ipAddress",
       l.user_agent AS "userAgent",
       l.created_at AS "createdAt"
     FROM login_logs l
     LEFT JOIN users u ON u.id = l.user_id
     ORDER BY l.created_at DESC
     LIMIT $1`,
    [Math.min(500, Number(limit) || 100)]
  );
  return res.rows;
}

async function getAdminAttempts(limit = 50) {
  const res = await pool.query(
    `SELECT 
       a.id,
       a.user_id AS "userId",
       u.name AS "userName",
       u.user_id AS "userHandle",
       p.exam_name AS "examName",
       p.stage,
       p.test_type AS "testType",
       p.section,
       a.score,
       a.max_score AS "maxScore",
       a.accuracy,
       a.started_at AS "startedAt",
       a.submitted_at AS "submittedAt",
       a.status
     FROM attempts a
     JOIN users u ON u.id = a.user_id
     JOIN papers p ON p.id = a.paper_id
     ORDER BY a.started_at DESC
     LIMIT $1`,
    [Math.min(200, Number(limit) || 50)]
  );
  return res.rows;
}

module.exports = {
  pool,
  db: { close: () => pool.end(), query: (...args) => pool.query(...args) },
  createUser,
  getUserByIdentifier,
  getUserById,
  savePaper,
  readyCount,
  allocatePaper,
  paperById,
  startAttempt,
  saveDraftProgress,
  getActiveAttempt,
  submitAttempt,
  history,
  attemptDetail,
  saveAiExplanation,
  stats,
  getState,
  setState,
  importQuestions,
  bankCounts,
  getBankCandidates,
  recordLogin,
  getAdminOverview,
  getAdminUsers,
  getAdminLoginLogs,
  getAdminAttempts
};
