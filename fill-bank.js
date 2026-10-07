require('dotenv').config();
const { db, importQuestions } = require('./database');
const { EXAMS } = require('./exam-config');
const { generateSectionBatch, normalizeQuestion } = require('./generator');
const { isRateLimit, parseRetryMs } = require('./retry-utils');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean);

const PAPERS = Number(process.env.BANK_PAPERS || 5);
const BATCH = 10;
const LANGS = new Set(list(process.env.BANK_LANGS || 'ENGLISH,HINDI').map(x => x.toUpperCase()));
const SKIP = new Set(list(process.env.SKIP_SECTIONS ?? 'ga,gk'));

const NUM = ['Percentage and ratio', 'Profit, loss and discount', 'Simple and compound interest',
  'Time, speed and distance', 'Time and work, pipes', 'Average, mixture and alligation',
  'Number series', 'Simplification and approximation', 'Quadratic equations',
  'Data interpretation (table/bar/line)', 'Permutation, combination and probability', 'Mensuration'];
const TOPICS = {
  numerical: NUM, quant: NUM, math: NUM,
  reasoning: ['Syllogism', 'Inequality', 'Coding-decoding', 'Blood relations', 'Direction sense',
    'Ranking and order', 'Alphanumeric series', 'Analogy and classification',
    'Statement and conclusion', 'Input-output', 'Data sufficiency', 'Venn diagrams'],
  english: ['Error spotting', 'Fill in the blanks', 'Synonyms and antonyms', 'Para jumbles',
    'Sentence improvement', 'Idioms and phrases', 'One-word substitution',
    'Spelling and word usage', 'Active/passive and narration', 'Vocabulary in context']
};
const topicFor = (secId, n) => { const t = TOPICS[secId]; return t ? t[n % t.length] : ''; };

const countStmt = db.prepare(`SELECT COUNT(*) c FROM question_bank WHERE active=1 AND section_id=? AND language=?
  AND (exam_id='' OR exam_id=?) AND (stage='' OR stage=?)`);
const existingStmt = db.prepare('SELECT question FROM question_bank WHERE section_id=? AND language=?');

async function fillSection(cfg, sec, language) {
  const need = sec.count * PAPERS;
  let have = countStmt.get(sec.id, language, cfg.examId, cfg.stage).c;
  if (have >= need) return;

  const seen = new Set(existingStmt.all(sec.id, language).map(r => normalizeQuestion(r.question)));
  const recent = [];
  let n = Math.floor(Math.random() * 100), emptyRounds = 0, failures = 0;
  console.log(`\n${cfg.exam} | ${cfg.stage} | ${sec.name} | ${language}: ${have}/${need}`);

  while (have < need) {
    try {
      const batch = await generateSectionBatch({
        cfg, sec, language, count: Math.min(BATCH, need - have), seen,
        recent: recent.slice(-30), hint: topicFor(sec.id, n++)
      });
      const { added } = importQuestions(batch.map(q => ({
        examId: cfg.examId, stage: cfg.stage, sectionId: sec.id, sectionName: sec.name, language,
        topic: q.topic, subtopic: q.subtopic, difficulty: 'MEDIUM', question: q.question,
        options: q.options, answer: q.answer, solution: q.solution, shortTrick: q.shortTrick, source: 'AI_GEN'
      })));
      for (const q of batch) { seen.add(normalizeQuestion(q.question)); recent.push(q); }
      have += added; failures = 0;
      emptyRounds = added ? 0 : emptyRounds + 1;
      console.log(`  +${added} -> ${have}/${need}`);
      if (emptyRounds >= 3) { console.log('  duplicates hi aa rahe hain, section skip'); return; }
      await sleep(Number(process.env.AI_BATCH_DELAY_MS || 6000));
    } catch (err) {
      if (isRateLimit(err)) {
        const wait = Math.min(parseRetryMs(err) ?? 3600_000, 6 * 3600_000) + 5000;
        console.log(`  rate limit: ${Math.ceil(wait / 60000)} min wait (Ctrl+C se rok sakte ho, dobara chalane par resume hoga)`);
        await sleep(wait);
        continue;
      }
      console.error('  batch failed:', err.message);
      if (++failures >= 3) { console.log('  3 baar fail, section skip'); return; }
      await sleep(10_000);
    }
  }
}

async function main() {
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error('Koi AI key set nahi hai (.env me GEMINI_API_KEY daalo)');
  }
  const only = new Set(process.argv.slice(2));
  for (const cfg of Object.values(EXAMS)) {
    if (only.size && !only.has(cfg.examId)) continue;
    for (const sec of cfg.sections) {
      if (SKIP.has(sec.id)) { console.log(`skip: ${cfg.exam} | ${sec.name} (SKIP_SECTIONS)`); continue; }
      const langs = (sec.englishOnly ? ['ENGLISH'] : ['ENGLISH', 'HINDI']).filter(l => LANGS.has(l));
      for (const language of langs) await fillSection(cfg, sec, language);
    }
  }
  console.log('\nDone. Coverage: node bank-coverage.js   |   Review: node review-sample.js 5');
}
main().catch(e => { console.error(e); process.exit(1); });
