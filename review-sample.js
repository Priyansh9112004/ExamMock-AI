const { db } = require('./database');
const n = Number(process.argv[2] || 5);

const combos = db.prepare(`SELECT DISTINCT exam_id, section_id, language FROM question_bank
  WHERE source='AI_GEN' AND active=1 ORDER BY exam_id, section_id, language`).all();
const pick = db.prepare(`SELECT id, question, options_json, answer, solution FROM question_bank
  WHERE source='AI_GEN' AND active=1 AND exam_id=? AND section_id=? AND language=? ORDER BY RANDOM() LIMIT ?`);

for (const c of combos) {
  console.log(`\n=== ${c.exam_id} | ${c.section_id} | ${c.language} ===`);
  for (const r of pick.all(c.exam_id, c.section_id, c.language, n)) {
    console.log(`\n[${r.id}] ${r.question}`);
    JSON.parse(r.options_json).forEach((o, i) =>
      console.log(`  ${i === r.answer ? '*' : ' '} ${String.fromCharCode(65 + i)}) ${o}`));
    console.log(`  Solution: ${r.solution}`);
  }
}
