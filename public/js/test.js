if (!guard()) throw Error("login");

const paper = JSON.parse(localStorage.getItem("activePaper") || "null");

if (!paper || !paper.questions?.length) {
    alert("No active paper.");
    location.href = "mocks.htm";
    throw Error("No active paper");
}

const qs = paper.questions;
let i = 0;
let answers = {};
let status = {};
let visited = {};
let started = Date.now();
let left = duration();
let submitting = false;
let timerHandle = null;

function duration() {
    const map = {
        "ibps-clerk|Prelims": 3600,
        "ssc-cgl|Tier-I": 3600,
        "ssc-chsl|Tier-I": 3600,
        "rrb-ntpc-graduate|CBT-1": 5400,
        "rrb-ntpc-ug|CBT-1": 5400,
        "rrb-group-d|CBT": 5400,
        "ctet|Paper-I": 9000
    };

    return map[`${paper.examId}|${paper.stage}`] || 3600;
}

function marking() {
    const map = {
        "ssc-cgl|Tier-I": [2, 0.5],
        "ssc-chsl|Tier-I": [2, 0.5],
        "rrb-ntpc-graduate|CBT-1": [1, 1 / 3],
        "rrb-ntpc-ug|CBT-1": [1, 1 / 3],
        "rrb-group-d|CBT": [1, 1 / 3]
    };

    return map[`${paper.examId}|${paper.stage}`] ||
        [1, paper.examId === "ctet" ? 0 : 0.25];
}

function sectionName(q) {
    return q.section || q.sectionId || "Questions";
}

function currentState(n) {
    const hasAnswer = answers[n] !== undefined;
    const marked = status[n] === "review";

    if (!visited[n]) return "notVisited";
    if (marked && hasAnswer) return "answeredReview";
    if (marked) return "review";
    if (hasAnswer) return "answered";
    return "notAnswered";
}

function counts() {
    const result = {
        answered: 0,
        notAnswered: 0,
        review: 0,
        answeredReview: 0,
        notVisited: 0
    };

    qs.forEach((_, n) => result[currentState(n)]++);
    return result;
}

function updateTimer() {
    const safe = Math.max(0, left);
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;

    timer.textContent = hours > 0
        ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
        : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    timer.classList.toggle("danger", safe <= 300);
}

examTitle.textContent = paper.exam;
meta.textContent =
    `${paper.stage} • ${paper.testType === "sectional" ? paper.section : "Full Mock"} • ${paper.language === "HINDI" ? "हिन्दी" : "English"}`;

const secs = [...new Set(qs.map(sectionName))];

function renderSections() {
    const currentSection = sectionName(qs[i]);

    sectionBar.innerHTML = secs.map((s, n) =>
        `<button class="${s === currentSection ? "active" : ""}" data-section-index="${n}">${esc(s)}</button>`
    ).join("");

    [...sectionBar.querySelectorAll("button")].forEach(btn => {
        btn.addEventListener("click", () => jumpSection(secs[Number(btn.dataset.sectionIndex)]));
    });
}

function renderPalette() {
    palette.innerHTML = qs.map((_, n) =>
        `<button class="${currentState(n)} ${n === i ? "current" : ""}" onclick="go(${n})">${n + 1}</button>`
    ).join("");

    const c = counts();

    summaryCounts.innerHTML = `
        <div><b>${c.answered}</b><span>Answered</span></div>
        <div><b>${c.notAnswered}</b><span>Not Answered</span></div>
        <div><b>${c.review + c.answeredReview}</b><span>Review</span></div>
        <div><b>${c.notVisited}</b><span>Not Visited</span></div>
    `;
}

function render() {
    visited[i] = true;

    const q = qs[i];
    const [pos, neg] = marking();

    qno.textContent = `Question ${i + 1} of ${qs.length}`;
    marks.textContent = `+${pos} / -${Number(neg).toFixed(2)}`;

    const shared = q.sharedStem || "";
    const dir = q.direction || "";
    direction.innerHTML = "";
    if (dir) {
        const d=document.createElement("div"); d.className="questionDirection"; d.textContent=dir; direction.appendChild(d);
    }
    if (shared) {
        const s=document.createElement("div"); s.className="sharedStem"; s.textContent=shared; direction.appendChild(s);
    }
    direction.style.display = (dir || shared) ? "block" : "none";

    question.textContent = q.question;

    options.innerHTML = q.options.map((option, n) => `
        <label class="option ${answers[i] === n ? "selected" : ""}">
            <input
                type="radio"
                name="o"
                value="${n}"
                ${answers[i] === n ? "checked" : ""}
                onchange="selectAnswer(${n})"
            >
            <b>${String.fromCharCode(65 + n)}.</b>
            <span>${esc(option)}</span>
        </label>
    `).join("");

    prevBtn.disabled = i === 0;

    renderSections();
    renderPalette();
}

function selectAnswer(n) {
    answers[i] = n;
    render();
}

