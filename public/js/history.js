if (guard()) {
    nav("tests");
    load();
}

function val(a, ...keys) {
    for (const k of keys) {
        if (a && a[k] !== undefined && a[k] !== null) return a[k];
    }
    return null;
}

function attemptId(a) {
    return val(a, "attemptId", "attempt_id", "id");
}

function isSubmitted(a) {
    return !!val(a, "submittedAt", "submitted_at");
}

function examName(a) {
    return val(a, "examName", "exam_name", "exam") || "Mock Test";
}

function testLabel(a) {
    const type = val(a, "testType", "test_type");
    const section = val(a, "section") || "";
    return type === "sectional"
        ? `Sectional${section ? ` • ${esc(section)}` : ""}`
        : "Full Mock";
}

function languageLabel(a) {
    return String(val(a, "language") || "ENGLISH").toUpperCase() === "HINDI"
        ? "हिन्दी"
        : "English";
}

function dateLabel(a) {
    const raw = val(a, "startedAt", "started_at");
    if (!raw) return "—";
    let text = String(raw);
    if (!/[zZ]|[+-]\d\d:\d\d$/.test(text)) text += "Z";
    const d = new Date(text);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("en-IN");
}

function timeLabel(a) {
    const seconds = Number(val(a, "totalTimeSeconds", "total_time_seconds") || 0);
    return isSubmitted(a) ? fmtTime(seconds) : "—";
}

function scoreLabel(a) {
    if (!isSubmitted(a)) return "—";
    return `${Number(val(a, "score") || 0).toFixed(2)} / ${Number(val(a, "maxScore", "max_score") || 0).toFixed(2)}`;
}

function cwu(a) {
    if (!isSubmitted(a)) return "—";
    return `${Number(val(a, "correct") || 0)} / ${Number(val(a, "wrong") || 0)} / ${Number(val(a, "unattempted") || 0)}`;
}

function accuracyLabel(a) {
    return isSubmitted(a)
        ? `${Number(val(a, "accuracy") || 0).toFixed(1)}%`
        : "—";
}

function actionHtml(a) {
    const id = attemptId(a);
    const submitted = isSubmitted(a);

    return `
        <div class="historyActions">
            <button class="btn" onclick="review(${Number(id)})" ${submitted ? "" : "disabled"}>
                Review Attempt
            </button>
            <button class="btn primary" onclick="retry(${Number(id)}, this)">
                Attempt Again
            </button>
        </div>
    `;
}

async function load() {
    try {
        const d = await api("/api/history");
        const attempts = Array.isArray(d.attempts) ? d.attempts : [];

        if (!attempts.length) {
            empty.classList.remove("hidden");
            return;
        }

        rows.innerHTML = attempts.map(a => `
            <tr>
                <td>
                    <b>${esc(examName(a))}</b>
                    <div class="attemptMeta">${esc(val(a, "stage") || "")}</div>
                </td>
                <td>${testLabel(a)}</td>
                <td>${languageLabel(a)}</td>
                <td>
                    <span class="statusBadge ${isSubmitted(a) ? "done" : "progress"}">
                        ${isSubmitted(a) ? "COMPLETED" : "IN PROGRESS"}
                    </span>
                </td>
                <td><b>${scoreLabel(a)}</b></td>
                <td>${cwu(a)}</td>
                <td>${accuracyLabel(a)}</td>
                <td>${timeLabel(a)}</td>
                <td>${dateLabel(a)}</td>
                <td>${actionHtml(a)}</td>
            </tr>
        `).join("");

        cards.innerHTML = attempts.map(a => `
            <article class="historyCard">
                <div class="historyCardTop">
                    <div>
                        <b>${esc(examName(a))}</b>
                        <div class="attemptMeta">${esc(val(a, "stage") || "")} • ${testLabel(a)} • ${languageLabel(a)}</div>
                    </div>
                    <span class="statusBadge ${isSubmitted(a) ? "done" : "progress"}">
                        ${isSubmitted(a) ? "COMPLETED" : "IN PROGRESS"}
                    </span>
                </div>

                <div class="historyCardGrid">
                    <div><span>Score</span><b>${scoreLabel(a)}</b></div>
                    <div><span>Accuracy</span><b>${accuracyLabel(a)}</b></div>
                    <div><span>Time</span><b>${timeLabel(a)}</b></div>
                    <div><span>Correct / Wrong / Unattempted</span><b>${cwu(a)}</b></div>
                    <div><span>Started</span><b>${dateLabel(a)}</b></div>
                </div>

                ${actionHtml(a)}
            </article>
        `).join("");

    } catch (e) {
        empty.textContent = e.message || "Could not load attempt history.";
        empty.classList.remove("hidden");
    }
}

async function review(id) {
    try {
        const d = await api("/api/attempt/" + id);
        const a = d.attempt;

        if (!a) throw Error("Attempt not found.");

        // Keep both keys ready:
        // result.htm reads lastResult; solutions.htm reads reviewAttempt.
        localStorage.setItem("lastResult", JSON.stringify(a));
        localStorage.setItem("reviewAttempt", JSON.stringify(a));

        location.href = "result.htm";
    } catch (e) {
        alert(e.message || "Could not open this attempt.");
    }
}

async function retry(id, button) {
    const oldText = button ? button.textContent : "";

    try {
        if (button) {
            button.disabled = true;
            button.textContent = "Starting...";
        }

        const d = await api(`/api/attempt/${id}/retry`, { method: "POST" });

        if (!d.paper || !d.paper.questions?.length) {
            throw Error("The saved paper could not be loaded.");
        }

        // Exact same paper, but backend has created a NEW attempt row.
        localStorage.setItem("activePaper", JSON.stringify(d.paper));
        location.href = "test.htm";
    } catch (e) {
        if (button) {
            button.disabled = false;
            button.textContent = oldText;
        }
        alert(e.message || "Could not start this paper again.");
    }
}
