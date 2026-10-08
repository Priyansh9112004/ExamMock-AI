require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { routes, requireAuth } = require('./auth');
const { EXAMS } = require('./exam-config');
const db = require('./database');
const { buildInstantPaper } = require('./bank-engine');
const { gradeAttempt } = require('./grading');
const { userError } = require('./errors');
const poolWorker = require('./pool-worker');
const { explainQuestionWithAI } = require('./generator');

const app = express();
const PORT = Number(process.env.PORT || 3000);

if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => { req.body ??= {}; next(); }); // Express 5: body undefined ho sakti hai
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Slow down.' }
}));

function publicQuestion(q) {
  const { answer, solution, shortTrick, ...rest } = q;
  return rest;
}

function paperDuration(cfg, testType, qCount) {
  const full = Number(cfg?.duration) || 3600;
  if (!cfg || testType !== 'sectional') return full;
  const total = cfg.sections.reduce((s, x) => s + Number(x.count || 0), 0) || qCount;
  return Math.max(600, Math.round(full * qCount / total));
}

function cleanPaper(row, attemptId) {
  const cfg = EXAMS[`${row.exam_id}|${row.stage}`];
  let questions = row.questions || row.questions_json;
  if (typeof questions === 'string') {
    try { questions = JSON.parse(questions); } catch { questions = []; }
  }
  if (!Array.isArray(questions)) questions = [];

  return {
    attemptId: attemptId || row.attempt_id || row.id,
    paperId: row.paper_id || row.paperId || row.id,
    examId: row.exam_id,
    exam: row.exam_name,
    stage: row.stage,
    testType: row.test_type,
    section: row.section,
    language: row.language,
    duration: paperDuration(cfg, row.test_type, questions.length),
    questions: questions.map(publicQuestion)
  };
}

function sendError(res, e) {
  if (e.expose) return res.status(e.status || 400).json({ ok: false, code: e.code, error: e.message });
  console.error('[API]', e);
  res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
}

routes(app);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/exams', (req, res) => res.json({ ok: true, exams: Object.values(EXAMS) }));
app.get('/api/question-bank/counts', requireAuth, async (req, res) => res.json({ ok: true, counts: await db.bankCounts() }));

app.post('/api/start-mock', requireAuth, async (req, res) => {
  try {
    const isSectional = req.body.testType === 'sectional';
    const p = {
      examId: String(req.body.examId || ''),
      stage: String(req.body.stage || ''),
      testType: isSectional ? 'sectional' : 'full',
      section: isSectional ? String(req.body.section || '') : '',
      language: String(req.body.language || 'ENGLISH').toUpperCase() === 'HINDI' ? 'HINDI' : 'ENGLISH',
      mode: String(req.body.mode || '')
    };

    // 1. Instant allocation from pre-generated Gemini paper pool in PostgreSQL (<5ms)
    let row = await db.allocatePaper(req.auth.sub, p);
    if (row) {
      console.log(`[ALLOCATE] Instant match from ready pool! Served paper ${row.id} for ${p.examId} | ${p.stage}`);
      // Immediately queue background replenishment so pool ALWAYS maintains 2 ready papers!
      poolWorker.requestReplenish(p);
    } else {
      console.log(`[ALLOCATE] Pool empty for ${p.examId} | ${p.stage}, assembling instant paper...`);
      row = await buildInstantPaper(req.auth.sub, p);
      poolWorker.requestReplenish(p);
    }

    const attemptId = await db.startAttempt(req.auth.sub, row.id);
    res.json({ ok: true, paper: cleanPaper(row, attemptId) });
  } catch (e) { sendError(res, e); }
});

// Real-time progress auto-saver: saves every answer click & draft to Neon PostgreSQL
app.post('/api/attempt/:id/sync', requireAuth, async (req, res) => {
  try {
    const attemptId = Number(req.params.id);
    if (!Number.isInteger(attemptId)) throw userError('Invalid attempt');
    await db.saveDraftProgress(req.auth.sub, attemptId, {
      draftAnswers: req.body.draftAnswers || req.body.answers,
      currentQuestionIndex: req.body.currentQuestionIndex,
      totalTimeSeconds: req.body.totalTimeSeconds
    });
    res.json({ ok: true, synced: true });
  } catch (e) { sendError(res, e); }
});

