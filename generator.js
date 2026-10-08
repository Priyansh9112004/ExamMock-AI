require('dotenv').config();
const OpenAI = require("openai");
const crypto = require("crypto");
const { EXAMS } = require("./exam-config");
const { getGenerationCheckpoint, saveGenerationCheckpoint, clearGenerationCheckpoint } = require("./database");
const { parseRetryMs, isRateLimit } = require("./retry-utils");

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";
const REQUEST_TIMEOUT_MS = Math.max(30000, Number(process.env.AI_REQUEST_TIMEOUT_MS || 180000));

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const parseList = s => String(s || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);

// ---------- providers ----------
const clients = {};
function compatClient(key, envName, baseURL) {
  if (!process.env[envName]) throw new Error(`${envName} is not configured`);
  clients[key] ??= new OpenAI({ apiKey: process.env[envName], baseURL, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });
  return clients[key];
}
const geminiClient = () => compatClient("gemini", "GEMINI_API_KEY", "https://generativelanguage.googleapis.com/v1beta/openai/");
const groqClient = () => compatClient("groq", "GROQ_API_KEY", "https://api.groq.com/openai/v1");
const openaiClient = () => compatClient("openai", "OPENAI_API_KEY", undefined);

function providerError(provider, err) {
  const e = new Error(`${provider}: ${err?.message || err}`);
  e.status = err?.status; e.code = err?.code; e.headers = err?.headers; e.provider = provider; e.cause = err;
  return e;
}

async function chatWithRetry(name, getClient, model, prompt, extra = {}) {
  const maxRetries = Math.max(0, Number(process.env.AI_429_RETRIES || 3));
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    console.log(`[GENERATOR] Provider ${name} -> ${model}${attempt ? ` | retry ${attempt}/${maxRetries}` : ""}`);
    try {
      const res = await getClient().chat.completions.create({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }, // Gemini 400 de to sirf ye line hata do
        ...extra
      });
      return res.choices?.[0]?.message?.content || "";
    } catch (err) {
      const wait = parseRetryMs(err);
      if (isRateLimit(err) && wait != null && wait <= 90_000 && attempt < maxRetries) {
        const delay = Math.max(1500, wait + 1500);
        console.log(`[GENERATOR] ${name} 429 -> waiting ${Math.ceil(delay / 1000)}s, retrying.`);
        await sleep(delay);
        continue;
      }
      throw providerError(name, err);
    }
  }
}

async function callOpenAI(prompt) {
  console.log(`[GENERATOR] Provider OPENAI -> ${OPENAI_MODEL}`);
  try {
    const response = await openaiClient().responses.create({ model: OPENAI_MODEL, input: prompt });
    return response.output_text || "";
  } catch (err) { throw providerError("OPENAI", err); }
}

const PROVIDERS = {
  gemini: { has: () => !!process.env.GEMINI_API_KEY, call: p => chatWithRetry("GEMINI", geminiClient, GEMINI_MODEL, p) },
  groq:   { has: () => !!process.env.GROQ_API_KEY,   call: (p, o) => chatWithRetry("GROQ", groqClient, GROQ_MODEL, p, { temperature: o.temperature ?? 0.7 }) },
  openai: { has: () => !!process.env.OPENAI_API_KEY, call: p => callOpenAI(p) }
};
const configured = names => names.filter(n => PROVIDERS[n]?.has());

async function generateText(prompt, opts = {}) {
  let order = opts.providers ? configured(opts.providers.map(x => x.trim().toLowerCase())) : [];
  if (!order.length) order = configured(parseList(process.env.AI_PROVIDERS || "gemini,groq,openai"));
  if (!order.length) throw new Error("No AI provider configured. Set GEMINI_API_KEY (or GROQ_API_KEY / OPENAI_API_KEY).");

  const errors = [];
  for (const name of order) {
    try {
      return { text: await PROVIDERS[name].call(prompt, opts), provider: name.toUpperCase() };
    } catch (err) {
      errors.push(err);
      console.error(`[GENERATOR] ${name} failed: ${err?.status || ""} ${err?.message || err}`);
    }
  }
  const e = new Error(`All AI providers failed. ${errors.map(x => x.message).join(" | ")}`);
  const allLimited = errors.every(isRateLimit);
  e.status = allLimited ? 429 : errors[errors.length - 1]?.status;
  const waits = errors.map(parseRetryMs).filter(Number.isFinite);
  if (allLimited && waits.length) e.retryAfterMs = Math.min(...waits);
  e.providerErrors = errors;
  throw e;
}