function go(n) {
    if (n < 0 || n >= qs.length) return;
    i = n;
    render();
}

function prev() {
    if (i > 0) {
        i--;
        render();
    }
}

function moveNext() {
    if (i < qs.length - 1) {
        i++;
        render();
    } else {
        render();
    }
}

function saveNext() {
    if (answers[i] !== undefined) {
        status[i] = "answered";
    } else {
        delete status[i];
    }

    moveNext();
}

function reviewNext() {
    status[i] = "review";
    moveNext();
}

function clearAns() {
    delete answers[i];

    if (status[i] !== "review") {
        delete status[i];
    }

    render();
}

function jumpSection(s) {
    const n = qs.findIndex(q => sectionName(q) === s);
    if (n >= 0) go(n);
}

function buildSubmitSummary() {
    const c = counts();
    const attempted = c.answered + c.answeredReview;

    return `
        <div><span>Total Questions</span><b>${qs.length}</b></div>
        <div><span>Attempted</span><b>${attempted}</b></div>
        <div><span>Not Answered</span><b>${c.notAnswered}</b></div>
        <div><span>Marked for Review</span><b>${c.review + c.answeredReview}</b></div>
        <div><span>Not Visited</span><b>${c.notVisited}</b></div>
    `;
}

function submitTest(auto = false) {
    if (submitting) return;

    if (auto) {
        confirmSubmit(true);
        return;
    }

    submitSummary.innerHTML = buildSubmitSummary();
    submitModal.classList.remove("hidden");
}

function closeSubmitModal() {
    if (!submitting) submitModal.classList.add("hidden");
}

async function confirmSubmit(auto = false) {
    if (submitting) return;
    submitting = true;

    submitModal.classList.add("hidden");
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting...";

    if (timerHandle) clearInterval(timerHandle);

    const [pos, neg] = marking();
    let correct = 0;
    let wrong = 0;

    const details = qs.map((q, n) => {
        const selected = answers[n];
        const attempted = selected !== undefined;
        const ok = attempted && Number(selected) === Number(q.answer);

        if (ok) correct++;
        else if (attempted) wrong++;

        return {
            questionIndex: n,
            section: sectionName(q),
            topic: q.topic || "",
            subtopic: q.subtopic || "",
            selectedAnswer: attempted ? selected : null,
            correctAnswer: q.answer,
            isAttempted: attempted,
            isCorrect: ok,
            markedForReview: status[n] === "review",
            marksAwarded: ok ? pos : attempted ? -neg : 0,
            question: q.question,
            options: q.options,
            solution: q.solution || "",
            shortTrick: q.shortTrick || ""
        };
    });

    const unattempted = qs.length - correct - wrong;
    const score = correct * pos - wrong * neg;
    const maxScore = qs.length * pos;
    const accuracy = (correct + wrong)
        ? (correct / (correct + wrong)) * 100
        : 0;

    const totalTimeSeconds = Math.min(
        duration(),
        Math.max(0, Math.round((Date.now() - started) / 1000))
    );

    const sectionMap = {};

    details.forEach(d => {
        if (!sectionMap[d.section]) {
            sectionMap[d.section] = {
                section: d.section,
                total: 0,
                correct: 0,
                wrong: 0,
                unattempted: 0,
                score: 0
            };
        }

        const s = sectionMap[d.section];
        s.total++;
        s.score += d.marksAwarded;

        if (!d.isAttempted) s.unattempted++;
        else if (d.isCorrect) s.correct++;
        else s.wrong++;
    });

    const sections = Object.values(sectionMap).map(s => ({
        ...s,
        accuracy: (s.correct + s.wrong)
            ? (s.correct / (s.correct + s.wrong)) * 100
            : 0
    }));

    const payload = {
        attemptId: paper.attemptId,
        score,
        maxScore,
        correct,
        wrong,
        unattempted,
        accuracy,
        totalTimeSeconds,
        answers: details,
        sections,
        autoSubmitted: !!auto
    };

    try {
        await api("/api/submit-result", {
            method: "POST",
            body: JSON.stringify(payload)
        });

        localStorage.setItem(
            "lastResult",
            JSON.stringify({
                ...payload,
                ...paper,
                completedAt: new Date().toISOString()
            })
        );

        localStorage.removeItem("activePaper");
        location.href = "result.htm";
    } catch (e) {
        submitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Test";

        // Resume timer only if time is still available.
        if (left > 0) startTimer();

        alert(e.message || "Could not submit test. Please try again.");
    }
}

function startTimer() {
    if (timerHandle) clearInterval(timerHandle);

    updateTimer();

    timerHandle = setInterval(() => {
        left--;
        updateTimer();

        if (left <= 0) {
            clearInterval(timerHandle);
            timerHandle = null;
            confirmSubmit(true);
        }
    }, 1000);
}

window.addEventListener("beforeunload", e => {
    if (!submitting && left > 0) {
        e.preventDefault();
        e.returnValue = "";
    }
});

visited[0] = true;
render();
startTimer();
