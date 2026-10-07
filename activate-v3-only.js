const Database=require('better-sqlite3'),path=require('path');
const db=new Database(path.join(__dirname,'data','exammock.db'));
const tx=db.transaction(()=>{
 db.prepare(`UPDATE question_bank SET active=0 WHERE source IN ('ExamMock Original Master Bank','ExamMock Quality Bank v2')`).run();
 db.prepare(`UPDATE question_bank SET active=1 WHERE source='ExamMock Original Bank - PYQ-pattern inspired' AND exam_id='ibps-clerk' AND stage='Prelims' AND section_id='english'`).run();
 db.prepare(`UPDATE question_bank SET active=1 WHERE source LIKE 'ExamMock v3%'`).run();
});
tx();
console.table(db.prepare(`SELECT source,exam_id examId,stage,section_id sectionId,language,COUNT(*) count FROM question_bank WHERE active=1 GROUP BY source,exam_id,stage,section_id,language ORDER BY exam_id,section_id,source`).all());
db.close();
