if (!guard()) throw Error("login");

const paper = JSON.parse(localStorage.getItem("activePaper") || "null");

if (!paper || !paper.questions?.length) {
    alert("No active paper.");
    location.href = "mocks.htm";
    throw Error("No active paper");
}

const qs = paper.questions;
const hasSectionalTiming = !!paper.hasSectionalTiming;

// Partition questions into ordered sections
let sectionDefs = [];
if (Array.isArray(paper.sections) && paper.sections.length > 0) {
    sectionDefs = paper.sections.map(s => ({
        id: s.id,
        name: s.name,
        duration: Number(s.duration) || 900,
        count: Number(s.count) || 0
    }));
}

const qSectionIndices = [];
if (sectionDefs.length > 0) {
    let curSec = 0;
    let curSecCount = 0;
    for (let qi = 0; qi < qs.length; qi++) {
        const q = qs[qi];
        const qSecId = String(q.sectionId || '').toLowerCase();
        const qSecName = String(q.section || '').toLowerCase();

        const matchIdx = sectionDefs.findIndex((sd, idx) =>
            idx >= curSec && (String(sd.id).toLowerCase() === qSecId || String(sd.name).toLowerCase() === qSecName)
        );
        if (matchIdx !== -1) {
            curSec = matchIdx;
        } else if (curSecCount >= (sectionDefs[curSec]?.count || 999) && curSec < sectionDefs.length - 1) {
            curSec++;
            curSecCount = 0;
        }
        qSectionIndices[qi] = curSec;
        curSecCount++;
    }
} else {
    const secMap = new Map();
    qs.forEach((q, qi) => {
        const sName = q.section || q.sectionId || "Questions";
        if (!secMap.has(sName)) {
            secMap.set(sName, { id: sName, name: sName, duration: Math.round((Number(paper.duration) || 3600) / 3) });
        }
        qSectionIndices[qi] = Array.from(secMap.keys()).indexOf(sName);
    });
    sectionDefs = Array.from(secMap.values());
}

const sections = sectionDefs.map((sd, sIdx) => {
    const indices = [];
    for (let qi = 0; qi < qs.length; qi++) {
        if (qSectionIndices[qi] === sIdx) indices.push(qi);
    }
    return {
        ...sd,
        index: sIdx,
        indices,
        startIndex: indices[0] ?? 0,
        endIndex: indices[indices.length - 1] ?? 0
    };
}).filter(s => s.indices.length > 0);

// Active section index
let currentSectionIdx = hasSectionalTiming ? Math.min(sections.length - 1, Number(paper.currentSectionIndex || 0)) : 0;
let currentSecObj = sections[currentSectionIdx] || sections[0];

let i = Number(paper.currentQuestionIndex || currentSecObj.startIndex);
if (hasSectionalTiming && !currentSecObj.indices.includes(i)) {
    i = currentSecObj.startIndex;
}

let answers = paper.draftAnswers || {};
let status = {};
let visited = {};

// Pre-populate visited and answered status
Object.keys(answers).forEach(k => {
    visited[k] = true;
    if (answers[k] !== undefined && answers[k] !== null && answers[k] !== "") {
        status[k] = "answered";
    }
});

let submitting = false;
let timerHandle = null;

function totalDuration() { return Number(paper.duration) || 3600; }

let left = hasSectionalTiming
    ? (Number(paper.sectionTimeLeft) || currentSecObj.duration)
    : (totalDuration() - (Number(paper.totalTimeSeconds) || 0));

if (left <= 10) {
    left = hasSectionalTiming ? currentSecObj.duration : totalDuration();
}

let syncTimer = null;
function syncCloudProgress() {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
        try {
            if (paper && paper.attemptId) {
                paper.draftAnswers = answers;
                paper.currentQuestionIndex = i;
                paper.currentSectionIndex = currentSectionIdx;
                paper.sectionTimeLeft = left;
                localStorage.setItem("activePaper", JSON.stringify(paper));

                await api("/api/attempt/" + paper.attemptId + "/sync", {
                    method: "POST",
                    body: JSON.stringify({
                        draftAnswers: answers,
                        currentQuestionIndex: i,
                        currentSectionIndex: currentSectionIdx,
                        totalTimeSeconds: hasSectionalTiming ? left : (totalDuration() - Math.max(0, left))
                    })
                });
            }
        } catch (e) {
            // Background sync silent fail / retry
        }
    }, 400);
}

function marking() {
  const q = qs[0] || {};
  return [Number(q.positive ?? 1), Number(q.negative ?? 0)];
}

function currentState(n) {
    const hasAnswer = answers[n] !== undefined && answers[n] !== null && answers[n] !== "";
    const marked = status[n] === "review";

    if (!visited[n]) return "notVisited";
    if (marked && hasAnswer) return "answeredReview";
    if (marked) return "review";
    if (hasAnswer) return "answered";
    return "notAnswered";
}

