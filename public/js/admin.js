let currentUser = auth.user();
if (!currentUser || currentUser.role !== 'admin') {
  location.replace("login.htm");
  throw new Error("Unauthorized");
}

let allUsers = [];
let allLogs = [];
let allAttempts = [];
let currentTab = 'users';

async function initAdmin() {
  try {
    const me = await api("/api/auth/me");
    if (me && me.user) {
      currentUser = me.user;
      auth.set(auth.token(), me.user);
    }
  } catch (e) {}

  if (!currentUser || currentUser.role !== 'admin') {
    location.replace("login.htm");
    return;
  }

  const badge = document.getElementById('adminUserBadge');
  if (badge && currentUser) {
    badge.textContent = `👑 ${currentUser.user_id || currentUser.userId || currentUser.email || 'admin@123'}`;
  }

  refreshAdminData();
}

function timeAgo(dateString) {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateString) {
  if (!dateString) return "Never";
  const d = new Date(dateString);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.adminTabBtn').forEach(b => b.classList.remove('active'));
  document.getElementById(`viewUsers`).classList.add('hidden');
  document.getElementById(`viewLogins`).classList.add('hidden');
  document.getElementById(`viewAttempts`).classList.add('hidden');

  if (tab === 'users') {
    document.getElementById('tabUsersBtn').classList.add('active');
    document.getElementById('viewUsers').classList.remove('hidden');
  } else if (tab === 'logins') {
    document.getElementById('tabLoginsBtn').classList.add('active');
    document.getElementById('viewLogins').classList.remove('hidden');
  } else if (tab === 'attempts') {
    document.getElementById('tabAttemptsBtn').classList.add('active');
    document.getElementById('viewAttempts').classList.remove('hidden');
  }
}

async function loadOverview() {
  try {
    const data = await api("/api/admin/overview");
    if (data.ok && data.overview) {
      const o = data.overview;
      kpiUsers.textContent = o.totalUsers || 0;
      kpiActiveToday.textContent = o.activeToday || 0;
      kpiAttempts.textContent = o.totalAttempts || 0;
      kpiCompletedAttempts.textContent = `${o.submittedAttempts || 0} completed`;
      kpiQuestions.textContent = (o.totalQuestions || 0).toLocaleString();
    }
  } catch (err) {
    console.error("Overview error:", err);
  }
}

async function loadUsers() {
  try {
    const data = await api("/api/admin/users");
    if (data.ok && Array.isArray(data.users)) {
      allUsers = data.users;
      userCountBadge.textContent = allUsers.length;
      renderUsers(allUsers);
    }
  } catch (err) {
    usersTbody.innerHTML = `<tr><td colspan="7" style="color:#dc2626;text-align:center;padding:20px">Failed to load users: ${esc(err.message)}</td></tr>`;
  }
}

async function loadLogs() {
  try {
    const data = await api("/api/admin/login-logs?limit=150");
    if (data.ok && Array.isArray(data.logs)) {
      allLogs = data.logs;
      renderLogs(allLogs);
    }
  } catch (err) {
    loginsTbody.innerHTML = `<tr><td colspan="6" style="color:#dc2626;text-align:center;padding:20px">Failed to load login audit: ${esc(err.message)}</td></tr>`;
  }
}

async function loadAttempts() {
  try {
    const data = await api("/api/admin/attempts?limit=100");
    if (data.ok && Array.isArray(data.attempts)) {
      allAttempts = data.attempts;
      renderAttempts(allAttempts);
    }
  } catch (err) {
    attemptsTbody.innerHTML = `<tr><td colspan="6" style="color:#dc2626;text-align:center;padding:20px">Failed to load attempts: ${esc(err.message)}</td></tr>`;
  }
}

function renderUsers(list) {
  if (!list.length) {
    usersTbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px" class="muted">No candidates found.</td></tr>`;
    return;
  }

  usersTbody.innerHTML = list.map(u => {
    let statusClass = "inactive";
    let statusText = "Never Logged In";

    if (u.isOnline) {
      statusClass = "online";
      statusText = "Online Now";
    } else if (u.lastLoginAt) {
      statusClass = "recent";
      statusText = timeAgo(u.lastLoginAt);
    }

    const initial = (u.name || u.userId || "U").trim().charAt(0).toUpperCase();

    return `
      <tr>
        <td>
          <div class="userInfo">
            <div class="userAvatar">${esc(initial)}</div>
            <div>
              <b style="font-size:14px;color:#0f2744">${esc(u.name)}</b>
              <div class="muted" style="font-size:12px">@${esc(u.userId)} • ${esc(u.email)}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="statusBadge ${u.role === 'admin' ? 'admin' : 'user'}">
            ${u.role === 'admin' ? '👑 Admin' : 'Candidate'}
          </span>
        </td>
        <td>
          <span class="statusBadge ${statusClass}">
            ${statusText}
          </span>
          ${u.lastLoginAt ? `<div class="muted" style="font-size:11px;margin-top:4px">${formatDate(u.lastLoginAt)}</div>` : ''}
          ${u.lastIp ? `<div class="muted" style="font-size:11px">IP: ${esc(u.lastIp)}</div>` : ''}
        </td>
        <td>
          <b>${u.loginCount || 0}</b>
        </td>
        <td>
          <b>${u.testsAttempted || 0}</b>
          <span class="muted" style="font-size:12px">(${u.testsCompleted || 0} finished)</span>
        </td>
        <td>
          ${u.avgAccuracy != null ? `<b>${u.avgAccuracy}%</b>` : `<span class="muted">-</span>`}
        </td>
        <td>
          <span class="muted">${formatDate(u.createdAt)}</span>
        </td>
      </tr>
    `;
  }).join("");
}

