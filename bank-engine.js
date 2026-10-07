const crypto = require('crypto');
const { EXAMS } = require('./exam-config');
const db = require('./database');
const { userError } = require('./errors');

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toUnits(rows) {
  const singles = [];
  const groups = new Map();
  for (const q of rows) {
    if (!q.groupId) { singles.push([q]); continue; }
    if (!groups.has(q.groupId)) groups.set(q.groupId, []);
    groups.get(q.groupId).push(q);
  }
  const sets = [...groups.values()].map(g => g.sort((a, b) => a.groupOrder - b.groupOrder));
  return [...singles, ...sets];
}

function choose(rows, count) {
  if (rows.length < count) return null;
  const units = toUnits(rows);
  const isFresh = u => u.every(q => !q.seen);
  for (let attempt = 0; attempt < 40; attempt++) {
    const order = [...shuffle(units.filter(isFresh)), ...shuffle(units.filter(u => !isFresh(u)))];
    const chosen = [];
    let total = 0;
    for (const unit of order) {
      if (total + unit.length > count) continue;
      chosen.push(unit);
      total += unit.length;
      if (total === count) return shuffle(chosen).flat();
    }
  }
  return null;
}

function buildInstantPaper(userId, p) {
  const cfg = EXAMS[`${p.examId}|${p.stage}`];
  if (!cfg) throw userError('Unsupported exam/stage.');

  let sections = cfg.sections;
  if (p.testType === 'sectional') {
    sections = sections.filter(s => s.id === p.section || s.name === p.section);
    if (!sections.length) throw userError('Invalid section.');
  }

  const questions = [];
  const shortages = [];
  for (const sec of sections) {
    const lang = sec.englishOnly ? 'ENGLISH' : p.language;
    const candidates = db.getBankCandidates(userId, { examId: p.examId, stage: p.stage, sectionId: sec.id, language: lang });
    const picked = choose(candidates, sec.count);
    if (!picked) { shortages.push(`${sec.name}: need ${sec.count} ${lang} questions`); continue; }
    questions.push(...picked.map(({ seen, ...q }) => ({ ...q, positive: cfg.positive, negative: cfg.negative })));
  }

  if (shortages.length) {
    const e = userError(`Question bank is not ready. ${shortages.join(' | ')}`, 503);
    e.code = 'BANK_INSUFFICIENT';
    throw e;
  }

  const paper = {
    id: crypto.randomUUID(), examId: p.examId, examName: cfg.exam, stage: p.stage,
    testType: p.testType, section: p.testType === 'sectional' ? p.section : '',
    language: p.language, questions
  };
  db.savePaper(paper);
  return db.paperById(paper.id);
}

module.exports = { buildInstantPaper };
