const round2 = x => Math.round(x * 100) / 100;

function parseSqliteUtc(ts) {
  const t = Date.parse(String(ts || '').replace(' ', 'T') + 'Z');
  return Number.isFinite(t) ? t : Date.now();
}

function gradeAttempt(questions, rawResponses, { cfg, startedAt, durationSec }) {
  const responses = new Map();
  for (const r of Array.isArray(rawResponses) ? rawResponses : []) {
    const idx = Number(r?.questionIndex);
    if (!Number.isInteger(idx) || idx < 0 || idx >= questions.length) continue;
    const raw = r.selectedAnswer;
    const sel = raw === null || raw === undefined || raw === '' ? NaN : Number(raw);
    const valid = Number.isInteger(sel) && sel >= 0 && sel < questions[idx].options.length;
    responses.set(idx, { selected: valid ? sel : null, review: !!r.markedForReview });
  }

  let correct = 0, wrong = 0, score = 0, maxScore = 0;
  const sectionMap = new Map();

  const answers = questions.map((q, n) => {
    const pos = Number(q.positive ?? cfg?.positive ?? 1);
    const neg = Number(q.negative ?? cfg?.negative ?? 0);
    const r = responses.get(n) || { selected: null, review: false };
    const isAttempted = r.selected !== null;
    const isCorrect = isAttempted && r.selected === Number(q.answer);
    const marks = isCorrect ? pos : isAttempted ? -neg : 0;

    if (isCorrect) correct++; else if (isAttempted) wrong++;
    score += marks;
    maxScore += pos;

    const section = q.section || q.sectionId || 'Questions';
    if (!sectionMap.has(section)) {
      sectionMap.set(section, { section, total: 0, correct: 0, wrong: 0, unattempted: 0, score: 0 });
    }
    const s = sectionMap.get(section);
    s.total++; s.score += marks;
    if (!isAttempted) s.unattempted++; else if (isCorrect) s.correct++; else s.wrong++;

    return {
      questionIndex: n, section, topic: q.topic || '', subtopic: q.subtopic || '',
      selectedAnswer: isAttempted ? r.selected : null, correctAnswer: q.answer,
      isAttempted, isCorrect, markedForReview: r.review, marksAwarded: round2(marks),
      question: q.question, options: q.options,
      solution: q.solution || '', shortTrick: q.shortTrick || ''
    };
  });

  const sections = [...sectionMap.values()].map(s => ({
    ...s,
    score: round2(s.score),
    accuracy: (s.correct + s.wrong) ? round2((s.correct / (s.correct + s.wrong)) * 100) : 0
  }));

  const elapsed = Math.round((Date.now() - parseSqliteUtc(startedAt)) / 1000);
  return {
    score: round2(score), maxScore: round2(maxScore),
    correct, wrong, unattempted: questions.length - correct - wrong,
    accuracy: (correct + wrong) ? round2((correct / (correct + wrong)) * 100) : 0,
    totalTimeSeconds: Math.min(durationSec, Math.max(0, elapsed)),
    answers, sections
  };
}

module.exports = { gradeAttempt };
