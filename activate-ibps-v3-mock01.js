const Database=require('better-sqlite3'),path=require('path');
const db=new Database(path.join(__dirname,'data','exammock.db'));
const src='ExamMock v3 IBPS Clerk Mock 01';
const n=db.prepare(`SELECT COUNT(*) c FROM question_bank WHERE source=?`).get(src).c;
if(n!==100){console.error(`Mock 01 not fully imported. Found ${n}/100 questions. Import JSON first.`);process.exit(1)}
db.prepare(`UPDATE question_bank SET active=0 WHERE exam_id='ibps-clerk' AND stage='Prelims'`).run();
db.prepare(`UPDATE question_bank SET active=1 WHERE source=?`).run(src);
console.table(db.prepare(`SELECT section_name section,COUNT(*) count,SUM(CASE WHEN group_id<>'' THEN 1 ELSE 0 END) grouped FROM question_bank WHERE active=1 AND exam_id='ibps-clerk' AND stage='Prelims' GROUP BY section_name`).all());
console.log('IBPS Clerk v3 Mock 01 activated.');
db.close();