// Check if user has an ongoing unfinished/unsolved test to resume
app.get('/api/active-attempt', requireAuth, async (req, res) => {
  try {
    const active = await db.getActiveAttempt(req.auth.sub);
    if (!active) return res.json({ ok: true, active: null });
    const cfg = EXAMS[`${active.exam_id}|${active.stage}`];
    res.json({
      ok: true,
      active: {
        ...cleanPaper(active, active.id),
        draftAnswers: active.draftAnswers || {},
        currentQuestionIndex: active.current_question_index || 0,
        totalTimeSeconds: active.total_time_seconds || 0
      }
    });
  } catch (e) { sendError(res, e); }
});

app.post('/api/ai-explain', requireAuth, async (req, res) => {
  try {
    const { attemptId, questionIndex, question, options, selectedAnswer, correctAnswer, language, topic, section } = req.body;
    if (!question || !Array.isArray(options)) throw userError('Invalid question payload');

    // Check if already cached in DB for this attempt
    if (attemptId && Number.isInteger(Number(questionIndex))) {
      const a = await db.attemptDetail(req.auth.sub, Number(attemptId));
      if (a && a.answers && a.answers[Number(questionIndex)] && a.answers[Number(questionIndex)].aiExplanation) {
        return res.json({ ok: true, explanation: a.answers[Number(questionIndex)].aiExplanation, cached: true });
      }
    }

    const explanation = await explainQuestionWithAI({
      question,
      options,
      selectedAnswer,
      correctAnswer,
      language: language || 'ENGLISH',
      topic: topic || '',
      section: section || ''
    });

    if (attemptId && Number.isInteger(Number(questionIndex))) {
      await db.saveAiExplanation(req.auth.sub, Number(attemptId), Number(questionIndex), explanation);
    }

    res.json({ ok: true, explanation, cached: false });
  } catch (e) { sendError(res, e); }
});

app.post('/api/submit-result', requireAuth, async (req, res) => {
  try {
    const attemptId = Number(req.body.attemptId);
    if (!Number.isInteger(attemptId)) throw userError('Invalid attempt');
    const result = await db.submitAttempt(req.auth.sub, attemptId, (questions, a) => {
      const cfg = EXAMS[`${a.exam_id}|${a.stage}`];
      return gradeAttempt(questions, req.body.responses ?? req.body.answers, {
        cfg, startedAt: a.started_at, durationSec: paperDuration(cfg, a.test_type, questions.length)
      });
    });
    res.json({ ok: true, attemptId, result });
  } catch (e) { sendError(res, e); }
});

app.get('/api/history', requireAuth, async (req, res) => res.json({ ok: true, attempts: await db.history(req.auth.sub) }));

app.get('/api/attempt/:id', requireAuth, async (req, res) => {
  const a = await db.attemptDetail(req.auth.sub, Number(req.params.id));
  if (!a) return res.status(404).json({ ok: false, error: 'Attempt not found' });
  if (!a.submitted_at) {
    const paper = {
      ...cleanPaper(a, a.id),
      draftAnswers: a.draftAnswers || {},
      currentQuestionIndex: a.current_question_index || 0,
      totalTimeSeconds: a.total_time_seconds || 0,
      status: a.status
    };
    return res.json({ ok: true, attempt: paper, paper });
  }
  res.json({ ok: true, attempt: a });
});

app.post('/api/attempt/:id/retry', requireAuth, async (req, res) => {
  try {
    const old = await db.attemptDetail(req.auth.sub, Number(req.params.id));
    if (!old) throw userError('Attempt not found', 404);
    const row = await db.paperById(old.paper_id);
    if (!row) throw userError('Paper no longer available', 404);
    const attemptId = await db.startAttempt(req.auth.sub, row.id);
    res.json({ ok: true, paper: cleanPaper(row, attemptId) });
  } catch (e) { sendError(res, e); }
});

app.get('/api/performance', requireAuth, async (req, res) => res.json({ ok: true, stats: await db.stats(req.auth.sub) }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.htm')));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'Invalid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'Request too large' });
  console.error('[SERVER]', err);
  res.status(500).json({ ok: false, error: 'Server error' });
});

const server = app.listen(PORT, () => {
  console.log(`ExamMock AI running on http://localhost:${PORT}`);
  poolWorker.start();
});
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => { db.db.close(); process.exit(0); }));
}