// ---------- helpers ----------
function langRule(section, language) {
  if (section.englishOnly) {
    return "This is an English-language section. Write the question, options, solution and short trick in English only.";
  }
  if (section.languageSubject) {
    return language === "HINDI"
      ? "This is a language-subject section. Create an exam-appropriate Hindi-language question in natural Devanagari."
      : "This is a language-subject section. Create an exam-appropriate English-language question.";
  }
  if (language === "HINDI") {
    return "Write the question, options, solution and short trick in natural exam-standard Hindi (Devanagari). Keep standard mathematical notation where appropriate.";
  }
  return "Write the question, options, solution and short trick in English.";
}

function cleanJson(text) {
  let str = String(text || "").trim();
  const codeBlockMatch = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    str = codeBlockMatch[1].trim();
  } else {
    const firstBrace = str.indexOf('{');
    const firstBracket = str.indexOf('[');
    let startIdx = -1;
    let endIdx = -1;
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
      endIdx = str.lastIndexOf('}');
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
      endIdx = str.lastIndexOf(']');
    }
    if (startIdx !== -1 && endIdx > startIdx) {
      str = str.slice(startIdx, endIdx + 1);
    }
  }
  try {
    return JSON.parse(str);
  } catch (err) {
    // Remove trailing commas before closing braces/brackets
    const sanitized = str.replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(sanitized);
  }
}

