require('dotenv').config();
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

const { generatePaper, generateSectionBatch, normalizeQuestion } = require('./generator');

async function buildInstantPaper(userId, p) {
  const cfg = EXAMS[`${p.examId}|${p.stage}`];
  if (!cfg) throw userError('Unsupported exam/stage.');

  // Direct 100% Fresh AI Generation via Gemini
  if (p.mode === 'ai' || p.forceAi) {
    try {
      console.log(`[GEMINI-PIPELINE] Generating 100% fresh paper via Gemini AI for ${p.examId} | ${p.stage} (${p.language})...`);
      const aiPaper = await generatePaper({
        examId: p.examId,
        stage: p.stage,
        testType: p.testType,
        section: p.testType === 'sectional' ? p.section : '',
        language: p.language
      });

      db.importQuestions(aiPaper.questions.map(q => ({
        examId: aiPaper.examId,
        stage: aiPaper.stage,
        sectionId: q.sectionId,
        sectionName: q.section || q.sectionId,
        language: aiPaper.language,
        topic: q.topic || '',
        subtopic: q.subtopic || '',
        difficulty: 'MEDIUM',
        question: q.question,
        options: q.options,
        answer: q.answer,
        solution: q.solution || '',
        shortTrick: q.shortTrick || '',
        source: 'GEMINI_AI'
      })));

      db.savePaper(aiPaper);
      return db.paperById(aiPaper.id);
    } catch (err) {
      console.warn(`[GEMINI-PIPELINE] Gemini live generation failed (${err.message}), gracefully serving from ready bank...`);
    }
  }

  let sections = cfg.sections;
  if (p.testType === 'sectional') {
    sections = sections.filter(s => s.id === p.section || s.name === p.section);
    if (!sections.length) throw userError('Invalid section.');
  }

  const questions = [];
  const shortages = [];

  for (const sec of sections) {
    const lang = sec.englishOnly ? 'ENGLISH' : p.language;
    let candidates = db.getBankCandidates(userId, { examId: p.examId, stage: p.stage, sectionId: sec.id, language: lang });
    let picked = (p.mode === 'ai' || p.forceAi) ? null : choose(candidates, sec.count);

    // If shortage or AI mode requested, auto-generate via Gemini pipeline
    if (!picked || candidates.length < sec.count || p.mode === 'ai' || p.forceAi) {
      let attempts = 0;
      while (candidates.length < sec.count && attempts < 3) {
        attempts++;
        const chunkSize = Math.min(8, Math.max(3, sec.count - candidates.length));
        console.log(`[GEMINI-PIPELINE] Generating ${chunkSize} questions for ${cfg.exam} | ${sec.name} (${lang}) via Gemini (round ${attempts})...`);
        try {
          const seen = new Set(candidates.map(c => normalizeQuestion(c.question)));
          const generated = await generateSectionBatch({
            cfg,
            sec,
            language: lang,
            count: chunkSize,
            seen
          });

          if (Array.isArray(generated) && generated.length > 0) {
            db.importQuestions(generated.map(q => ({
              examId: cfg.examId,
              stage: cfg.stage,
              sectionId: sec.id,
              sectionName: sec.name,
              language: lang,
              topic: q.topic || '',
              subtopic: q.subtopic || '',
              difficulty: 'MEDIUM',
              question: q.question,
              options: q.options,
              answer: q.answer,
              solution: q.solution || '',
              shortTrick: q.shortTrick || '',
              source: 'GEMINI_AI'
            })));

            // Refresh candidates from DB
            candidates = db.getBankCandidates(userId, { examId: p.examId, stage: p.stage, sectionId: sec.id, language: lang });
          }
        } catch (err) {
          console.error(`[GEMINI-PIPELINE] Generation failed for ${sec.name}:`, err.message);
          break;
        }
      }
      picked = choose(candidates, sec.count);
    }

    if (!picked) {
      if (candidates.length > 0) {
        // Use all available questions if slightly short
        picked = candidates.slice(0, sec.count);
      } else {
        shortages.push(`${sec.name}: need ${sec.count} ${lang} questions`);
        continue;
      }
    }

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
