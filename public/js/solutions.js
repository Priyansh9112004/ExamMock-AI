nav("tests");
let a = JSON.parse(localStorage.getItem("reviewAttempt") || localStorage.getItem("lastResult") || "null"), idx = 0;
if (!a) { location.href = "my-tests.htm"; throw Error("No attempt"); }

let answers = a.answers || [], questions = a.questions || [];
try { if (typeof a.answers_json === "string") answers = JSON.parse(a.answers_json || "[]"); } catch {}
try { if (typeof a.questions_json === "string") questions = JSON.parse(a.questions_json || "[]"); } catch {}

title.textContent = `${a.exam || a.examName || a.exam_name || "Mock Test"} Solutions`;
meta.textContent = `${a.stage || ""} • ${a.testType === "sectional" ? (a.section || "Sectional Test") : "Full Mock"} • ${a.language === "HINDI" ? "हिन्दी" : "English"}`;

function resultClass(x) {
  if (!x.isAttempted) return "unattempted";
  return x.isCorrect ? "correct" : "wrong";
}

function renderAiCard(exp, state) {
  if (!exp) return "";
  return `
    <div class="aiExplainCard">
      <div class="aiHeader">
        <span class="aiBadge">✨ AI Diagnostic Breakdown</span>
        <span class="muted" style="font-size:12px">AI In-Depth Diagnostic Analysis</span>
      </div>
      ${exp.mistakeAnalysis ? `
        <div class="aiSection mistake">
          <div class="aiSectionTitle">⚠️ Mistake Diagnosis & Common Traps</div>
          <p>${esc(exp.mistakeAnalysis)}</p>
        </div>` : ""}
      ${exp.coreConcept ? `
        <div class="aiSection concept">
          <div class="aiSectionTitle">💡 Core Underlying Concept & Theory</div>
          <p>${esc(exp.coreConcept)}</p>
        </div>` : ""}
      ${exp.stepByStep ? `
        <div class="aiSection derivation">
          <div class="aiSectionTitle">🔍 Exhaustive Step-by-Step Derivation</div>
          <p>${esc(exp.stepByStep)}</p>
        </div>` : ""}
      ${exp.shortcut ? `
        <div class="aiSection shortcut">
          <div class="aiSectionTitle">⚡ Topper's 30-Second Exam Shortcut</div>
          <p>${esc(exp.shortcut)}</p>
        </div>` : ""}
    </div>
  `;
}

function render() {
  if (!answers.length) {
    solutionCard.innerHTML = '<p class="muted">Detailed answer data is not available for this attempt.</p>';
    solPalette.innerHTML = "";
    return;
  }

  const x = answers[idx] || {};
  const q = questions[x.questionIndex ?? idx] || {};
  const opts = x.options || q.options || [];
  const selected = x.selectedAnswer;
  const correct = x.correctAnswer ?? q.answer;
  const state = resultClass(x);
  const label = state === "correct" ? "CORRECT (+)" : state === "wrong" ? "WRONG (INCORRECT)" : "UNATTEMPTED";

  const exp = x.aiExplanation;

  solutionCard.innerHTML = `
    <div class="solutionTop">
      <b>Question ${idx + 1} of ${answers.length}</b>
      <span class="badge ${state}">${label}</span>
    </div>
    ${x.section ? `<div class="muted" style="margin-top:8px">${esc(x.section)}${x.topic ? ` • ${esc(x.topic)}` : ""}</div>` : ""}
    <div class="solQuestion">${esc(x.question || q.question || "")}</div>
    ${opts.map((o, n) => {
      let c = "";
      if (n === correct && n === selected) c = "selectedCorrect";
      else if (n === correct) c = "correct";
      else if (n === selected) c = "selectedWrong";
      let tag = "";
      if (n === correct) tag += "Correct Answer";
      if (n === selected) tag += (tag ? " • " : "") + "Your Answer";
      return `<div class="solOption ${c}"><b>${String.fromCharCode(65 + n)}.</b><div>${esc(o)}</div>${tag ? `<span class="answerLabels">${tag}</span>` : ""}</div>`;
    }).join("")}

    <div class="solutionBox">
      <div style="font-size:15px;font-weight:800;color:#0f2744;margin-bottom:8px">📖 Master Solution</div>
      <p>${esc(x.solution || q.solution || "Solution not available.")}</p>
      ${(x.shortTrick || q.shortTrick) ? `
        <div class="trick">
          <b>⚡ Speed Trick / Faster Method</b>
          <p>${esc(x.shortTrick || q.shortTrick)}</p>
        </div>` : ""}
    </div>

    ${exp ? renderAiCard(exp, state) : `
      <div style="margin-top:16px">
        <button class="btnAiAction" id="aiBtn_${idx}" onclick="askAI(${idx})">
          ✨ Ask AI: In-Depth Breakdown ${state === 'wrong' ? '(Why was my choice wrong?)' : '(Deep Conceptual Diagnosis)'}
        </button>
      </div>
    `}
  `;

  solPalette.innerHTML = answers.map((z, n) =>
    `<button class="${resultClass(z)} ${n === idx ? "current" : ""}" onclick="idx=${n};render()">${n + 1}</button>`
  ).join("");

  prevSolution.disabled = idx === 0;
  nextSolution.disabled = idx === answers.length - 1;
}

async function askAI(i) {
  const btn = document.getElementById(`aiBtn_${i}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `🤖 AI is diagnosing question and conceptual traps...`;
  }

  const x = answers[i] || {};
  const q = questions[x.questionIndex ?? i] || {};
  const opts = x.options || q.options || [];

  try {
    const data = await api("/api/ai-explain", {
      method: "POST",
      body: JSON.stringify({
        attemptId: a.id || a.attemptId,
        questionIndex: i,
        question: x.question || q.question,
        options: opts,
        selectedAnswer: x.selectedAnswer,
        correctAnswer: x.correctAnswer ?? q.answer,
        language: a.language || "ENGLISH",
        topic: x.topic || q.topic || "",
        section: x.section || q.section || ""
      })
    });

    if (data.explanation) {
      x.aiExplanation = data.explanation;
      answers[i].aiExplanation = data.explanation;
      a.answers = answers;
      localStorage.setItem("reviewAttempt", JSON.stringify(a));
      render();
    }
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `❌ Failed to load AI diagnosis (${err.message}). Try again`;
    }
  }
}

function move(d) {
  idx = Math.max(0, Math.min(answers.length - 1, idx + d));
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

render();
