require('dotenv').config();
const { db } = require('./database');
const { EXAMS } = require('./exam-config');

const PAPERS = Number(process.env.BANK_PAPERS || 5);
const q = db.prepare(`SELECT COUNT(*) c FROM question_bank WHERE active=1 AND section_id=? AND language=?
  AND (exam_id='' OR exam_id=?) AND (stage='' OR stage=?)`);

for (const cfg of Object.values(EXAMS)) {
  for (const sec of cfg.sections) {
    for (const lang of sec.englishOnly ? ['ENGLISH'] : ['ENGLISH', 'HINDI']) {
      const have = q.get(sec.id, lang, cfg.examId, cfg.stage).c;
      const need = sec.count * PAPERS;
      console.log(`${have === 0 ? 'EMPTY' : have < need ? 'LOW  ' : 'OK   '} ${cfg.exam} | ${cfg.stage} | ${sec.name} | ${lang}: ${have}/${need}`);
    }
  }
}