function normalizeQuestion(text) {
  return String(text || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

const STRICT_SECTIONS = new Set(["numerical", "quant", "math", "reasoning"]);

function validateQuestion(q, optionCount = 4) {
  if (!q || typeof q !== "object") return false;
  if (typeof q.question !== "string" || q.question.trim().length < 5) return false;
  if (!Array.isArray(q.options) || q.options.length !== optionCount ||
      !q.options.every(x => typeof x === "string" && x.trim())) return false;
  if (new Set(q.options.map(x => x.trim().toLowerCase())).size !== optionCount) return false;
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= optionCount) return false;
  if (typeof q.solution !== "string" || q.solution.trim().length < 3) return false;
  return true;
}

function buildPrompt({ cfg, sec, language, count, optionCount, forbidden, hint }) {
  const opts = Array(optionCount).fill('"option text"').join(",");
  return `
You are creating a high-quality mock test for an Indian competitive examination.
Exam: ${cfg.exam}
Stage: ${cfg.stage}
Section: ${sec.name}
Questions required: exactly ${count}
${langRule(sec, language)}
${hint ? `Focus this batch on these topics: ${hint}.` : ""}

Requirements:
1. Match realistic ${cfg.exam} ${cfg.stage} difficulty and style.
2. Create fresh original questions; do not copy previous-year questions verbatim.
3. Every question has exactly ${optionCount} plausible, distinct options and exactly one correct option.
4. "answer" is the integer index (0 to ${optionCount - 1}) of the correct option.
5. Keep solutions crisp and direct (1-2 sentences).
6. shortTrick: brief faster exam trick if applicable, else "".
7. Return ONLY valid JSON, no markdown.

Return this exact structure:
{"questions":[{"question":"...","options":[${opts}],"answer":0,"solution":"...","shortTrick":"","topic":"...","subtopic":"..."}]}
`.trim();
}

// Doosra independent pass: answer match na ho to question drop
async function verifyBatch({ cfg, sec, questions, optionCount }) {
  if (process.env.VERIFY_ANSWERS !== "true" || !questions.length) return questions;
  const listing = questions.map((q, i) =>
    `Q${i + 1}. ${q.question}\n` + q.options.map((o, k) => `  ${k}) ${o}`).join("\n")).join("\n\n");
  const prompt = `Solve each ${cfg.exam} ${sec.name} question below independently and carefully.
For each, return the index (0-${optionCount - 1}) of the correct option, or -1 if no option or more than one option is correct.
Return ONLY JSON: {"answers":[<int>, ...]} with exactly ${questions.length} entries, in order.

${listing}`;
  try {
    const ai = await generateText(prompt, { temperature: 0, providers: parseList(process.env.VERIFY_PROVIDERS) });
    const arr = cleanJson(ai.text)?.answers;
    if (!Array.isArray(arr) || arr.length !== questions.length) return questions;
    const ok = questions.filter((q, i) => Number(arr[i]) === q.answer);
    console.log(`[GENERATOR] VERIFY ${sec.name}: kept ${ok.length}/${questions.length}`);
    return ok;
  } catch (err) {
    if (isRateLimit(err)) throw err;
    console.warn(`[GENERATOR] Verify skipped: ${err?.message || err}`);
    return questions;
  }
}

async function createBatch({ cfg, sec, language, count, batchNo, totalBatches, previousQuestions, seen, hint = "" }) {
  const optionCount = cfg.optionCount || 4;
  const temperature = STRICT_SECTIONS.has(sec.id) ? 0.3 : 0.7;
  const accepted = [];
  const local = new Set();

  for (let round = 1; accepted.length < count && round <= 2; round++) {
    const need = count - accepted.length;
    console.log(`[GENERATOR] ${cfg.exam} ${sec.name} | batch ${batchNo}/${totalBatches} | round ${round} | need ${need}`);

    const ai = await generateText(
      buildPrompt({ cfg, sec, language, count: need, optionCount, hint }), { temperature });

    let arr = null;
    try { const parsed = cleanJson(ai.text); arr = Array.isArray(parsed) ? parsed : parsed?.questions; } catch {}
    if (!Array.isArray(arr)) { console.warn("[GENERATOR] Invalid JSON, retrying round."); continue; }

    for (const q of arr) {
      if (!validateQuestion(q, optionCount)) continue;
      const key = normalizeQuestion(q.question);
      if (!key || local.has(key) || seen.has(key)) continue;
      local.add(key);
      accepted.push(q);
      if (accepted.length === count) break;
    }

    // Fast completion: if round 1 got at least 80% of desired questions, accept immediately
    if (accepted.length >= Math.floor(count * 0.8)) {
      break;
    }
  }

  if (accepted.length === 0) {
    throw new Error(`Batch failed: 0 questions generated for ${sec.name} batch ${batchNo}.`);
  }
  return accepted;
}

// bank filling ke liye: ek section ki ek batch
async function generateSectionBatch({ cfg, sec, language, count, seen, recent = [], hint = "" }) {
  return createBatch({ cfg, sec, language, count, batchNo: 1, totalBatches: 1, previousQuestions: recent, seen, hint });
}

async function generatePaper({ examId, stage, testType = "full", section = "", language = "ENGLISH" }) {
  const cfg = EXAMS[`${examId}|${stage}`];
  if (!cfg) throw new Error(`Unsupported exam/stage: ${examId} | ${stage}`);
  let sections = cfg.sections;
  if (testType === "sectional") {
    sections = sections.filter(s => s.name === section || s.id === section);
    if (!sections.length) throw new Error(`Invalid section: ${section}`);
  }
  const params = { examId, stage, testType, section: testType === "sectional" ? section : "", language };

  // Generate ALL batches of ALL sections completely in parallel for max speed
  const sectionPromises = sections.map(async (sec) => {
    // Partition sec.count into parallel chunks (max 18 questions per chunk)
    const chunks = [];
    let rem = sec.count;
    while (rem > 0) {
      const take = Math.min(rem, 18);
      chunks.push(take);
      rem -= take;
    }

    const chunkResults = await Promise.all(chunks.map((chunkCount, idx) =>
      createBatch({
        cfg,
        sec,
        language,
        count: chunkCount,
        batchNo: idx + 1,
        totalBatches: chunks.length,
        previousQuestions: [],
        seen: new Set(),
        hint: `batch ${idx + 1}`
      })
    ));

    const secQuestions = [];
    for (const batch of chunkResults) {
      for (const q of batch) {
        secQuestions.push({
          ...q,
          shortTrick: typeof q.shortTrick === "string" ? q.shortTrick : "",
          topic: typeof q.topic === "string" ? q.topic : "",
          subtopic: typeof q.subtopic === "string" ? q.subtopic : "",
          sectionId: sec.id, section: sec.name,
          positive: Number(sec.positive ?? cfg.positive ?? 1),
          negative: Number(sec.negative ?? cfg.negative ?? 0)
        });
      }
    }
    return secQuestions;
  });

  const sectionResults = await Promise.all(sectionPromises);
  const questions = sectionResults.flat();
  const expected = sections.reduce((sum, s) => sum + s.count, 0);
  if (!questions.length) throw new Error(`Paper incomplete: expected ${expected}, got 0.`);
  console.log(`[GENERATOR] Fast parallel paper generation complete: ${questions.length}/${expected} questions.`);
  const paper = { id: crypto.randomUUID(), examId, examName: cfg.exam, stage, testType, section: params.section, language, questions };
  return paper;
}

module.exports = { generatePaper, generateSectionBatch, normalizeQuestion };
