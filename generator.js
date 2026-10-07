const OpenAI = require("openai");
const crypto = require("crypto");
const { EXAMS } = require("./exam-config");
const { getGenerationCheckpoint, saveGenerationCheckpoint, clearGenerationCheckpoint } = require("./database");

const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-6-luna";
const REQUEST_TIMEOUT_MS = Math.max(30000, Number(process.env.AI_REQUEST_TIMEOUT_MS || process.env.OPENAI_REQUEST_TIMEOUT_MS || 180000));

let groq = null;
let openai = null;

function groqClient() {
    if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");
    if (!groq) {
        groq = new OpenAI({
            apiKey: process.env.GROQ_API_KEY,
            baseURL: "https://api.groq.com/openai/v1",
            timeout: REQUEST_TIMEOUT_MS,
            maxRetries: 0
        });
    }
    return groq;
}

function openaiClient() {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    if (!openai) {
        openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            timeout: REQUEST_TIMEOUT_MS,
            maxRetries: 0
        });
    }
    return openai;
}

function providerError(provider, err) {
    const e = new Error(`${provider}: ${err?.message || err}`);
    e.status = err?.status;
    e.code = err?.code;
    e.headers = err?.headers;
    e.provider = provider;
    e.cause = err;
    return e;
}


const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function retryAfterMs(err) {
    const headers = err?.headers;
    const get = name => {
        if (!headers) return null;
        if (typeof headers.get === "function") return headers.get(name);
        return headers[name] ?? headers[name.toLowerCase()] ?? null;
    };

    const ms = Number(get("retry-after-ms"));
    if (Number.isFinite(ms) && ms > 0) return ms;

    const sec = Number(get("retry-after"));
    if (Number.isFinite(sec) && sec > 0) return sec * 1000;

    const msg = String(err?.message || "");
    const m = msg.match(/try again in\s+(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?/i);
    if (!m) return null;

    return ((Number(m[1]) || 0) * 3600 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0)) * 1000;
}

function is429(err) {
    return Number(err?.status) === 429 || /rate limit|too many requests/i.test(String(err?.message || ""));
}

async function callGroq(prompt) {
    const maxRetries = Math.max(0, Number(process.env.GROQ_429_RETRIES || 3));

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        console.log(`[GENERATOR] Provider GROQ -> ${GROQ_MODEL}${attempt ? ` | retry ${attempt}/${maxRetries}` : ""}`);
        try {
            const response = await groqClient().chat.completions.create({
                model: GROQ_MODEL,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7,
                response_format: { type: "json_object" }
            });
            return response.choices?.[0]?.message?.content || "";
        } catch (err) {
            const wait = retryAfterMs(err);
            // Short Groq TPM limits should be waited out locally instead of
            // immediately burning the OpenAI fallback quota.
            if (is429(err) && wait != null && wait <= 90_000 && attempt < maxRetries) {
                const delay = Math.max(1500, wait + 1500);
                console.log(`[GENERATOR] GROQ 429 -> waiting ${Math.ceil(delay / 1000)}s, then retrying same request.`);
                await sleep(delay);
                continue;
            }
            throw providerError("GROQ", err);
        }
    }
}

async function callOpenAI(prompt) {
    console.log(`[GENERATOR] Provider OPENAI fallback -> ${OPENAI_MODEL}`);
    try {
        const response = await openaiClient().responses.create({
            model: OPENAI_MODEL,
            input: prompt
        });
        return response.output_text || "";
    } catch (err) {
        throw providerError("OPENAI", err);
    }
}

async function generateText(prompt) {
    let groqErr = null;
    if (process.env.GROQ_API_KEY) {
        try {
            return { text: await callGroq(prompt), provider: "GROQ" };
        } catch (err) {
            groqErr = err;
            console.error(`[GENERATOR] Groq failed: ${err?.status || ""} ${err?.message || err}`);
        }
    }

    if (process.env.OPENAI_API_KEY) {
        try {
            return { text: await callOpenAI(prompt), provider: "OPENAI" };
        } catch (openaiErr) {
            console.error(`[GENERATOR] OpenAI fallback failed: ${openaiErr?.status || ""} ${openaiErr?.message || openaiErr}`);
            const e = new Error(`All AI providers failed. Groq: ${groqErr?.message || "not configured"} | OpenAI: ${openaiErr?.message || openaiErr}`);
            e.status = openaiErr?.status || groqErr?.status;
            e.code = openaiErr?.code || groqErr?.code;
            e.headers = openaiErr?.headers || groqErr?.headers;
            e.providerErrors = [groqErr, openaiErr].filter(Boolean);
            throw e;
        }
    }

    if (groqErr) throw groqErr;
    throw new Error("No AI provider configured. Set GROQ_API_KEY or OPENAI_API_KEY.");
}

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
    let value = String(text || "").trim();

    value = value
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    return JSON.parse(value);
}