function counts(filterIndices = null) {
    const result = { answered: 0, notAnswered: 0, review: 0, answeredReview: 0, notVisited: 0 };
    const list = filterIndices || qs.map((_, idx) => idx);
    list.forEach(n => result[currentState(n)]++);
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

    timer.classList.toggle("danger", safe <= 180);
}

examTitle.textContent = paper.exam;
meta.textContent = `${paper.stage} • ${paper.testType === "sectional" ? (paper.section || "Sectional Test") : "Full Mock"} • ${paper.language === "HINDI" ? "हिन्दी" : "English"}`;

if (timerLabel) {
    timerLabel.textContent = hasSectionalTiming ? "SECTION TIME LEFT" : "TOTAL TIME LEFT";
}

function renderSections() {
    if (hasSectionalTiming) {
        sectionBar.innerHTML = sections.map((s, idx) => {
            if (idx < currentSectionIdx) {
                return `<button class="completed" disabled title="Section Completed">✔ ${esc(s.name)} (Done)</button>`;
            } else if (idx === currentSectionIdx) {
                return `<button class="active" title="Current Active Section">⏱ ${esc(s.name)} (Active)</button>`;
            } else {
                return `<button class="locked" disabled title="Locked until previous sections are completed">🔒 ${esc(s.name)} (Locked)</button>`;
            }
        }).join("");
    } else {
        const curSec = sections[currentSectionIdx];
        sectionBar.innerHTML = sections.map((s, idx) =>
            `<button class="${s === curSec ? "active" : ""}" onclick="jumpSection(${idx})">${esc(s.name)}</button>`
        ).join("");
    }
}

function renderPalette() {
    const curSec = sections[currentSectionIdx];

    palette.innerHTML = qs.map((_, n) => {
        const inCurrent = !hasSectionalTiming || curSec.indices.includes(n);
        const disabledClass = inCurrent ? "" : "disabledSection";
        const clickHandler = inCurrent ? `onclick="go(${n})"` : `onclick="alertLockedSection(${n})"`;
        return `<button class="${currentState(n)} ${n === i ? "current" : ""} ${disabledClass}" ${clickHandler} title="${inCurrent ? `Q ${n + 1}` : 'Locked: Belongs to another section'}">${n + 1}</button>`;
    }).join("");

    const c = hasSectionalTiming ? counts(curSec.indices) : counts();

    summaryCounts.innerHTML = `
        <div><b>${c.answered}</b><span>Answered</span></div>
        <div><b>${c.notAnswered}</b><span>Not Answered</span></div>
        <div><b>${c.review + c.answeredReview}</b><span>Review</span></div>
        <div><b>${c.notVisited}</b><span>Not Visited</span></div>
    `;

    // Manage section vs final test submit buttons
    if (hasSectionalTiming) {
        if (currentSectionIdx < sections.length - 1) {
            sectionSubmitBtn.style.display = "block";
            sectionSubmitBtn.textContent = `Submit ${esc(curSec.name)} & Proceed`;
            submitBtn.style.display = "none";
        } else {
            sectionSubmitBtn.style.display = "none";
            submitBtn.style.display = "block";
            submitBtn.textContent = "Submit Final Test";
        }
    } else {
        sectionSubmitBtn.style.display = "none";
        submitBtn.style.display = "block";
        submitBtn.textContent = "Submit Test";
    }
}

function alertLockedSection(n) {
    const targetSecIdx = qSectionIndices[n];
    const targetSecName = sections[targetSecIdx]?.name || "another section";
    if (targetSecIdx < currentSectionIdx) {
        alert(`Question ${n + 1} belongs to '${targetSecName}' which has already been submitted and locked.`);
    } else {
        alert(`Question ${n + 1} belongs to '${targetSecName}'. You must complete the current section first.`);
    }
}

function render() {
    visited[i] = true;

    const q = qs[i];
    const [pos, neg] = marking();

    currentSecObj = sections[currentSectionIdx] || sections[0];

    qno.textContent = `Question ${i + 1} of ${qs.length} • [${esc(currentSecObj.name)}]`;
    marks.textContent = `+${pos} / -${Number(neg).toFixed(2)}`;

    const shared = q.sharedStem || "";
    const dir = q.direction || "";
    direction.innerHTML = "";
    if (dir) {
        const d = document.createElement("div"); d.className = "questionDirection"; d.textContent = dir; direction.appendChild(d);
    }
    if (shared) {
        const s = document.createElement("div"); s.className = "sharedStem"; s.textContent = shared; direction.appendChild(s);
    }
    direction.style.display = (dir || shared) ? "block" : "none";

    question.textContent = q.question;

    options.innerHTML = (q.options || []).map((option, n) => {
        const isChecked = answers[i] !== undefined && answers[i] !== null && String(answers[i]) === String(n);
        return `
        <label class="option ${isChecked ? "selected" : ""}">
            <input
                type="radio"
                name="o"
                value="${n}"
                ${isChecked ? "checked" : ""}
                onchange="selectAnswer(${n})"
            >
            <b>${String.fromCharCode(65 + n)}.</b>
            <span>${esc(option)}</span>
        </label>
        `;
    }).join("");

    if (hasSectionalTiming) {
        prevBtn.disabled = (i === currentSecObj.startIndex);
    } else {
        prevBtn.disabled = (i === 0);
    }

    renderSections();
    renderPalette();
}

