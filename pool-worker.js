const { EXAMS } = require("./exam-config");
const { readyCount, savePaper, getState, setState } = require("./database");
const { generatePaper } = require("./generator");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let running = false;
let timer = null;

// User practice priority: prepare these two full mocks first, in this exact order.
const PRIORITY_POOLS = [
    {
        examId: "ibps-clerk",
        stage: "Prelims",
        testType: "full",
        section: "",
        language: "ENGLISH"
    },
    {
        examId: "ssc-cgl",
        stage: "Tier-I",
        testType: "full",
        section: "",
        language: "ENGLISH"
    }
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

function headerValue(headers, name) {
    if (!headers) return null;
    if (typeof headers.get === "function") return headers.get(name);
    return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

function retryMs(err) {
    const h = err?.headers;

    const ms = Number(headerValue(h, "retry-after-ms"));
    if (Number.isFinite(ms) && ms > 0) return ms;

    const sec = Number(headerValue(h, "retry-after"));
    if (Number.isFinite(sec) && sec > 0) return sec * 1000;

    const message = String(err?.message || "");
    const m = message.match(
        /try again in\s+(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?/i
    );

    if (m) {
        return (
            (Number(m[1]) || 0) * 3600 +
            (Number(m[2]) || 0) * 60 +
            (Number(m[3]) || 0)
        ) * 1000;
    }

    return 60 * 60 * 1000;
}

function isRateLimit(err) {
    return (
        Number(err?.status) === 429 ||
        String(err?.code || "").toLowerCase() === "rate_limit_exceeded" ||
        /rate limit|too many requests/i.test(String(err?.message || ""))
    );
}

function schedule(ms) {
    if (timer) clearTimeout(timer);

    timer = setTimeout(() => {
        scan().catch(err => console.error("[AUTO-POOL] Scan error:", err));
    }, Math.max(1000, Number(ms) || 1000));

    timer.unref?.();
}

async function generateAndSave(p) {
    console.log(`[AUTO-POOL] GENERATING -> ${label(p)}`);

    const paper = await generatePaper(p);

    if (!paper || !paper.id) {
        throw new Error("Generator returned an invalid paper.");
    }

    savePaper(paper);

    console.log(`[AUTO-POOL] READY -> ${paper.id}`);
    return paper;
}

function saveCooldown(err) {
    const requested = retryMs(err) + 5000;
    const wait = Math.min(requested, 15 * 60 * 1000);
    const until = Date.now() + wait;

    setState("pool_cooldown_until", until);

    console.log(
        `[AUTO-POOL] All available providers are rate-limited/unavailable. Retrying in ${Math.ceil(wait / 60000)} min.`
    );

    schedule(wait);
}

async function scan() {
    if (running) return;

    if (process.env.POOL_WORKER_ENABLED === "false") {
        console.log("[AUTO-POOL] Worker disabled.");
        return;
    }

    if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY && !process.env.OPENAI_API_KEY) {
        console.log("[AUTO-POOL] No AI provider configured. Add GEMINI_API_KEY, GROQ_API_KEY or OPENAI_API_KEY.");
        return;
    }

    running = true;

    try {
        // STEP 1: prepare the user's two immediate practice papers first.
        // Do not start general inventory until BOTH are READY.
        for (const priorityPool of PRIORITY_POOLS) {
            const priorityCount = readyCount(priorityPool);

            console.log(
                `[AUTO-POOL] PRIORITY -> ${label(priorityPool)} | ${priorityCount}/1`
            );

            if (priorityCount < 1) {
                try {
                    await generateAndSave(priorityPool);
                    console.log(`[AUTO-POOL] PRIORITY READY -> ${label(priorityPool)}`);
                } catch (err) {
                    if (isRateLimit(err)) {
                        saveCooldown(err);
                        return;
                    }

                    console.error(
                        `[AUTO-POOL] Priority generation failed for ${label(priorityPool)}:`,
                        err?.message || err
                    );

                    schedule(5 * 60 * 1000);
                    return;
                }
            }
        }

        console.log("[AUTO-POOL] Both immediate practice priorities are READY. Continuing normal pool refill.");

        // STEP 2: refill all pools gradually.
        const target = Math.max(1, Number(process.env.POOL_TARGET || 1));
        const maxPerScan = Math.max(1, Number(process.env.POOL_MAX_GENERATIONS_PER_SCAN || 1));
        let generatedThisScan = 0;
        const list = pools();

        console.log(
            `[AUTO-POOL] Inventory scan: ${list.length} pools, target ${target}.`
        );

        for (const p of list) {
            const count = readyCount(p);

            if (count >= target) continue;

            console.log(
                `[AUTO-POOL] DEFICIT -> ${label(p)} | ${count}/${target}`
            );

            try {
                // Only ONE paper per deficient pool per scan.
                // This spreads quota instead of exhausting it on the first pool.
                await generateAndSave(p);
                generatedThisScan += 1;
                await sleep(15000);
                if (generatedThisScan >= maxPerScan) {
                    console.log(`[AUTO-POOL] Scan generation cap reached (${maxPerScan}). Remaining pools will continue next scan.`);
                    break;
                }
            } catch (err) {
                if (isRateLimit(err)) {
                    saveCooldown(err);
                    return;
                }

                console.error(
                    `[AUTO-POOL] Generation failed for ${label(p)}:`,
                    err?.message || err
                );

                schedule(5 * 60 * 1000);
                return;
            }
        }

        console.log("[AUTO-POOL] Inventory scan complete.");
        schedule(5 * 60 * 1000);
    } finally {
        running = false;
    }
}

function start() {
    console.log("[AUTO-POOL] Worker started.");
    console.log(`[AUTO-POOL] Providers -> Gemini: ${process.env.GEMINI_API_KEY ? "ON" : "OFF"} | Groq: ${process.env.GROQ_API_KEY ? "ON" : "OFF"} | OpenAI fallback: ${process.env.OPENAI_API_KEY ? "ON" : "OFF"}`);
    // Clear an old OpenAI-only cooldown from the previous provider architecture.
    setState("pool_cooldown_until", "0");
    schedule(3000);
}

module.exports = { start, scan, pools };