function validateQuestion(q) {
    if (!q || typeof q !== "object") return false;
    if (typeof q.question !== "string" || q.question.trim().length < 5) return false;

    if (
        !Array.isArray(q.options) ||
        q.options.length !== 4 ||
        !q.options.every(x => typeof x === "string" && x.trim())
    ) {
        return false;
    }

    if (
        !Number.isInteger(q.answer) ||
        q.answer < 0 ||
        q.answer > 3
    ) {
        return false;
    }

    if (
        typeof q.solution !== "string" ||
        q.solution.trim().length < 3
    ) {
        return false;
    }

    return true;
}

function normalizeQuestion(text) {
    return String(text || "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

async function createBatch({ cfg, sec, language, count, batchNo, totalBatches, previousQuestions }) {
    const previous = previousQuestions
        .slice(-30)
        .map(q => q.question)
        .join("\n");

    const prompt = `
You are creating a high-quality mock test for an Indian competitive examination.

Exam: ${cfg.exam}
Stage: ${cfg.stage}
Section: ${sec.name}
Questions required in this batch: exactly ${count}

${langRule(sec, language)}

Requirements:
1. Match realistic ${cfg.exam} ${cfg.stage} difficulty and style.
2. Create fresh original questions.
3. Do not copy known previous-year questions verbatim.
4. Do not make superficial repeats by merely changing names or numbers.
5. Every question must have exactly four plausible options.
6. "answer" must be an integer 0, 1, 2, or 3 corresponding to the correct option.
7. The answer and solution must be mathematically/logically/factually consistent.
8. Give a useful solution.
9. For Quant/Reasoning, shortTrick should contain a shorter exam method when genuinely useful; otherwise use an empty string.
10. Avoid ambiguous questions.
11. Return ONLY valid JSON. No markdown and no explanation outside JSON.

Return this exact structure:
{
  "questions": [
    {
      "question": "question text",
      "options": ["A", "B", "C", "D"],
      "answer": 0,
      "solution": "clear solution",
      "shortTrick": "",
      "topic": "topic",
      "subtopic": "subtopic"
    }
  ]
}

Questions already created for this paper and therefore forbidden as repeats:
${previous || "None yet."}
`.trim();

    console.log(
        `[GENERATOR] ${cfg.exam} ${cfg.stage} -> ${sec.name} | batch ${batchNo}/${totalBatches} | requesting ${count} questions`
    );

    const started = Date.now();

    let ai;
    try {
        ai = await generateText(prompt);
    } catch (err) {
        console.error(
            `[GENERATOR] AI request failed in ${sec.name} batch ${batchNo}/${totalBatches}: ${err?.status || ""} ${err?.message || err}`
        );
        throw err;
    }

    console.log(
        `[GENERATOR] ${ai.provider} response received for ${sec.name} batch ${batchNo}/${totalBatches} in ${Math.round((Date.now() - started) / 1000)}s`
    );

    const parsed = cleanJson(ai.text);

    // Accept the preferred object wrapper. Also accept an array temporarily
    // for compatibility if the model returns the older format.
    const arr = Array.isArray(parsed)
        ? parsed
        : parsed?.questions;

    if (!Array.isArray(arr)) {
        throw new Error(`Generator returned invalid JSON questions in ${sec.name} batch ${batchNo}.`);
    }

    // Keep every valid unique question the provider returned. If it returned
    // fewer than requested (or some were invalid/duplicates), repair only the
    // missing amount instead of throwing away the whole paper.
    const accepted = [];
    const localSeen = new Set();

    for (const q of arr) {
        if (!validateQuestion(q)) continue;
        const key = normalizeQuestion(q.question);
        if (!key || localSeen.has(key)) continue;
        localSeen.add(key);
        accepted.push(q);
        if (accepted.length === count) break;
    }

    let repairAttempt = 0;
    while (accepted.length < count && repairAttempt < 3) {
        repairAttempt += 1;
        const missing = count - accepted.length;
        console.log(
            `[GENERATOR] REPAIR -> ${sec.name} batch ${batchNo}/${totalBatches} | missing ${missing} | attempt ${repairAttempt}/3`
        );

        const forbidden = [...previousQuestions, ...accepted]
            .slice(-40)
            .map(q => q.question)
            .join("\n");

        const repairPrompt = `
You are repairing an incomplete batch for an Indian competitive exam mock.

Exam: ${cfg.exam}
Stage: ${cfg.stage}
Section: ${sec.name}
Generate exactly ${missing} NEW replacement question${missing === 1 ? "" : "s"}.

${langRule(sec, language)}

Rules:
1. Return ONLY valid JSON in this structure: {"questions":[{"question":"...","options":["A","B","C","D"],"answer":0,"solution":"...","shortTrick":"","topic":"...","subtopic":"..."}]}
2. Every question must have exactly four options.
3. answer must be integer 0-3 and must agree with the solution.
4. Match realistic ${cfg.exam} ${cfg.stage} difficulty.
5. Do not repeat or lightly rewrite any forbidden question below.
6. Create exactly ${missing} questions, no extra text.

Forbidden questions:
${forbidden || "None"}
        `.trim();

        const repairAI = await generateText(repairPrompt);
        const repairParsed = cleanJson(repairAI.text);
        const repairArr = Array.isArray(repairParsed) ? repairParsed : repairParsed?.questions;
        if (!Array.isArray(repairArr)) continue;

        for (const q of repairArr) {
            if (!validateQuestion(q)) continue;
            const key = normalizeQuestion(q.question);
            if (!key || localSeen.has(key)) continue;
            localSeen.add(key);
            accepted.push(q);
            if (accepted.length === count) break;
        }
    }

    if (accepted.length !== count) {
        throw new Error(
            `Batch repair exhausted: got ${accepted.length}/${count} valid unique questions in ${sec.name} batch ${batchNo}.`
        );
    }

    return accepted;
}

async function generatePaper({
    examId,
    stage,
    testType = "full",
    section = "",
    language = "ENGLISH"
}) {
    const cfg = EXAMS[`${examId}|${stage}`];

    if (!cfg) {
        throw new Error(`Unsupported exam/stage: ${examId} | ${stage}`);
    }

    let sections = cfg.sections;

    if (testType === "sectional") {
        sections = sections.filter(s => s.name === section);

        if (!sections.length) {
            throw new Error(`Invalid section: ${section}`);
        }
    }

    console.log(
        `[GENERATOR] START -> ${examId} | ${stage} | ${testType} | ${section || "FULL"} | ${language}`
    );
    console.log(
        `[GENERATOR] Providers: Groq ${GROQ_MODEL} -> OpenAI ${OPENAI_MODEL} fallback | request timeout: ${Math.round(REQUEST_TIMEOUT_MS / 1000)}s`
    );

    const checkpointParams = { examId, stage, testType, section: testType === "sectional" ? section : "", language };
    const questions = getGenerationCheckpoint(checkpointParams);
    const seen = new Set(questions.map(q => normalizeQuestion(q.question)));

    if (questions.length) {
        console.log(`[GENERATOR] RESUME -> restored ${questions.length} checkpointed questions.`);
    }

    for (const sec of sections) {
        const totalBatches = Math.ceil(sec.count / 10);
        const already = questions.filter(q => q.sectionId === sec.id || q.section === sec.name).length;
        let left = Math.max(0, sec.count - already);
        let batchNo = Math.floor(already / 10);

        if (already) {
            console.log(`[GENERATOR] Checkpoint -> ${sec.name} already has ${already}/${sec.count}.`);
        }

        console.log(
            `[GENERATOR] Section start -> ${sec.name} | ${sec.count} questions | ${totalBatches} batches`
        );

        while (left > 0) {
            batchNo += 1;
            const n = Math.min(left, 10);

            const batch = await createBatch({
                cfg,
                sec,
                language,
                count: n,
                batchNo,
                totalBatches,
                previousQuestions: questions
            });

            for (const q of batch) {
                const normalized = normalizeQuestion(q.question);

                if (seen.has(normalized)) {
                    throw new Error(
                        `Duplicate question detected in ${sec.name} batch ${batchNo}. Paper was NOT saved.`
                    );
                }

                seen.add(normalized);

                questions.push({
                    ...q,
                    shortTrick: typeof q.shortTrick === "string" ? q.shortTrick : "",
                    topic: typeof q.topic === "string" ? q.topic : "",
                    subtopic: typeof q.subtopic === "string" ? q.subtopic : "",
                    sectionId: sec.id,
                    section: sec.name,
                    positive: Number(sec.positive ?? cfg.positive ?? 1),
                    negative: Number(sec.negative ?? cfg.negative ?? 0)
                });
            }

            left -= n;

            saveGenerationCheckpoint(checkpointParams, questions);
            console.log(`[GENERATOR] CHECKPOINT SAVED -> ${questions.length} questions.`);

            console.log(
                `[GENERATOR] Batch complete -> ${sec.name} ${batchNo}/${totalBatches} | paper total ${questions.length}`
            );

            const batchDelay = Math.max(0, Number(process.env.GROQ_BATCH_DELAY_MS || 20000));
            if (left > 0 && batchDelay > 0) {
                console.log(`[GENERATOR] Quota pacing -> waiting ${Math.ceil(batchDelay / 1000)}s before next batch.`);
                await sleep(batchDelay);
            }
        }

        console.log(`[GENERATOR] Section complete -> ${sec.name}`);
    }

    const expected = sections.reduce((sum, sec) => sum + sec.count, 0);

    if (questions.length !== expected) {
        throw new Error(
            `Paper incomplete: expected ${expected} questions, got ${questions.length}. Paper was NOT saved.`
        );
    }

    const paper = {
        id: crypto.randomUUID(),
        examId,
        examName: cfg.exam,
        stage,
        testType,
        section: testType === "sectional" ? section : "",
        language,
        questions
    };

    clearGenerationCheckpoint(checkpointParams);

    console.log(
        `[GENERATOR] COMPLETE -> ${paper.id} | ${questions.length} questions`
    );

    return paper;
}

module.exports = { generatePaper };