function renderLogs(list) {
  if (!list.length) {
    loginsTbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px" class="muted">No login records available yet. Logins are tracked in real-time.</td></tr>`;
    return;
  }

  loginsTbody.innerHTML = list.map(l => {
    const isSuccess = l.status === 'SUCCESS';
    return `
      <tr>
        <td>
          <b>${timeAgo(l.createdAt)}</b>
          <div class="muted" style="font-size:11px">${formatDate(l.createdAt)}</div>
        </td>
        <td>
          <b>${esc(l.userName || 'Unknown')}</b>
          ${l.userId ? `<div class="muted" style="font-size:11px">ID: ${esc(l.userId.slice(0, 8))}...</div>` : ''}
        </td>
        <td>
          <code>${esc(l.identifier)}</code>
        </td>
        <td>
          <span class="statusBadge ${isSuccess ? 'success' : 'failed'}">
            ${isSuccess ? '✔ SUCCESS' : '✖ FAILED'}
          </span>
        </td>
        <td>
          <code>${esc(l.ipAddress || 'Unknown IP')}</code>
        </td>
        <td style="max-width:280px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(l.userAgent)}">
          <span class="muted" style="font-size:12px">${esc(l.userAgent || 'Unknown')}</span>
        </td>
      </tr>
    `;
  }).join("");
}

function renderAttempts(list) {
  if (!list.length) {
    attemptsTbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px" class="muted">No mock tests attempted yet.</td></tr>`;
    return;
  }

  attemptsTbody.innerHTML = list.map(a => {
    const isDone = !!a.submittedAt;
    return `
      <tr>
        <td>
          <b>${timeAgo(a.startedAt)}</b>
          <div class="muted" style="font-size:11px">${formatDate(a.startedAt)}</div>
        </td>
        <td>
          <b>${esc(a.userName)}</b>
          <div class="muted" style="font-size:11px">@${esc(a.userHandle)}</div>
        </td>
        <td>
          <b>${esc(a.examName)}</b>
          <div class="muted" style="font-size:12px">${esc(a.stage)} • ${a.testType === 'sectional' ? esc(a.section) : 'Full Mock'}</div>
        </td>
        <td>
          ${a.score != null ? `<b>${Number(a.score).toFixed(2)}</b> / ${a.maxScore || '--'}` : '<span class="muted">-</span>'}
        </td>
        <td>
          ${a.accuracy != null ? `<b>${Number(a.accuracy).toFixed(1)}%</b>` : '<span class="muted">-</span>'}
        </td>
        <td>
          <span class="statusBadge ${isDone ? 'success' : 'recent'}">
            ${isDone ? 'Completed' : 'In Progress'}
          </span>
        </td>
      </tr>
    `;
  }).join("");
}

function filterData() {
  const query = (searchInput.value || '').trim().toLowerCase();

  if (!query) {
    renderUsers(allUsers);
    renderLogs(allLogs);
    renderAttempts(allAttempts);
    return;
  }

  const filteredUsers = allUsers.filter(u =>
    (u.name || '').toLowerCase().includes(query) ||
    (u.userId || '').toLowerCase().includes(query) ||
    (u.email || '').toLowerCase().includes(query)
  );
  renderUsers(filteredUsers);

  const filteredLogs = allLogs.filter(l =>
    (l.userName || '').toLowerCase().includes(query) ||
    (l.identifier || '').toLowerCase().includes(query) ||
    (l.ipAddress || '').toLowerCase().includes(query)
  );
  renderLogs(filteredLogs);

  const filteredAttempts = allAttempts.filter(a =>
    (a.userName || '').toLowerCase().includes(query) ||
    (a.userHandle || '').toLowerCase().includes(query) ||
    (a.examName || '').toLowerCase().includes(query)
  );
  renderAttempts(filteredAttempts);
}

async function refreshAdminData() {
  await Promise.all([loadOverview(), loadUsers(), loadLogs(), loadAttempts()]);
}

// Initial load
initAdmin();