function selectAnswer(n) {
    answers[i] = n;
    render();
    syncCloudProgress();
}

function go(n) {
    if (n < 0 || n >= qs.length) return;
    if (hasSectionalTiming && !currentSecObj.indices.includes(n)) {
        alertLockedSection(n);
        return;
    }
    i = n;
    render();
    syncCloudProgress();
}

function prev() {
    if (hasSectionalTiming) {
        if (i > currentSecObj.startIndex) {
            i--;
            render();
            syncCloudProgress();
        }
    } else {
        if (i > 0) {
            i--;
            render();
            syncCloudProgress();
        }
    }
}

function moveNext() {
    if (hasSectionalTiming) {
        if (i < currentSecObj.endIndex) {
            i++;
            render();
            syncCloudProgress();
        } else {
            render();
            if (currentSectionIdx < sections.length - 1) {
                promptSectionSubmit();
            } else {
                submitTest();
            }
        }
    } else {
        if (i < qs.length - 1) {
            i++;
            render();
            syncCloudProgress();
        } else {
            render();
        }
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
    syncCloudProgress();
}

function jumpSection(sIdx) {
    if (hasSectionalTiming) return;
    const target = sections[sIdx];
    if (target && target.indices.length) {
        currentSectionIdx = sIdx;
        i = target.startIndex;
        render();
        syncCloudProgress();
    }
}

// Section submission handling
function promptSectionSubmit() {
    if (submitting) return;
    const curSec = sections[currentSectionIdx];
    const c = counts(curSec.indices);
    const attempted = c.answered + c.answeredReview;

    sectionModalTitle.textContent = `Submit ${curSec.name}?`;
    sectionModalDesc.textContent = `Once you submit this section, you CANNOT revisit or change answers for '${curSec.name}'. The next section will unlock immediately with its separate timer.`;
    sectionSummary.innerHTML = `
        <div><span>Section Questions</span><b>${curSec.indices.length}</b></div>
        <div><span>Attempted</span><b>${attempted}</b></div>
        <div><span>Not Answered</span><b>${c.notAnswered}</b></div>
        <div><span>Marked for Review</span><b>${c.review + c.answeredReview}</b></div>
        <div><span>Not Visited</span><b>${c.notVisited}</b></div>
    `;
    sectionModal.classList.remove("hidden");
}

function closeSectionModal() {
    sectionModal.classList.add("hidden");
}

function confirmSectionSubmit(auto = false) {
    sectionModal.classList.add("hidden");

    if (currentSectionIdx < sections.length - 1) {
        const finishedName = sections[currentSectionIdx].name;
        currentSectionIdx++;
        currentSecObj = sections[currentSectionIdx];
        i = currentSecObj.startIndex;
        left = currentSecObj.duration;

        render();
        syncCloudProgress();

        if (!auto) {
            alert(`✔ ${finishedName} submitted successfully!\n\nNow starting: ${currentSecObj.name} (Time: ${fmtTime(left)}).`);
        }
    } else {
        confirmSubmit(auto);
    }
}

// Entire test submission handling
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
  if (sectionModal) sectionModal.classList.add("hidden");
  submitBtn.disabled = true;
  submitBtn.textContent = "Submitting...";
  if (timerHandle) clearInterval(timerHandle);

  const responses = qs.map((_, n) => ({
    questionIndex: n,
    selectedAnswer: answers[n] !== undefined ? answers[n] : null,
    markedForReview: status[n] === "review"
  }));

  try {
    const data = await api("/api/submit-result", {
      method: "POST",
      body: JSON.stringify({ attemptId: paper.attemptId, responses, autoSubmitted: !!auto })
    });
    localStorage.setItem("lastResult", JSON.stringify({
      ...paper,
      ...data.result,
      attemptId: paper.attemptId,
      autoSubmitted: !!auto,
      completedAt: new Date().toISOString()
    }));
    localStorage.removeItem("activePaper");
    location.href = "result.htm";
  } catch (e) {
    submitting = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "Submit Test";
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
            if (hasSectionalTiming && currentSectionIdx < sections.length - 1) {
                alert(`⏰ Time is up for ${sections[currentSectionIdx].name}! Auto-advancing to next section.`);
                confirmSectionSubmit(true);
            } else {
                clearInterval(timerHandle);
                timerHandle = null;
                confirmSubmit(true);
            }
        }
    }, 1000);
}

window.addEventListener("beforeunload", e => {
    if (!submitting && left > 0) {
        e.preventDefault();
        e.returnValue = "";
    }
});

visited[i] = true;
render();
startTimer();
