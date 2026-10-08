const Database=require('better-sqlite3'); const path=require('path'); const crypto=require('crypto');
const fs = require('fs');
const { userError } = require('./errors');
fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
const db=new Database(path.join(__dirname,'data','exammock.db')); db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,user_id TEXT UNIQUE COLLATE NOCASE,email TEXT UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS papers(id TEXT PRIMARY KEY,exam_id TEXT NOT NULL,exam_name TEXT NOT NULL,stage TEXT NOT NULL,test_type TEXT NOT NULL,section TEXT NOT NULL DEFAULT '',language TEXT NOT NULL,questions_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'READY',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_papers_pool ON papers(exam_id,stage,test_type,section,language,status);
CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,paper_id TEXT NOT NULL,started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,submitted_at TEXT,score REAL,max_score REAL,correct_count INTEGER,wrong_count INTEGER,unattempted_count INTEGER,accuracy REAL,total_time_seconds INTEGER,answers_json TEXT,sections_json TEXT,FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(paper_id) REFERENCES papers(id));
CREATE INDEX IF NOT EXISTS idx_attempt_user ON attempts(user_id,id DESC);
CREATE TABLE IF NOT EXISTS worker_state(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS generation_checkpoints(
  pool_key TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  test_type TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL,
  questions_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
db.exec(`
CREATE TABLE IF NOT EXISTS question_bank(
  id TEXT PRIMARY KEY,
  exam_id TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT '',
  section_id TEXT NOT NULL,
  section_name TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'ENGLISH',
  topic TEXT NOT NULL DEFAULT '',
  subtopic TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT 'MEDIUM',
  question TEXT NOT NULL,
  options_json TEXT NOT NULL,
  answer INTEGER NOT NULL,
  solution TEXT NOT NULL DEFAULT '',
  short_trick TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'MASTER_BANK',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_question_bank_pick ON question_bank(section_id,language,active,difficulty,exam_id,stage);
CREATE UNIQUE INDEX IF NOT EXISTS idx_question_bank_unique ON question_bank(section_id,language,question);
`);

// v3 grouped-question migration: RC / DI / Puzzle / Seating / Cloze sets.
const qbCols=db.prepare('PRAGMA table_info(question_bank)').all().map(x=>x.name);
if(!qbCols.includes('group_id')) db.exec("ALTER TABLE question_bank ADD COLUMN group_id TEXT NOT NULL DEFAULT ''");
if(!qbCols.includes('group_type')) db.exec("ALTER TABLE question_bank ADD COLUMN group_type TEXT NOT NULL DEFAULT ''");
if(!qbCols.includes('shared_stem')) db.exec("ALTER TABLE question_bank ADD COLUMN shared_stem TEXT NOT NULL DEFAULT ''");
if(!qbCols.includes('group_order')) db.exec("ALTER TABLE question_bank ADD COLUMN group_order INTEGER NOT NULL DEFAULT 0");
db.exec("CREATE INDEX IF NOT EXISTS idx_question_bank_group ON question_bank(exam_id,stage,section_id,language,active,group_id,group_order)");

// One-time migration from the earlier phone/OTP user table, if present.
const userCols=db.prepare('PRAGMA table_info(users)').all().map(x=>x.name);
if(!userCols.includes('user_id')||!userCols.includes('email')){
 db.exec('PRAGMA foreign_keys = OFF');
 db.exec(`ALTER TABLE users RENAME TO users_phone_backup; CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT NOT NULL,user_id TEXT UNIQUE COLLATE NOCASE,email TEXT UNIQUE COLLATE NOCASE,password_hash TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
 db.exec('PRAGMA foreign_keys = ON');
}
// Repair legacy FK created when the old users table was renamed.
// SQLite rewrites attempts.user_id FK to users_phone_backup during ALTER TABLE users RENAME.
// The current auth system uses the new users table, so new attempts would otherwise fail.
function repairAttemptsForeignKeys(){
 const fks=db.prepare('PRAGMA foreign_key_list(attempts)').all();
 const userFk=fks.find(x=>x.from==='user_id');
 const paperFk=fks.find(x=>x.from==='paper_id');
 if(userFk?.table==='users' && paperFk?.table==='papers')return;

 db.pragma('foreign_keys = OFF');
 try{
  db.exec(`
   DROP TABLE IF EXISTS attempts_fk_repair;
   CREATE TABLE attempts_fk_repair(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    paper_id TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TEXT,
    score REAL,
    max_score REAL,
    correct_count INTEGER,
    wrong_count INTEGER,
    unattempted_count INTEGER,
    accuracy REAL,
    total_time_seconds INTEGER,
    answers_json TEXT,
    sections_json TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(paper_id) REFERENCES papers(id)
   );
   INSERT INTO attempts_fk_repair(id,user_id,paper_id,started_at,submitted_at,score,max_score,correct_count,wrong_count,unattempted_count,accuracy,total_time_seconds,answers_json,sections_json)
   SELECT a.id,a.user_id,a.paper_id,a.started_at,a.submitted_at,a.score,a.max_score,a.correct_count,a.wrong_count,a.unattempted_count,a.accuracy,a.total_time_seconds,a.answers_json,a.sections_json
   FROM attempts a
   WHERE EXISTS(SELECT 1 FROM users u WHERE u.id=a.user_id)
     AND EXISTS(SELECT 1 FROM papers p WHERE p.id=a.paper_id);
   DROP TABLE attempts;
   ALTER TABLE attempts_fk_repair RENAME TO attempts;
   CREATE INDEX IF NOT EXISTS idx_attempt_user ON attempts(user_id,id DESC);
  `);
 } finally {
  db.pragma('foreign_keys = ON');
 }
}
repairAttemptsForeignKeys();

db.exec(`CREATE TABLE IF NOT EXISTS user_seen_questions(
  user_id TEXT NOT NULL, question_id TEXT NOT NULL, PRIMARY KEY(user_id, question_id)
) WITHOUT ROWID;`);
if (db.prepare('SELECT COUNT(*) c FROM user_seen_questions').get().c === 0) {
  const ins = db.prepare('INSERT OR IGNORE INTO user_seen_questions(user_id,question_id) VALUES(?,?)');
  const rows = db.prepare('SELECT a.user_id, p.questions_json FROM attempts a JOIN papers p ON p.id=a.paper_id').all();
  db.transaction(() => {
    for (const r of rows) {
      try { for (const q of JSON.parse(r.questions_json) || []) if (q.id) ins.run(r.user_id, String(q.id)); } catch {}
    }
  })();
}
const id=()=>crypto.randomUUID();
function createUser({name,userId,email,passwordHash}){const userKey=id();db.prepare('INSERT INTO users(id,name,user_id,email,password_hash) VALUES(?,?,?,?,?)').run(userKey,name,userId,email,passwordHash);return getUserById(userKey)}
function getUserByIdentifier(identifier){const v=String(identifier||'').trim();return db.prepare('SELECT * FROM users WHERE user_id=? COLLATE NOCASE OR email=? COLLATE NOCASE LIMIT 1').get(v,v.toLowerCase())}
function getUserById(id){return db.prepare('SELECT id,name,user_id,email,created_at FROM users WHERE id=?').get(id)}
function savePaper(p){db.prepare(`INSERT INTO papers(id,exam_id,exam_name,stage,test_type,section,language,questions_json,status) VALUES(?,?,?,?,?,?,?,?, 'READY')`).run(p.id,p.examId,p.examName,p.stage,p.testType,p.section||'',p.language,JSON.stringify(p.questions));return p.id}
function readyCount(p){return db.prepare(`SELECT COUNT(*) c FROM papers WHERE exam_id=? AND stage=? AND test_type=? AND section=? AND language=? AND status='READY'`).get(p.examId,p.stage,p.testType,p.section||'',p.language).c}
function allocatePaper(userId,p){return db.prepare(`SELECT p.* FROM papers p WHERE p.exam_id=? AND p.stage=? AND p.test_type=? AND p.section=? AND p.language=? AND p.status='READY' AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.user_id=? AND a.paper_id=p.id) ORDER BY p.created_at ASC LIMIT 1`).get(p.examId,p.stage,p.testType,p.section||'',p.language,userId)}
function paperById(id){return db.prepare('SELECT * FROM papers WHERE id=?').get(id)}
const startAttemptTx = db.transaction((userId, paperId) => {
  const info = db.prepare('INSERT INTO attempts(user_id,paper_id) VALUES(?,?)').run(userId, paperId);
  const row = db.prepare('SELECT questions_json FROM papers WHERE id=?').get(paperId);
  const ins = db.prepare('INSERT OR IGNORE INTO user_seen_questions(user_id,question_id) VALUES(?,?)');
  for (const q of JSON.parse(row.questions_json) || []) if (q.id) ins.run(userId, String(q.id));
  return Number(info.lastInsertRowid);
});
function startAttempt(userId, paperId) { return startAttemptTx(userId, paperId); }
const submitTx = db.transaction((userId, attemptId, grade) => {
  const a = db.prepare(`SELECT a.*, p.exam_id, p.stage, p.test_type, p.questions_json
    FROM attempts a JOIN papers p ON p.id=a.paper_id WHERE a.id=? AND a.user_id=?`).get(attemptId, userId);
  if (!a) throw userError('Attempt not found', 404);
  if (a.submitted_at) {
    return {
      score: a.score, maxScore: a.max_score, correct: a.correct_count, wrong: a.wrong_count,
      unattempted: a.unattempted_count, accuracy: a.accuracy, totalTimeSeconds: a.total_time_seconds,
      answers: JSON.parse(a.answers_json || '[]'), sections: JSON.parse(a.sections_json || '[]')
    };
  }
  const r = grade(JSON.parse(a.questions_json), a);
  const info = db.prepare(`UPDATE attempts SET submitted_at=CURRENT_TIMESTAMP, score=?, max_score=?, correct_count=?,
    wrong_count=?, unattempted_count=?, accuracy=?, total_time_seconds=?, answers_json=?, sections_json=?
    WHERE id=? AND user_id=? AND submitted_at IS NULL`)
    .run(r.score, r.maxScore, r.correct, r.wrong, r.unattempted, r.accuracy, r.totalTimeSeconds,
         JSON.stringify(r.answers), JSON.stringify(r.sections), attemptId, userId);
  if (info.changes !== 1) throw userError('Attempt already submitted', 409);
  return r;
});
function submitAttempt(userId, attemptId, grade) { return submitTx(userId, attemptId, grade); }
function history(userId){return db.prepare(`SELECT a.id attemptId,a.started_at startedAt,a.submitted_at submittedAt,a.score,a.max_score maxScore,a.correct_count correct,a.wrong_count wrong,a.unattempted_count unattempted,a.accuracy,a.total_time_seconds totalTimeSeconds,p.id paperId,p.exam_id examId,p.exam_name examName,p.stage,p.test_type testType,p.section,p.language FROM attempts a JOIN papers p ON p.id=a.paper_id WHERE a.user_id=? ORDER BY a.id DESC`).all(userId)}
function attemptDetail(userId,attemptId){const row=db.prepare(`SELECT a.*,p.exam_id,p.exam_name,p.stage,p.test_type,p.section,p.language,p.questions_json FROM attempts a JOIN papers p ON p.id=a.paper_id WHERE a.id=? AND a.user_id=?`).get(attemptId,userId);if(!row)return null;return {...row,questions:JSON.parse(row.questions_json),answers:row.answers_json?JSON.parse(row.answers_json):[],sections:row.sections_json?JSON.parse(row.sections_json):[]}}
function stats(userId){
 const rows=history(userId).filter(x=>x.submittedAt);
 const tests=rows.length;
 const totalScore=rows.reduce((s,x)=>s+Number(x.score||0),0);
 const totalMax=rows.reduce((s,x)=>s+Number(x.maxScore||0),0);
 const averageAccuracy=tests?rows.reduce((s,x)=>s+Number(x.accuracy||0),0)/tests:0;
 const bestScorePercent=tests?Math.max(...rows.map(x=>Number(x.maxScore||0)?Number(x.score||0)/Number(x.maxScore)*100:0)):0;

 let correct=0,wrong=0,unattempted=0,totalTimeSeconds=0;
 const topicMap=new Map(),sectionMap=new Map();

 const completed=db.prepare(`SELECT a.answers_json,a.sections_json,a.total_time_seconds
  FROM attempts a WHERE a.user_id=? AND a.submitted_at IS NOT NULL ORDER BY a.id DESC`).all(userId);

 for(const a of completed){
  totalTimeSeconds+=Number(a.total_time_seconds||0);
  let answers=[],sections=[];
  try{answers=a.answers_json?JSON.parse(a.answers_json):[]}catch{}
  try{sections=a.sections_json?JSON.parse(a.sections_json):[]}catch{}

  for(const x of answers){
   if(x.isAttempted){
    if(x.isCorrect)correct++; else wrong++;
   }else unattempted++;

   const topic=String(x.topic||'').trim();
   const subtopic=String(x.subtopic||'').trim();
   if(topic){
    const key=topic+'|||'+subtopic;
    if(!topicMap.has(key))topicMap.set(key,{topic,subtopic,total:0,attempted:0,correct:0,wrong:0,unattempted:0});
    const t=topicMap.get(key);t.total++;
    if(x.isAttempted){t.attempted++;if(x.isCorrect)t.correct++;else t.wrong++;}else t.unattempted++;
   }
  }

  for(const x of sections){
   const name=String(x.section||'Questions');
   if(!sectionMap.has(name))sectionMap.set(name,{section:name,total:0,correct:0,wrong:0,unattempted:0,score:0});
   const s=sectionMap.get(name);
   s.total+=Number(x.total||0);s.correct+=Number(x.correct||0);s.wrong+=Number(x.wrong||0);
   s.unattempted+=Number(x.unattempted||0);s.score+=Number(x.score||0);
  }
 }

 const topics=[...topicMap.values()].map(t=>({...t,accuracy:t.attempted?t.correct/t.attempted*100:0,errorRate:t.attempted?t.wrong/t.attempted*100:0}));
 const weakTopics=topics.filter(t=>t.attempted>0).sort((a,b)=>b.errorRate-a.errorRate||b.wrong-a.wrong||b.attempted-a.attempted).slice(0,10);
 const strongTopics=topics.filter(t=>t.attempted>0).sort((a,b)=>b.accuracy-a.accuracy||b.correct-a.correct).slice(0,5);
 const sections=[...sectionMap.values()].map(s=>({...s,accuracy:(s.correct+s.wrong)?s.correct/(s.correct+s.wrong)*100:0}));

 return{tests,totalScore,totalMax,averageAccuracy,bestScorePercent,correct,wrong,unattempted,totalTimeSeconds,
  averageTimeSeconds:tests?totalTimeSeconds/tests:0,weakTopics,strongTopics,sections,recent:rows.slice(0,8)};
}
function getState(key){return db.prepare('SELECT value FROM worker_state WHERE key=?').get(key)?.value||null} function setState(key,value){db.prepare(`INSERT INTO worker_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP`).run(key,String(value))}

function checkpointKey(p){
  return [p.examId,p.stage,p.testType,p.section||'',p.language].join('|||');
}
function getGenerationCheckpoint(p){
  const row=db.prepare('SELECT questions_json FROM generation_checkpoints WHERE pool_key=?').get(checkpointKey(p));
  if(!row)return [];
  try{return JSON.parse(row.questions_json)||[]}catch{return []}
}
function saveGenerationCheckpoint(p,questions){
  db.prepare(`INSERT INTO generation_checkpoints(pool_key,exam_id,stage,test_type,section,language,questions_json)
    VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(pool_key) DO UPDATE SET questions_json=excluded.questions_json,updated_at=CURRENT_TIMESTAMP`)
    .run(checkpointKey(p),p.examId,p.stage,p.testType,p.section||'',p.language,JSON.stringify(questions||[]));
}
function clearGenerationCheckpoint(p){
  db.prepare('DELETE FROM generation_checkpoints WHERE pool_key=?').run(checkpointKey(p));
}

function importQuestions(items){
 const insert=db.prepare(`INSERT OR IGNORE INTO question_bank
 (id,exam_id,stage,section_id,section_name,language,topic,subtopic,difficulty,question,options_json,answer,solution,short_trick,source,group_id,group_type,shared_stem,group_order)
 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
 const tx=db.transaction(rows=>{
  let added=0,skipped=0;
  for(const q of rows){
   const options=Array.isArray(q.options)?q.options.map(String):[];
   const answer=Number(q.answer);
   if(!q.question||!q.sectionId||![4,5].includes(options.length)||!Number.isInteger(answer)||answer<0||answer>=options.length){skipped++;continue}
   const info=insert.run(q.id||id(),q.examId||'',q.stage||'',q.sectionId,String(q.sectionName||q.section||q.sectionId),
    String(q.language||'ENGLISH').toUpperCase(),q.topic||'',q.subtopic||'',String(q.difficulty||'MEDIUM').toUpperCase(),
    q.question,JSON.stringify(options),answer,q.solution||'',q.shortTrick||'',q.source||'MASTER_BANK',
    q.groupId||'',String(q.groupType||'').toUpperCase(),q.sharedStem||'',Number(q.groupOrder||0));
   if(info.changes)added++;else skipped++;
  } return{added,skipped};
 }); return tx(items||[]);
}

function bankCounts(){
 return db.prepare(`SELECT section_id sectionId,section_name sectionName,language,difficulty,COUNT(*) count
 FROM question_bank WHERE active=1 GROUP BY section_id,section_name,language,difficulty ORDER BY section_name,language,difficulty`).all();
}

const BANKING_EXAMS = new Set(['ibps-clerk', 'sbi-clerk', 'rbi-assistant', 'ibps-rrb-clerk', 'sbi-po']);
const SSC_EXAMS = new Set(['ssc-cgl', 'ssc-chsl', 'ssc-cpo', 'ssc-gd']);
const RAILWAY_EXAMS = new Set(['rrb-ntpc-graduate', 'rrb-ntpc-ug', 'rrb-group-d', 'rrb-alp', 'rrb-technician-3']);

function getBankCandidates(userId, { examId, stage, sectionId, language }) {
  const lang = String(language || 'ENGLISH').toUpperCase();
  
  // Section aliases (e.g. quant and numerical are identical subjects)
  let secList = [sectionId];
  if (['quant', 'numerical', 'math'].includes(sectionId)) {
    secList = ['quant', 'numerical', 'math'];
  } else if (['reasoning', 'general-intelligence'].includes(sectionId)) {
    secList = ['reasoning', 'general-intelligence'];
  } else if (['english', 'english-comprehension', 'english-language'].includes(sectionId)) {
    secList = ['english', 'english-comprehension', 'english-language'];
  }
  const secPlaceholders = secList.map(() => '?').join(',');

  // Category exam aliases
  let examList = [examId, ''];
  if (BANKING_EXAMS.has(examId)) {
    examList = [...BANKING_EXAMS, ''];
  } else if (SSC_EXAMS.has(examId)) {
    examList = [...SSC_EXAMS, ''];
  } else if (RAILWAY_EXAMS.has(examId)) {
    examList = [...RAILWAY_EXAMS, ''];
  }
  const examPlaceholders = examList.map(() => '?').join(',');

  // 1. Try exact exam & section match first
  let rows = db.prepare(`
    SELECT qb.*, (usq.question_id IS NOT NULL) AS seen
    FROM question_bank qb
    LEFT JOIN user_seen_questions usq ON usq.user_id=? AND usq.question_id=qb.id
    WHERE qb.active=1 AND qb.section_id IN (${secPlaceholders}) AND qb.language=?
      AND (qb.exam_id='' OR qb.exam_id=?)
    ORDER BY seen ASC, RANDOM()`).all(userId, ...secList, lang, examId);

  // 2. Supplement from category-compatible exams if count is below 40
  if (rows.length < 40) {
    const existingIds = new Set(rows.map(r => r.id));
    const extra = db.prepare(`
      SELECT qb.*, (usq.question_id IS NOT NULL) AS seen
      FROM question_bank qb
      LEFT JOIN user_seen_questions usq ON usq.user_id=? AND usq.question_id=qb.id
      WHERE qb.active=1 AND qb.section_id IN (${secPlaceholders}) AND qb.language=?
        AND qb.exam_id IN (${examPlaceholders})
      ORDER BY seen ASC, RANDOM() LIMIT 150`).all(userId, ...secList, lang, ...examList);
    for (const r of extra) {
      if (!existingIds.has(r.id)) {
        existingIds.add(r.id);
        rows.push(r);
      }
    }
  }

  // 3. Fallback across all active question bank items for that section and language if still low
  if (rows.length < 30) {
    const existingIds = new Set(rows.map(r => r.id));
    const extra = db.prepare(`
      SELECT qb.*, (usq.question_id IS NOT NULL) AS seen
      FROM question_bank qb
      LEFT JOIN user_seen_questions usq ON usq.user_id=? AND usq.question_id=qb.id
      WHERE qb.active=1 AND qb.section_id IN (${secPlaceholders}) AND qb.language=?
      ORDER BY seen ASC, RANDOM() LIMIT 150`).all(userId, ...secList, lang);
    for (const r of extra) {
      if (!existingIds.has(r.id)) {
        existingIds.add(r.id);
        rows.push(r);
      }
    }
  }

  return rows.map(r => ({
    id: r.id, sectionId: r.section_id, section: r.section_name, topic: r.topic, subtopic: r.subtopic,
    difficulty: String(r.difficulty || 'MEDIUM').toUpperCase(), question: r.question,
    options: JSON.parse(r.options_json), answer: r.answer, solution: r.solution, shortTrick: r.short_trick,
    groupId: r.group_id || '', groupType: r.group_type || '', sharedStem: r.shared_stem || '',
    groupOrder: Number(r.group_order || 0), seen: !!r.seen
  }));
}

module.exports={db,createUser,getUserByIdentifier,getUserById,savePaper,readyCount,allocatePaper,paperById,startAttempt,submitAttempt,history,attemptDetail,stats,getState,setState,getGenerationCheckpoint,saveGenerationCheckpoint,clearGenerationCheckpoint,importQuestions,bankCounts,getBankCandidates};
