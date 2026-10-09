require('dotenv').config();
const OpenAI = require("openai");
const crypto = require("crypto");
const { EXAMS } = require("./exam-config");
const { getGenerationCheckpoint, saveGenerationCheckpoint, clearGenerationCheckpoint } = require("./database");
const { parseRetryMs, isRateLimit, isTransient } = require("./retry-utils");

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
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
        response_format: { type: "json_object" },
        ...extra
      });
      return res.choices?.[0]?.message?.content || "";
    } catch (err) {
      const wait = parseRetryMs(err);
      if ((isRateLimit(err) || isTransient(err)) && attempt < maxRetries) {
        const delay = (isRateLimit(err) && wait != null && wait <= 90000) ? Math.max(1500, wait + 1500) : (attempt + 1) * 2000;
        console.log(`[GENERATOR] ${name} ${err?.status || 'retryable error'} -> waiting ${Math.ceil(delay / 1000)}s, retrying.`);
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

// ---------- EXAM TOPIC BLUEPRINTS ----------
const SECTION_BLUEPRINTS = {
  // Quantitative Aptitude / Numerical Ability / Mathematics
  quant: [
    {
      topic: "Simplification & Approximation",
      instruction: "Tricky multi-step competitive exam arithmetic involving BODMAS, percentages of large numbers, square/cube roots, fractions, and decimals."
    },
    {
      topic: "Missing Number Series",
      instruction: "Challenging missing number series (6 terms, find '?') with pattern like cubic differences, prime gaps, alternating operations, or x1.5+2."
    },
    {
      topic: "Wrong Number Series",
      instruction: "Identify the wrong term in a given 6-7 number series following a specific mathematical pattern."
    },
    {
      topic: "Quadratic Equations Comparison",
      instruction: "Two separate quadratic equations: Equation I in variable x (e.g. 2x^2 - 11x + 15 = 0) and Equation II in variable y (e.g. 3y^2 - 19y + 28 = 0). Compare x and y. Options MUST be: ['x > y', 'x < y', 'x >= y', 'x <= y', 'x = y or relationship cannot be established']."
    },
    {
      topic: "Data Interpretation (Table DI)",
      instruction: "Provide a complete structured 4-row 4-column data table (e.g. sales/production/employees across companies/months), followed by a multi-step percentage, ratio, average or difference calculation based on the table."
    },
    {
      topic: "Data Interpretation (Bar/Line/Pie DI)",
      instruction: "Provide explicit numerical data representing a Bar Graph, Line Chart or Pie Chart distribution, followed by a multi-step analytical calculation."
    },
    {
      topic: "Time & Work / Pipes & Cisterns",
      instruction: "Realistic multi-step word problem: work efficiencies, alternate days, wages division, or filling/emptying pipes with leakages."
    },
    {
      topic: "Profit, Loss & Discount",
      instruction: "Commercial math: marked price, successive discounts (e.g. 20% and 15%), profit on selling price vs cost price, or dishonest dealer concepts."
    },
    {
      topic: "Simple & Compound Interest",
      instruction: "Difference between CI and SI for 2 or 3 years, compound interest compounded semi-annually, or sum doubling/tripling in N years."
    },
    {
      topic: "Time, Speed & Distance / Trains / Boats",
      instruction: "Two trains crossing each other or a platform, relative speed, or boat speed upstream and downstream with stream velocity."
    },
    {
      topic: "Mixtures & Alligations",
      instruction: "Repeated dilution/replacement of liquid from a container, or mixing two varieties of commodities with given cost ratios."
    },
    {
      topic: "Partnership & Ages",
      instruction: "Partners investing unequal capitals for unequal durations, or present and future age ratio transitions after N years."
    },
    {
      topic: "Mensuration (2D & 3D)",
      instruction: "Curved/total surface area and volume of cylinder/cone/sphere, or perimeter and area of rectangular/circular fields with pathways."
    },
    {
      topic: "Probability & Permutation-Combination",
      instruction: "Selection of colored balls from bags, drawing cards without replacement, or committee formations with gender constraints."
    }
  ],

  // Reasoning Ability / General Intelligence
  reasoning: [
    {
      topic: "Syllogisms",
      instruction: "Exam syllogism with 3 statements (using qualifiers 'Only a few', 'Some', 'All', 'No') followed by 2 conclusions. Options MUST be: ['Only conclusion I follows', 'Only conclusion II follows', 'Either conclusion I or II follows', 'Neither conclusion I nor II follows', 'Both conclusions I and II follow']."
    },
    {
      topic: "Inequalities",
      instruction: "Multi-variable chain inequality statement (e.g., 'Statement: P >= Q > R = S <= T < U') followed by Conclusions I and II. Options MUST be: ['Only conclusion I is true', 'Only conclusion II is true', 'Either conclusion I or II is true', 'Neither conclusion I nor II is true', 'Both conclusions I and II are true']."
    },
    {
      topic: "Coding-Decoding",
      instruction: "Chinese/Substitution coding (e.g. 'study hard for exam' is coded as 'de ki po na'...) or alphanumeric pattern-shift coding with full context."
    },
    {
      topic: "Direction & Distance",
      instruction: "Multi-turn journey: person walks in different compass directions (North, East, South, West) with specific distances and 90-degree turns. Ask for shortest Pythagoras distance or direction relative to starting point."
    },
    {
      topic: "Blood Relations",
      instruction: "3-generation family relation scenario with 6-8 family members, distinct relations (nephew, sister-in-law, maternal uncle, grandfather) with unambiguous deduction."
    },
    {
      topic: "Alphanumeric & Symbol Series",
      instruction: "Provide a 25-30 character mixed sequence of letters, numbers, and special symbols (e.g. 'M 4 @ K 9 # E $ 2 W 7 % ...') and ask condition-based counting or relative position questions."
    },
    {
      topic: "Order & Ranking / Comparison",
      instruction: "Comparative ranking among 6-7 persons by height, weight, or marks with relative positions, or overlapping row ranking where positions are interchanged."
    },
    {
      topic: "Linear Seating Arrangement",
      instruction: "7-8 persons sitting in a straight horizontal line facing North (or mixed North/South) with complete distinct clues and unambiguous position question."
    },
    {
      topic: "Circular Seating Arrangement",
      instruction: "7-8 persons seated around a circular table facing center with complete clues, asking position or immediate neighbours."
    },
    {
      topic: "Floor / Box Puzzle",
      instruction: "7 persons living on 7 different floors (1 to 7) of a building, or 7 boxes stacked vertically, with complete clues and definitive position question."
    },
    {
      topic: "Critical Reasoning",
      instruction: "Short statement followed by 2 Assumptions or Conclusions or Courses of Action with standard competitive options."
    }
  ],

  // English Language / Comprehension
  english: [
    {
      topic: "Reading Comprehension",
      instruction: "Provide a complete cohesive passage of 150-220 words on economics, digital banking, technology, environment, or governance under a clear 'Passage:' block. Ask an inferential, central idea, or vocabulary-in-context question."
    },
    {
      topic: "Error Detection / Spotting",
      instruction: "Start with 'Directions: In the following question, a sentence is divided into four parts (A, B, C, D). Find out which part has a grammatical error. If there is no error, choose 'No error' (E) as your answer.' The sentence MUST be clearly partitioned as: '(A) Part one / (B) part two / (C) part three / (D) part four / (E) No error'. Options: ['A', 'B', 'C', 'D', 'No error']."
    },
    {
      topic: "Sentence Improvement / Phrase Replacement",
      instruction: "Start with 'Directions: In the following sentence, a phrase is enclosed in quotes. Select the option that correctly replaces the quoted phrase to make the sentence grammatically correct. If no correction is needed, select 'No replacement required'.' The sentence MUST enclose the target phrase in quotes e.g. 'look after the issues'. One option MUST be 'No replacement required'."
    },
    {
      topic: "Fill in the Blanks (Single & Double Fillers)",
      instruction: "Start with 'Directions: Select the most appropriate word(s) to fill in the blank(s) to make the sentence grammatically correct and contextually meaningful.' Provide a rich, mature sentence with clear contextual clues."
    },
    {
      topic: "Word Swap / Word Usage",
      instruction: "Start with 'Directions: In the following sentence, four words are labelled (A), (B), (C), and (D). Identify the pair of words that should be interchanged to make the sentence grammatically correct and contextually meaningful. If the sentence is already correct, choose 'No swap required'.' Options must be e.g. ['A-B', 'B-D', 'A-C', 'No swap required']."
    },
    {
      topic: "Sentence Rearrangement / Para Jumbles",
      instruction: "Start with 'Directions: The following sentence is split into four parts labelled (A), (B), (C), and (D). Rearrange them to form a coherent, grammatically correct sentence.' Options must be permutations like ['BACD', 'CDBA', 'ACBD', 'DCBA']."
    },
    {
      topic: "Cloze Test",
      instruction: "Start with 'Directions: In the following passage, there are blanks numbered (1), (2), etc. Choose the correct word for the specified blank.' Provide short coherent paragraph with numbered blanks and test the specified blank."
    },
    {
      topic: "Idioms & Phrases in Context",
      instruction: "Start with 'Directions: Choose the option that best expresses the meaning of the idiom enclosed in quotes in the sentence below.' Test authentic competitive exam idiom."
    }
  ],

  // General Awareness / General Knowledge / Current Affairs
  ga: [
    { topic: "Current Affairs & Government Schemes", instruction: "Recent national economic initiatives, welfare schemes, summits, or RBI/SEBI policy updates." },
    { topic: "Static GK: Indian Polity & Constitution", instruction: "Constitutional articles, fundamental rights, parliamentary procedures, or supreme court judgments." },
    { topic: "Static GK: Indian Geography & Environment", instruction: "Rivers, national parks, biosphere reserves, climate zones, or mountain passes." },
    { topic: "Static GK: Indian History & Freedom Struggle", instruction: "Key events, congress sessions, treaties, governors-general, or ancient architectural heritage." },
    { topic: "Economy & Banking Awareness", instruction: "Monetary policy tools (repo rate, CRR), inflation indices, national income, fiscal deficit, or banking terms." },
    { topic: "Science & Technology", instruction: "Space missions (ISRO/NASA), defense developments, biotechnology, or computing advancements." }
  ],

  // General Science (Railways, SSC)
  science: [
    { topic: "Physics: Mechanics & Energy", instruction: "Newton's laws, gravitation, work, power, kinetic/potential energy, or friction calculations." },
    { topic: "Physics: Electricity, Magnetism & Optics", instruction: "Ohm's law, resistance combinations, mirrors, lenses, refraction, or electromagnetic spectrum." },
    { topic: "Chemistry: Chemical Reactions & Acids/Bases", instruction: "pH scale, neutralization, oxidation-reduction, salts, and common industrial chemicals." },
    { topic: "Chemistry: Periodic Table & Metallurgy", instruction: "Elements, trends across periods/groups, metals, non-metals, ores, and alloys." },
    { topic: "Biology: Human Physiology", instruction: "Digestive, circulatory, nervous, endocrine, or respiratory systems and hormonal functions." },
    { topic: "Biology: Genetics & Diseases", instruction: "Cell biology, chromosomes, infectious diseases (bacterial/viral/fungal), vitamins, and deficiencies." }
  ],

  // Child Development & Pedagogy (CTET)
  cdp: [
    { topic: "Cognitive & Moral Development", instruction: "Theories of Piaget, Vygotsky (ZPD, scaffolding), and Kohlberg's stages of moral reasoning." },
    { topic: "Inclusive Education & Diverse Learners", instruction: "Addressing children from disadvantaged backgrounds, gifted children, and learning disabilities (dyslexia, ADHD)." },
    { topic: "Learning Theories & Pedagogy", instruction: "Constructivism, behaviorism, motivation, problem-solving, and assessment for vs of learning." }
  ]
};

function getSectionCategory(secId, secName) {
  const s = `${secId} ${secName}`.toLowerCase();
  if (s.includes('quant') || s.includes('numerical') || s.includes('math') || s.includes('arithmetic')) return 'quant';
  if (s.includes('reason') || s.includes('mental') || s.includes('intelligence')) return 'reasoning';
  if (s.includes('eng') || s.includes('comprehension') || s.includes('language')) return 'english';
  if (s.includes('science')) return 'science';
  if (s.includes('cdp') || s.includes('pedagogy') || s.includes('child')) return 'cdp';
  if (s.includes('ga') || s.includes('gk') || s.includes('general awareness') || s.includes('current affairs')) return 'ga';
  return 'ga';
}

function buildSectionTopicPlan(sec, cfg) {
  const cat = getSectionCategory(sec.id, sec.name);
  const pool = SECTION_BLUEPRINTS[cat] || SECTION_BLUEPRINTS.quant;
  const count = Number(sec.count || 20);

  const plan = [];
  let poolIdx = 0;
  for (let i = 0; i < count; i++) {
    const item = pool[poolIdx % pool.length];
    plan.push({
      topic: item.topic,
      instruction: item.instruction,
      index: i + 1
    });
    poolIdx++;
  }
  return plan;
}

function formatTopicsHint(batchTopics, sec) {
  if (!batchTopics || !batchTopics.length) return "";
  const lines = batchTopics.map((t, idx) => `Question ${idx + 1}: [Topic: ${t.topic}] -> ${t.instruction}`);
  return `Generate exactly ${batchTopics.length} questions, each strictly dedicated to one of these assigned topics:\n${lines.join('\n')}`;
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
    try {
      const sanitized = str.replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(sanitized);
    } catch {
      const cleaned = str
        .replace(/(?<!\\)\r\n/g, "\\n")
        .replace(/(?<!\\)\n/g, "\\n")
        .replace(/(?<!\\)\t/g, "\\t");
      return JSON.parse(cleaned);
    }
  }
}

function normalizeQuestion(text) {
  return String(text || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

const STRICT_SECTIONS = new Set(["numerical", "quant", "math", "reasoning"]);

function validateQuestion(q, optionCount = 4) {
  if (!q || typeof q !== "object") return false;
  if (typeof q.question !== "string" || q.question.trim().length < 25) return false;
  if (!Array.isArray(q.options) || q.options.length !== optionCount) return false;
  if (!q.options.every(x => typeof x === "string" && x.trim().length > 0)) return false;

  // Distinct options check
  const optSet = new Set(q.options.map(x => x.trim().toLowerCase()));
  if (optSet.size !== optionCount) return false;

  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= optionCount) return false;
  if (typeof q.solution !== "string" || q.solution.trim().length < 15) return false;

  const text = q.question;

  // Reject corrupt legacy markers
  if (/\[Variant\s*\d*\]|\[Set\s*\d*\]|\[[a-f0-9]{6}\]|Set\s+\d{2,}/i.test(text)) return false;

  // Reject fake duplicate option artifacts
  if (q.options.some(o => /\(\d\)$/.test(o.trim()))) return false;

  // Reject trivial toy templates
  if (/^4\s*:\s*16\s*::/i.test(text)) return false;
  if (/If\s+A\s*>\s*B\s*>\s*C/i.test(text)) return false;
  if (/^Find\s+\d+%\s+of\s+\d+\.?$/i.test(text.trim())) return false;
  if (/^A vehicle travels at \d+ km\/h for \d+ hours/i.test(text.trim())) return false;

  return true;
}

function buildPrompt({ cfg, sec, language, count, optionCount, hint }) {
  const opts = Array(optionCount).fill('"option text"').join(",");
  return `
You are a senior exam paper setter creating an authentic, high-quality, full-standard mock test for an Indian competitive examination.
Exam: ${cfg.exam}
Stage: ${cfg.stage}
Section: ${sec.name}
Questions required: exactly ${count}
${langRule(sec, language)}

TOPIC ASSIGNMENT FOR THIS BATCH:
${hint || "Cover diverse, realistic exam topics matching the syllabus."}

CRITICAL QUALITY & AUTHENTICITY REQUIREMENTS:
1. EXTREME TOPIC & PATTERN DIVERSITY (ZERO REPETITION):
   - EVERY SINGLE QUESTION in this batch MUST test a DIFFERENT subtopic and follow a DIFFERENT question format.
   - NEVER repeat the same question template, formula, or scenario with just changed numbers!
   - NO TOY OR TRIVIAL QUESTIONS: Do NOT generate simplistic 1-line elementary questions like "Find 15% of 800", "If A > B > C which is true", "4 : 16 :: 5 : ?", or "A walks 5km north then 4km east".
   - All questions must strictly match the difficulty of ${cfg.exam} ${cfg.stage}.

2. 100% COMPLETENESS & MANDATORY EXPLICIT DIRECTIONS:
   - Every question MUST be completely self-contained. The candidate must immediately understand what is asked without any ambiguity.
   - For English questions:
     * EVERY English question MUST begin with explicit "Directions: ..." explaining exactly what the candidate must do.
     * Error Detection: Sentence MUST be clearly partitioned into "(A) Part one / (B) part two / (C) part three / (D) part four / (E) No error". Options must be ["A", "B", "C", "D", "No error"].
     * Phrase Replacement: Enclose target phrase in quotes e.g., 'look after the issues'. Options MUST include "No replacement required".
     * Word Swap: Four words labelled (A), (B), (C), (D) in sentence. Options: pairs like ["A-C", "B-D", "A-B", "No swap required"].
     * Reading Comprehension: Provide a complete coherent passage (150-250 words) under "Passage: \\n[text]\\n\\nQuestion: [question]".
     * Cloze Test: Provide the passage context and specify the exact blank number.
     * Fillers: Complete, meaningful sentences with grammatical and contextual clues.
   - For Quantitative Aptitude:
     * Full multi-step competitive exam problems.
     * Quadratic Equations: Provide Equation I (in x) and Equation II (in y). Options: ["x > y", "x < y", "x >= y", "x <= y", "x = y or relationship cannot be established"].
     * Number Series: Provide 6-term series, asking for missing (?) or wrong term with challenging patterns (cubes, primes, alternate steps).
     * Data Interpretation: Provide complete structured tabular or numeric data followed by multi-step percentage/ratio/average calculations.
   - For Reasoning:
     * Syllogisms: Give 3 statements with realistic quantifiers ('Only a few', 'Some', 'All', 'No') followed by 2-3 conclusions. Standard options (Only I follows, Only II follows, Either I or II, Neither follows, Both follow).
     * Inequalities: Statement with 5-7 variable chains (e.g. P >= Q > R = S <= T < U) followed by Conclusions I & II.
     * Seating Arrangements & Puzzles: Provide complete distinct clues with 6-8 persons, positions, or attributes, followed by clear question.
     * Direction Sense: Multi-turn journey with Pythagoras calculation or relative direction.
     * Blood Relations: 3-generation family relations with clear familial connections.

3. OPTIONS & ANSWER:
   - Exactly ${optionCount} plausible, distinct options. Never duplicate options or append index tags like "(1)", "(2)".
   - "answer" is the integer index (0 to ${optionCount - 1}) of the correct option.

4. EXHAUSTIVE STEP-BY-STEP MASTER SOLUTION:
   - Provide an exhaustive, step-by-step master derivation or grammatical analysis.
   - Explicitly explain why the correct option is right and why the distractors are wrong.
   - "shortTrick": A fast shortcut formula, Vedic math trick, option elimination method, or 30-second technique for competitive exams.

RETURN ONLY VALID JSON (NO MARKDOWN WRAPPERS):
{"questions":[
  {"question":"Directions: ...\\n\\n...","options":[${opts}],"answer":0,"solution":"...","shortTrick":"...","topic":"...","subtopic":"..."}
]}
`.trim();
}

async function createBatch({ cfg, sec, language, count, batchNo, totalBatches, previousQuestions, seen, hint = "" }) {
  const optionCount = cfg.optionCount || 4;
  const temperature = STRICT_SECTIONS.has(sec.id) ? 0.25 : 0.6;
  const accepted = [];
  const local = new Set();

  for (let round = 1; accepted.length < count && round <= 3; round++) {
    const need = count - accepted.length;
    console.log(`[GENERATOR] ${cfg.exam} ${sec.name} | batch ${batchNo}/${totalBatches} | round ${round} | need ${need}`);

    try {
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
    } catch (batchErr) {
      console.warn(`[GENERATOR] Round ${round} error:`, batchErr.message);
      if (round === 3 && accepted.length === 0) throw batchErr;
    }

    if (accepted.length >= count) {
      break;
    }
  }

  if (accepted.length === 0) {
    throw new Error(`Batch failed: 0 questions generated for ${sec.name} batch ${batchNo}.`);
  }
  return accepted;
}

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

  const questions = [];
  for (const sec of sections) {
    console.log(`[GENERATOR] Generating section: ${sec.name} (${sec.count} questions required)...`);
    const topicPlans = buildSectionTopicPlan(sec, cfg);

    const chunks = [];
    let rem = sec.count;
    while (rem > 0) {
      const take = Math.min(rem, 7);
      chunks.push(take);
      rem -= take;
    }

    let planCursor = 0;
    for (let idx = 0; idx < chunks.length; idx++) {
      const batchCount = chunks[idx];
      const batchTopics = topicPlans.slice(planCursor, planCursor + batchCount);
      planCursor += batchCount;

      const hintText = formatTopicsHint(batchTopics, sec);

      const batch = await createBatch({
        cfg,
        sec,
        language,
        count: batchCount,
        batchNo: idx + 1,
        totalBatches: chunks.length,
        previousQuestions: [],
        seen: new Set(),
        hint: hintText
      });

      for (let bi = 0; bi < batch.length; bi++) {
        const q = batch[bi];
        const assignedTopic = batchTopics[bi]?.topic || q.topic || sec.name;
        questions.push({
          ...q,
          shortTrick: typeof q.shortTrick === "string" ? q.shortTrick : "",
          topic: assignedTopic,
          subtopic: typeof q.subtopic === "string" ? q.subtopic : "",
          sectionId: sec.id, section: sec.name,
          positive: Number(sec.positive ?? cfg.positive ?? 1),
          negative: Number(sec.negative ?? cfg.negative ?? 0)
        });
      }

      // Small pause between batches to protect API quota
      if (idx < chunks.length - 1 || sec !== sections[sections.length - 1]) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }
  }

  const expected = sections.reduce((sum, s) => sum + s.count, 0);
  if (!questions.length) throw new Error(`Paper incomplete: expected ${expected}, got 0.`);
  console.log(`[GENERATOR] Exam-authentic diverse paper generation complete: ${questions.length}/${expected} questions.`);
  const paper = { id: crypto.randomUUID(), examId, examName: cfg.exam, stage, testType, section: params.section, language, questions };
  return paper;
}

async function explainQuestionWithAI({ question, options, selectedAnswer, correctAnswer, language = "ENGLISH", topic = "", section = "" }) {
  const chosenIndex = (selectedAnswer !== null && selectedAnswer !== undefined && !Number.isNaN(Number(selectedAnswer))) ? Number(selectedAnswer) : null;
  const correctIndex = Number(correctAnswer);

  const chosenText = chosenIndex !== null && options[chosenIndex] !== undefined
    ? `Option (${String.fromCharCode(65 + chosenIndex)}): ${options[chosenIndex]}`
    : "Not attempted / left blank";
  const correctText = `Option (${String.fromCharCode(65 + correctIndex)}): ${options[correctIndex] || ''}`;
  const optionsListing = (options || []).map((opt, idx) => `  ${String.fromCharCode(65 + idx)}) ${opt}`).join('\n');

  const prompt = `
You are an expert master tutor for Indian competitive examinations (SSC, Banking, Railways, Teaching).
A candidate just attempted this question in a mock test and needs an exhaustive diagnostic breakdown of their answer.

Section: ${section || 'General'}
Topic: ${topic || 'General'}
Exam Language: ${language}

Question:
${question}

Options:
${optionsListing}

Candidate's Answer: ${chosenText}
Correct Answer: ${correctText}

Provide an exhaustive, high-yield diagnostic explanation in clean JSON format:
{
  "mistakeAnalysis": "Detailed diagnosis of why the candidate's chosen option is wrong (or why candidates struggle with this if unattempted). Pinpoint the exact conceptual trap, false assumption, or calculation pitfall.",
  "coreConcept": "Clear, comprehensive explanation of the fundamental concept, rule, or theorem tested in this question.",
  "stepByStep": "Complete, step-by-step master derivation showing how to solve the problem systematically.",
  "shortcut": "Topper's secret shortcut: speed technique, Vedic math trick, or option elimination rule to solve in under 30 seconds."
}

Return ONLY valid JSON, no markdown.
`.trim();

  try {
    const ai = await generateText(prompt, { temperature: 0.2 });
    return cleanJson(ai.text);
  } catch (err) {
    console.warn('[AI-EXPLAIN] API error, using instant fallback breakdown:', err.message);
    const correctLetter = String.fromCharCode(65 + correctIndex);
    const chosenLetter = chosenIndex !== null ? String.fromCharCode(65 + chosenIndex) : null;
    return {
      mistakeAnalysis: chosenLetter 
        ? `Option (${chosenLetter}) is incorrect. In competitive exams, this is a common distractor designed to catch calculation slips or incorrect rule application. Verify the exact condition given in the problem statement.`
        : `This question was left unattempted. Candidates often struggle with time management on questions of this pattern. Recognizing the question type in the first 5 seconds allows confident attempts.`,
      coreConcept: `This problem evaluates foundational concepts of ${topic || section || 'competitive examination syllabus'}. Focus on identifying given variables and applying direct formulas.`,
      stepByStep: `1. Re-read the question carefully to identify given values and target variable.\n2. Apply the standard formula / deductive logic for ${topic || 'this question'}.\n3. Verify that Option (${correctLetter}): "${options[correctIndex] || ''}" satisfies all problem constraints.`,
      shortcut: `Option Elimination Shortcut: In multiple-choice questions of this pattern, test the extreme options or check unit digits / parity to eliminate at least 2 options in under 15 seconds.`
    };
  }
}

module.exports = { generatePaper, generateSectionBatch, normalizeQuestion, explainQuestionWithAI, generateText, buildSectionTopicPlan };
