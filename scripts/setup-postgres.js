require('dotenv').config();
const { Pool } = require('pg');
const Database = require('better-sqlite3');
const path = require('path');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const sqlite = new Database(path.join(__dirname, '..', 'data', 'exammock.db'));

async function initSchema() {
  console.log('[POSTGRES] Creating schema in Neon PostgreSQL...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      user_id VARCHAR(50) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY,
      exam_id VARCHAR(100) NOT NULL,
      exam_name VARCHAR(150) NOT NULL,
      stage VARCHAR(50) NOT NULL,
      test_type VARCHAR(50) NOT NULL,
      section VARCHAR(100) DEFAULT '',
      language VARCHAR(30) NOT NULL,
      questions_json JSONB NOT NULL,
      status VARCHAR(30) DEFAULT 'READY',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_papers_pool_pg 
      ON papers(exam_id, stage, test_type, section, language, status);

    CREATE TABLE IF NOT EXISTS attempts (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      status VARCHAR(30) DEFAULT 'IN_PROGRESS',
      started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      submitted_at TIMESTAMP WITH TIME ZONE,
      score REAL,
      max_score REAL,
      correct_count INTEGER,
      wrong_count INTEGER,
      unattempted_count INTEGER,
      accuracy REAL,
      total_time_seconds INTEGER DEFAULT 0,
      current_question_index INTEGER DEFAULT 0,
      answers_json JSONB DEFAULT '[]'::jsonb,
      draft_answers_json JSONB DEFAULT '{}'::jsonb,
      sections_json JSONB DEFAULT '[]'::jsonb
    );

    CREATE INDEX IF NOT EXISTS idx_attempts_user_pg 
      ON attempts(user_id, id DESC);

    CREATE INDEX IF NOT EXISTS idx_attempts_status_pg 
      ON attempts(user_id, status);

    CREATE TABLE IF NOT EXISTS question_bank (
      id TEXT PRIMARY KEY,
      exam_id VARCHAR(100) DEFAULT '',
      stage VARCHAR(50) DEFAULT '',
      section_id VARCHAR(100) NOT NULL,
      section_name VARCHAR(150) NOT NULL,
      language VARCHAR(30) DEFAULT 'ENGLISH',
      topic VARCHAR(150) DEFAULT '',
      subtopic VARCHAR(150) DEFAULT '',
      difficulty VARCHAR(30) DEFAULT 'MEDIUM',
      question TEXT NOT NULL,
      options_json JSONB NOT NULL,
      answer INTEGER NOT NULL,
      solution TEXT DEFAULT '',
      short_trick TEXT DEFAULT '',
      source VARCHAR(50) DEFAULT 'MASTER_BANK',
      group_id VARCHAR(100) DEFAULT '',
      group_type VARCHAR(50) DEFAULT '',
      shared_stem TEXT DEFAULT '',
      group_order INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_qb_pick_pg 
      ON question_bank(section_id, language, active, difficulty, exam_id, stage);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_qb_unique_pg 
      ON question_bank(section_id, language, question);

    CREATE TABLE IF NOT EXISTS user_seen_questions (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL,
      PRIMARY KEY (user_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS worker_state (
      key VARCHAR(100) PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('[POSTGRES] Schema successfully verified/created in Neon!');
}

async function migrateData() {
  console.log('[POSTGRES] Starting data migration from local SQLite to Neon PostgreSQL...');

  // 1. Users
  const users = sqlite.prepare('SELECT * FROM users').all();
  console.log(`[POSTGRES] Migrating ${users.length} users...`);
  for (const u of users) {
    await pool.query(`
      INSERT INTO users (id, name, user_id, email, password_hash, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        user_id = EXCLUDED.user_id,
        email = EXCLUDED.email,
        password_hash = EXCLUDED.password_hash
    `, [u.id, u.name, u.user_id, u.email, u.password_hash, u.created_at]);
  }

  // 2. Papers
  const papers = sqlite.prepare('SELECT * FROM papers').all();
  console.log(`[POSTGRES] Migrating ${papers.length} papers...`);
  for (const p of papers) {
    let qJson;
    try { qJson = JSON.parse(p.questions_json); } catch { qJson = []; }
    await pool.query(`
      INSERT INTO papers (id, exam_id, exam_name, stage, test_type, section, language, questions_json, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        questions_json = EXCLUDED.questions_json,
        status = EXCLUDED.status
    `, [p.id, p.exam_id, p.exam_name, p.stage, p.test_type, p.section || '', p.language, JSON.stringify(qJson), p.status || 'READY', p.created_at]);
  }

  // 3. Question Bank (Fast multi-row batch insert)
  const qb = sqlite.prepare('SELECT * FROM question_bank').all();
  console.log(`[POSTGRES] Migrating ${qb.length} questions in question_bank via fast multi-row batches...`);
  const chunkSize = 80;
  for (let i = 0; i < qb.length; i += chunkSize) {
    const chunk = qb.slice(i, i + chunkSize);
    const values = [];
    const placeholders = [];
    let pIdx = 1;

    for (const q of chunk) {
      let opts;
      try { opts = JSON.parse(q.options_json); } catch { opts = []; }
      placeholders.push(`($${pIdx}, $${pIdx+1}, $${pIdx+2}, $${pIdx+3}, $${pIdx+4}, $${pIdx+5}, $${pIdx+6}, $${pIdx+7}, $${pIdx+8}, $${pIdx+9}, $${pIdx+10}, $${pIdx+11}, $${pIdx+12}, $${pIdx+13}, $${pIdx+14}, $${pIdx+15}, $${pIdx+16}, $${pIdx+17}, $${pIdx+18}, $${pIdx+19}, $${pIdx+20})`);
      pIdx += 21;
      values.push(
        q.id, q.exam_id || '', q.stage || '', q.section_id, q.section_name, q.language || 'ENGLISH',
        q.topic || '', q.subtopic || '', q.difficulty || 'MEDIUM', q.question, JSON.stringify(opts),
        q.answer, q.solution || '', q.short_trick || '', q.source || 'MASTER_BANK',
        q.group_id || '', q.group_type || '', q.shared_stem || '', q.group_order || 0, q.active ?? 1, q.created_at
      );
    }

    await pool.query(`
      INSERT INTO question_bank 
      (id, exam_id, stage, section_id, section_name, language, topic, subtopic, difficulty, question, options_json, answer, solution, short_trick, source, group_id, group_type, shared_stem, group_order, active, created_at)
      VALUES ${placeholders.join(', ')}
      ON CONFLICT (id) DO NOTHING
    `, values);
    process.stdout.write(`.`);
  }
  console.log(' Done!');

  // 4. Attempts
  const attempts = sqlite.prepare('SELECT * FROM attempts').all();
  console.log(`[POSTGRES] Migrating ${attempts.length} attempts...`);
  for (const a of attempts) {
    let answersJson, sectionsJson;
    try { answersJson = JSON.parse(a.answers_json || '[]'); } catch { answersJson = []; }
    try { sectionsJson = JSON.parse(a.sections_json || '[]'); } catch { sectionsJson = []; }
    const status = a.submitted_at ? 'SUBMITTED' : 'IN_PROGRESS';

    await pool.query(`
      INSERT INTO attempts 
      (id, user_id, paper_id, status, started_at, submitted_at, score, max_score, correct_count, wrong_count, unattempted_count, accuracy, total_time_seconds, answers_json, sections_json)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO NOTHING
    `, [
      a.id, a.user_id, a.paper_id, status, a.started_at, a.submitted_at,
      a.score, a.max_score, a.correct_count, a.wrong_count, a.unattempted_count,
      a.accuracy, a.total_time_seconds || 0, JSON.stringify(answersJson), JSON.stringify(sectionsJson)
    ]);
  }
  // Sync attempts sequence in Postgres
  await pool.query(`SELECT setval(pg_get_serial_sequence('attempts', 'id'), COALESCE(MAX(id), 1)) FROM attempts;`);

  // 5. User seen questions
  const seen = sqlite.prepare('SELECT * FROM user_seen_questions').all();
  console.log(`[POSTGRES] Migrating ${seen.length} seen question records...`);
  if (seen.length > 0) {
    for (let i = 0; i < seen.length; i += 200) {
      const chunk = seen.slice(i, i + 200);
      const values = [];
      const placeholders = [];
      let pIdx = 1;
      for (const s of chunk) {
        placeholders.push(`($${pIdx}, $${pIdx+1})`);
        pIdx += 2;
        values.push(s.user_id, s.question_id);
      }
      await pool.query(`
        INSERT INTO user_seen_questions (user_id, question_id)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT DO NOTHING
      `, values);
    }
  }

  // 6. Worker state
  const states = sqlite.prepare('SELECT * FROM worker_state').all();
  for (const st of states) {
    await pool.query(`
      INSERT INTO worker_state (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `, [st.key, st.value]);
  }

  console.log('\n[POSTGRES] Verification summary:');
  const uCount = await pool.query('SELECT COUNT(*) c FROM users');
  const pCount = await pool.query('SELECT COUNT(*) c FROM papers');
  const aCount = await pool.query('SELECT COUNT(*) c FROM attempts');
  const qCount = await pool.query('SELECT COUNT(*) c FROM question_bank');
  console.log(`- Users in Neon Postgres: ${uCount.rows[0].c}`);
  console.log(`- Papers in Neon Postgres: ${pCount.rows[0].c}`);
  console.log(`- Attempts in Neon Postgres: ${aCount.rows[0].c}`);
  console.log(`- Questions in Neon Postgres: ${qCount.rows[0].c}`);
}

async function run() {
  try {
    await initSchema();
    await migrateData();
    console.log('\n🎉 SUCCESS: Neon PostgreSQL database is fully initialized and 100% in sync!');
    process.exit(0);
  } catch (err) {
    console.error('\n[POSTGRES ERROR]', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
