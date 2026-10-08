require('dotenv').config();
const { EXAMS } = require("./exam-config");
const { readyCount, savePaper, getState, setState, importQuestions } = require("./database");
const { generatePaper } = require("./generator");
const { parseRetryMs, isRateLimit } = require("./retry-utils");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let running = false;
let timer = null;

const POOL_TARGET = Math.max(2, Number(process.env.POOL_TARGET || 2));

// Top exams priority order for automatic 2-paper buffer
const PRIORITY_POOLS = [
  { examId: "ibps-clerk", stage: "Prelims", testType: "full", section: "", language: "ENGLISH" },
  { examId: "ssc-cgl", stage: "Tier-I", testType: "full", section: "", language: "ENGLISH" },
  { examId: "sbi-po", stage: "Prelims", testType: "full", section: "", language: "ENGLISH" },
  { examId: "sbi-clerk", stage: "Prelims", testType: "full", section: "", language: "ENGLISH" },
  { examId: "rrb-ntpc-graduate", stage: "CBT-1", testType: "full", section: "", language: "ENGLISH" },
  { examId: "ibps-clerk", stage: "Prelims", testType: "full", section: "", language: "HINDI" },
  { examId: "ssc-cgl", stage: "Tier-I", testType: "full", section: "", language: "HINDI" },
  { examId: "ssc-chsl", stage: "Tier-I", testType: "full", section: "", language: "ENGLISH" },
  { examId: "rrb-alp", stage: "CBT-1", testType: "full", section: "", language: "ENGLISH" },
  { examId: "ctet", stage: "Paper-I", testType: "full", section: "", language: "ENGLISH" }
];

function pools() {
  const out = [];
  for (const cfg of Object.values(EXAMS)) {
    for (const language of ["ENGLISH", "HINDI"]) {
      out.push({
        examId: cfg.examId,
        stage: cfg.stage,
        testType: "full",
        section: "",
        language
      });
      for (const section of cfg.sections) {
        out.push({
          examId: cfg.examId,
          stage: cfg.stage,
          testType: "sectional",
          section: section.name,
          language
        });
      }
    }
  }
  return out;
}

function label(p) {
  return `${p.examId} | ${p.stage} | ${p.testType} | ${p.section || "FULL"} | ${p.language}`;
}

const urgentQueue = [];

function requestReplenish(p) {
  if (!p || !p.examId || !p.stage) return;
  const target = {
    examId: p.examId,
    stage: p.stage,
    testType: p.testType || "full",
    section: p.section || "",
    language: String(p.language || "ENGLISH").toUpperCase() === "HINDI" ? "HINDI" : "ENGLISH"
  };

  const key = label(target);
  if (!urgentQueue.some(x => label(x) === key)) {
    console.log(`[AUTO-POOL] Replenish request queued for: ${key} (Target: ${POOL_TARGET} papers)`);
    urgentQueue.unshift(target);
  }

  if (!running) {
    schedule(300);
  }
}

function schedule(ms) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    scan().catch(err => console.error("[AUTO-POOL] Scan error:", err));
  }, Math.max(500, Number(ms) || 500));
  timer.unref?.();
}

