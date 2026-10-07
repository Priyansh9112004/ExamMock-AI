// ExamMock Quality v2 activation helper.
// Run once: node activate-quality-v2.js
const Database=require('better-sqlite3');
const path=require('path');
const db=new Database(path.join(__dirname,'data','exammock.db'));
db.pragma('foreign_keys = ON');

const tx=db.transaction(()=>{
  // Keep the original IBPS English bank active; deactivate the old speed batch for the six replaced sections.
  const replaced=[
    ['ibps-clerk','Prelims','numerical'],
    ['ibps-clerk','Prelims','reasoning'],
    ['ssc-cgl','Tier-I','quant'],
    ['ssc-cgl','Tier-I','reasoning'],
    ['ssc-cgl','Tier-I','english'],
    ['ssc-cgl','Tier-I','ga']
  ];
  const off=db.prepare(`UPDATE question_bank SET active=0
    WHERE exam_id=? AND stage=? AND section_id=? AND source<>'ExamMock Quality Bank v2'`);
  for(const x of replaced) off.run(...x);

  // Make sure v2 is active.
  db.prepare(`UPDATE question_bank SET active=1 WHERE source='ExamMock Quality Bank v2'`).run();

  // Preserve the separately-built IBPS English bank.
  db.prepare(`UPDATE question_bank SET active=1
    WHERE exam_id='ibps-clerk' AND stage='Prelims' AND section_id='english'
      AND source<>'ExamMock Original Master Bank'`).run();
});
tx();

const rows=db.prepare(`SELECT exam_id examId,stage,section_id sectionId,section_name sectionName,
 source,difficulty,COUNT(*) count
 FROM question_bank WHERE active=1
 GROUP BY exam_id,stage,section_id,section_name,source,difficulty
 ORDER BY exam_id,section_id,source,difficulty`).all();
console.table(rows);
console.log('\nQuality Bank v2 activated. Old speed-bank questions for replaced sections are inactive, not deleted.');
db.close();