async function generateAndSave(p) {
  const currentCount = await readyCount(p);
  console.log(`[AUTO-POOL] GENERATING -> ${label(p)} via Gemini (Current ready: ${currentCount}/${POOL_TARGET})...`);

  const paper = await generatePaper(p);
  if (!paper || !paper.id || !Array.isArray(paper.questions) || !paper.questions.length) {
    throw new Error("Generator returned an empty or invalid paper.");
  }

  await savePaper(paper);

  // Import into master question_bank as well
  try {
    await importQuestions(paper.questions.map(q => ({
      examId: paper.examId,
      stage: paper.stage,
      sectionId: q.sectionId,
      sectionName: q.section || q.sectionId,
      language: paper.language,
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
  } catch (err) {
    console.warn('[AUTO-POOL] Question import warning:', err.message);
  }

  const newCount = await readyCount(p);
  console.log(`[AUTO-POOL] READY -> Paper ${paper.id} successfully saved to DB! (Now ready: ${newCount}/${POOL_TARGET})`);
  return paper;
}

async function saveCooldown(err) {
  const requested = parseRetryMs(err) || (60 * 1000);
  const wait = Math.min(requested + 5000, 15 * 60 * 1000);
  const until = Date.now() + wait;

  await setState("pool_cooldown_until", until);
  console.log(`[AUTO-POOL] AI provider rate limited. Retrying pool scan in ${Math.ceil(wait / 1000)}s.`);
  schedule(wait);
}

async function scan() {
  if (running) return;

  if (process.env.POOL_WORKER_ENABLED === "false") {
    console.log("[AUTO-POOL] Worker disabled by environment.");
    return;
  }

  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
    console.log("[AUTO-POOL] No AI provider configured. Set GEMINI_API_KEY in .env.");
    return;
  }

  const cooldownUntil = Number((await getState("pool_cooldown_until")) || 0);
  if (cooldownUntil > Date.now()) {
    const remaining = cooldownUntil - Date.now();
    schedule(remaining);
    return;
  }

  running = true;

  try {
    // 1. Process any urgent replenishment requests first
    while (urgentQueue.length > 0) {
      const p = urgentQueue.shift();
      const count = await readyCount(p);
      if (count < POOL_TARGET) {
        console.log(`[AUTO-POOL] URGENT -> ${label(p)} | ${count}/${POOL_TARGET}`);
        try {
          await generateAndSave(p);
          await sleep(3000);
        } catch (err) {
          if (isRateLimit(err)) {
            await saveCooldown(err);
            return;
          }
          console.error(`[AUTO-POOL] Urgent generation failed for ${label(p)}:`, err?.message || err);
          break;
        }
      }
    }

    // 2. Process priority pools (ensure 2 ready papers for top exams)
    for (const p of PRIORITY_POOLS) {
      const count = await readyCount(p);
      if (count < POOL_TARGET) {
        console.log(`[AUTO-POOL] PRIORITY DEFICIT -> ${label(p)} | ${count}/${POOL_TARGET}`);
        try {
          await generateAndSave(p);
          await sleep(4000);
        } catch (err) {
          if (isRateLimit(err)) {
            await saveCooldown(err);
            return;
          }
          console.error(`[AUTO-POOL] Priority generation failed for ${label(p)}:`, err?.message || err);
          schedule(60 * 1000);
          return;
        }
      }
    }

    // 3. Process general pool list gradually (target: POOL_TARGET)
    const list = pools();
    for (const p of list) {
      const count = await readyCount(p);
      if (count >= POOL_TARGET) continue;

      try {
        console.log(`[AUTO-POOL] GENERAL DEFICIT -> ${label(p)} | ${count}/${POOL_TARGET}`);
        await generateAndSave(p);
        await sleep(5000);
      } catch (err) {
        if (isRateLimit(err)) {
          await saveCooldown(err);
          return;
        }
        console.error(`[AUTO-POOL] Generation failed for ${label(p)}:`, err?.message || err);
        schedule(60 * 1000);
        return;
      }
    }

    console.log(`[AUTO-POOL] All active pools checked. Target of ${POOL_TARGET} ready papers satisfied.`);
    schedule(3 * 60 * 1000); // Check again in 3 minutes
  } finally {
    running = false;
  }
}

function start() {
  console.log(`[AUTO-POOL] Auto-replenish pool worker started. Maintaining at least ${POOL_TARGET} ready papers per exam.`);
  console.log(`[AUTO-POOL] Providers -> Gemini: ${process.env.GEMINI_API_KEY ? "ON" : "OFF"}`);
  setState("pool_cooldown_until", "0").catch(() => {});
  schedule(2000);
}

module.exports = { start, scan, pools, requestReplenish, POOL_TARGET };
