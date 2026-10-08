/**
 * ExamMock-AI — Dashboard Interactive Controller
 * Vanilla JavaScript (ES6+), Zero Frameworks.
 * 
 * Features:
 * - Real API integration with `/api/exams`, `/api/performance`, `/api/history`, `/api/auth/me`
 * - Fallback to `public/js/mock-data.js` for unattempted mock data & rich catalog assets
 * - Auto-rotating 3-slide Hero Banner Carousel
 * - Dynamic Circular Progress Rings (SVG)
 * - Pure SVG Grouped Bar Chart (Zero dependencies)
 * - Live real-time Search Filtering
 * - Full English & हिन्दी (Hindi) Multi-Language switching
 * - Dark / Light theme toggle with local persistence
 * - Mobile Slide-in Drawer & Interactive Modals (Ranking, Profile, Quick Start)
 */

(function () {
  'use strict';

  // State Management
  const state = {
    lang: localStorage.getItem('preferredLang') || 'en',
    theme: localStorage.getItem('theme') || 'light',
    user: null,
    exams: [],
    performance: null,
    history: [],
    heroCurrentSlide: 0,
    heroTimer: null,
    searchQuery: '',
    selectedExamForModal: null,
    activePendingList: []
  };

  // DOM Elements Cache
  const els = {
    // Theme & Lang
    html: document.documentElement,
    langBtnEn: document.getElementById('langBtnEn'),
    langBtnHi: document.getElementById('langBtnHi'),
    themeToggleBtn: document.getElementById('themeToggleBtn'),
    themeIconSun: document.getElementById('themeIconSun'),
    themeIconMoon: document.getElementById('themeIconMoon'),

    // Sidebar & Mobile Nav
    appSidebar: document.getElementById('appSidebar'),
    sidebarBackdrop: document.getElementById('sidebarBackdrop'),
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    sidebarCloseBtn: document.getElementById('sidebarCloseBtn'),
    navItemDashboard: document.getElementById('navItemDashboard'),
    navItemTraining: document.getElementById('navItemTraining'),
    navItemPreviewExams: document.getElementById('navItemPreviewExams'),
    navItemRanking: document.getElementById('navItemRanking'),
    navItemStatistics: document.getElementById('navItemStatistics'),
    navItemProfile: document.getElementById('navItemProfile'),
    navItemSettings: document.getElementById('navItemSettings'),
    navItemLogout: document.getElementById('navItemLogout'),

    // Top bar
    pageTitle: document.getElementById('pageTitle'),
    notifBtn: document.getElementById('notifBtn'),
    notifDot: document.getElementById('notifDot'),
    notifPopover: document.getElementById('notifPopover'),
    notifList: document.getElementById('notifList'),
    notifMarkReadBtn: document.getElementById('notifMarkReadBtn'),
    userProfileWidget: document.getElementById('userProfileWidget'),
    topbarUserName: document.getElementById('topbarUserName'),
    topbarUserRole: document.getElementById('topbarUserRole'),
    topbarUserAvatar: document.getElementById('topbarUserAvatar'),

    // Hero Carousel
    heroCard: document.getElementById('heroCard'),
    heroBadge: document.getElementById('heroBadge'),
    heroTitle: document.getElementById('heroTitle'),
    heroSubtitle: document.getElementById('heroSubtitle'),
    heroActionBtn: document.getElementById('heroActionBtn'),
    heroBtnText: document.getElementById('heroBtnText'),
    heroCircleFrame: document.getElementById('heroCircleFrame'),
    heroIllustrationSvg: document.getElementById('heroIllustrationSvg'),
    heroCarouselDots: document.getElementById('heroCarouselDots'),

    // Popular Section
    popularMockGrid: document.getElementById('popularMockGrid'),

    // Right Column
    examSearchInput: document.getElementById('examSearchInput'),
    searchClearBtn: document.getElementById('searchClearBtn'),
    pendingExamsList: document.getElementById('pendingExamsList'),
    statsChartContainer: document.getElementById('statsChartContainer'),

    // Modals
    startExamModal: document.getElementById('startExamModal'),
    startExamModalClose: document.getElementById('startExamModalClose'),
    modalCancelBtn: document.getElementById('modalCancelBtn'),
    modalLaunchBtn: document.getElementById('modalLaunchBtn'),
    modalExamTitle: document.getElementById('modalExamTitle'),
    modalExamMeta: document.getElementById('modalExamMeta'),
    modalTestTypeSelect: document.getElementById('modalTestTypeSelect'),
    modalSectionGroup: document.getElementById('modalSectionGroup'),
    modalSectionSelect: document.getElementById('modalSectionSelect'),
    modalLangSelect: document.getElementById('modalLangSelect'),
    modalSourceSelect: document.getElementById('modalSourceSelect'),

    rankingModal: document.getElementById('rankingModal'),
    rankingModalClose: document.getElementById('rankingModalClose'),
    rankingModalCloseBtn: document.getElementById('rankingModalCloseBtn'),
    rankingTableBody: document.getElementById('rankingTableBody'),

    profileModal: document.getElementById('profileModal'),
    profileModalClose: document.getElementById('profileModalClose'),
    profileModalCloseBtn: document.getElementById('modalProfileCloseBtn'),
    modalProfileLogoutBtn: document.getElementById('modalProfileLogoutBtn'),
    modalProfileName: document.getElementById('modalProfileName'),
    modalProfileEmail: document.getElementById('modalProfileEmail'),
    modalProfileAvatar: document.getElementById('modalProfileAvatar'),
    modalProfileTests: document.getElementById('modalProfileTests'),
    modalProfileAcc: document.getElementById('modalProfileAcc')
  };

  // --------------------------------------------------------------------------
  // SVG Icon Templates for Hero Illustrations
  // --------------------------------------------------------------------------
  const HERO_ICONS = {
    trophy: `
      <path d="M16 12h32v18c0 8.84-7.16 16-16 16s-16-7.16-16-16V12z" fill="rgba(255,255,255,0.2)"></path>
      <path d="M16 18H8c0 6.63 5.37 12 12 12"></path>
      <path d="M48 18h8c0 6.63-5.37 12-12 12"></path>
      <path d="M32 46v10"></path>
      <path d="M22 56h20"></path>
      <polygon points="32 20 34.5 25 40 26 36 30 37 36 32 33 27 36 28 30 24 26 29.5 25" fill="#FCD34D" stroke="#F59E0B"></polygon>
    `,
    rocket: `
      <path d="M48 16c-8-4-24 4-28 8-4 4-8 16-6 22 6 2 18-2 22-6 4-4 12-20 8-28z" fill="rgba(255,255,255,0.2)"></path>
      <circle cx="34" cy="30" r="4" fill="#38BDF8"></circle>
      <path d="M20 44l-6 6"></path>
      <path d="M14 36l-4 4"></path>
      <path d="M28 50l-4 4"></path>
      <path d="M40 24l8-8"></path>
    `,
    target: `
      <circle cx="32" cy="32" r="24" fill="rgba(255,255,255,0.15)"></circle>
      <circle cx="32" cy="32" r="16" fill="rgba(255,255,255,0.25)"></circle>
      <circle cx="32" cy="32" r="8" fill="#EF4444"></circle>
      <line x1="32" y1="4" x2="32" y2="12"></line>
      <line x1="32" y1="52" x2="32" y2="60"></line>
      <line x1="4" y1="32" x2="12" y2="32"></line>
      <line x1="52" y1="32" x2="60" y2="32"></line>
    `
  };

  // --------------------------------------------------------------------------
  // Initialization
  // --------------------------------------------------------------------------
  async function init() {
    setupTheme();
    setupLanguage();
    setupEventListeners();
    initHeroCarousel();

    // Load User Data
    loadUserData();

    // Load Remote and Mock Data
    await loadDashboardData();

    // Render Notifications
    renderNotifications();
  }

  // --------------------------------------------------------------------------
  // Theme Management (Dark / Light)
  // --------------------------------------------------------------------------
  function setupTheme() {
    applyTheme(state.theme);
  }

  function applyTheme(theme) {
    state.theme = theme;
    localStorage.setItem('theme', theme);
    els.html.setAttribute('data-theme', theme);

    if (theme === 'dark') {
      els.themeIconSun.style.display = 'block';
      els.themeIconMoon.style.display = 'none';
    } else {
      els.themeIconSun.style.display = 'none';
      els.themeIconMoon.style.display = 'block';
    }

    // Re-render chart to adjust SVG bar colors for dark mode contrast
    renderStatisticsChart();
  }

  function toggleTheme() {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
  }

  // --------------------------------------------------------------------------
  // Language & i18n Management (English / हिन्दी)
  // --------------------------------------------------------------------------
  function setupLanguage() {
    applyLanguage(state.lang);
  }

  function applyLanguage(lang) {
    state.lang = lang;
    localStorage.setItem('preferredLang', lang);

    // Update active button state
    els.langBtnEn.classList.toggle('active', lang === 'en');
    els.langBtnHi.classList.toggle('active', lang === 'hi');

    // Update HTML lang attribute
    els.html.setAttribute('lang', lang);

    // Translate all elements with data-i18n
    const strings = (window.EXAMMOCK_DATA && EXAMMOCK_DATA.i18n[lang]) || {};
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (strings[key]) {
        el.textContent = strings[key];
      }
    });

    // Translate placeholder attributes
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      const key = el.getAttribute('data-i18n-ph');
      if (strings[key]) {
        el.setAttribute('placeholder', strings[key]);
      }
    });

    // Update Topbar User Role
    if (els.topbarUserRole) {
      els.topbarUserRole.textContent = lang === 'hi' ? 'प्रतियोगी छात्र' : 'Aspirant';
    }

    // Re-render dynamic components with translated labels
    renderHeroSlide(state.heroCurrentSlide);
    renderPopularMocks();
    renderPendingExams();
    renderStatisticsChart();
  }

  // --------------------------------------------------------------------------
  // User Authentication & Profile
  // --------------------------------------------------------------------------
  function loadUserData() {
    const rawUser = auth.user();
    const fallback = EXAMMOCK_DATA.defaultUser;

    if (rawUser) {
      state.user = {
        name: rawUser.name || rawUser.userId || fallback.name,
        email: rawUser.email || `${rawUser.userId || 'aspirant'}@exammock.ai`,
        userId: rawUser.userId || rawUser.id,
        initials: (rawUser.name || 'AS').slice(0, 2).toUpperCase()
      };
    } else {
      // Guest / Demo candidate profile
      state.user = {
        name: fallback.name,
        email: "candidate.demo@exammock.ai",
        userId: "candidate_demo",
        initials: fallback.avatar
      };
    }

    // Apply to top bar
    if (els.topbarUserName) els.topbarUserName.textContent = state.user.name;
    if (els.topbarUserAvatar) els.topbarUserAvatar.textContent = state.user.initials;

    // Apply to profile modal
    if (els.modalProfileName) els.modalProfileName.textContent = state.user.name;
    if (els.modalProfileEmail) els.modalProfileEmail.textContent = state.user.email;
    if (els.modalProfileAvatar) els.modalProfileAvatar.textContent = state.user.initials;
  }

  // --------------------------------------------------------------------------
  // Data Fetching: APIs + Mock Data Merging
  // --------------------------------------------------------------------------
  async function loadDashboardData() {
    // 1. Fetch available exams blueprint
    try {
      const examsRes = await api('/api/exams');
      if (examsRes && examsRes.ok && Array.isArray(examsRes.exams)) {
        state.exams = examsRes.exams;
      }
    } catch (e) {
      console.warn('[Dashboard] Could not fetch /api/exams, using fallback blueprints:', e.message);
    }

    // 2. Fetch Performance & Section Stats
    if (auth.token()) {
      try {
        const perfRes = await api('/api/performance');
        if (perfRes && perfRes.ok && perfRes.stats) {
          state.performance = perfRes.stats;
          if (els.modalProfileTests) els.modalProfileTests.textContent = perfRes.stats.tests || 0;
          if (els.modalProfileAcc) els.modalProfileAcc.textContent = `${Number(perfRes.stats.averageAccuracy || 0).toFixed(1)}%`;
        }
      } catch (e) {
        console.warn('[Dashboard] Performance stats fetch error:', e.message);
      }

      // 3. Fetch History (Check for unsubmitted/pending attempts)
      try {
        const histRes = await api('/api/history');
        if (histRes && histRes.ok && Array.isArray(histRes.attempts)) {
          state.history = histRes.attempts;
          // Filter unsubmitted attempts
          const unsubmitted = histRes.attempts.filter(a => !a.submittedAt && !a.submitted_at);
          if (unsubmitted.length > 0) {
            state.activePendingList = unsubmitted.map(a => ({
              id: a.attemptId || a.id,
              titleEn: `${a.examName || a.exam || 'Mock Test'} (${a.stage || 'Prelims'})`,
              titleHi: `${a.examName || a.exam || 'मॉक टेस्ट'} (${a.stage || 'प्रीलिम्स'})`,
              examId: a.examId,
              stage: a.stage,
              paperId: a.paperId,
              progressPct: Math.floor(Math.random() * 30 + 40), // Simulated progression of attempted questions
              questionsTextEn: 'In Progress Attempt',
              questionsTextHi: 'चल रहा टेस्ट',
              timeLeftEn: 'Timer active',
              timeLeftHi: 'समय जारी',
              isRealAttempt: true
            }));
          }
        }
      } catch (e) {
        console.warn('[Dashboard] History fetch error:', e.message);
      }
    }

    // If no real pending attempts were found, keep list empty
    if (!state.activePendingList) {
      state.activePendingList = [];
    }

    // Render Cards & Sections
    renderPopularMocks();
    renderPendingExams();
    renderStatisticsChart();
  }

  // --------------------------------------------------------------------------
  // Hero Carousel Logic (Auto-rotating 3 slides)
  // --------------------------------------------------------------------------
  function initHeroCarousel() {
    renderHeroSlide(0);

    // Setup dots click listeners
    if (els.heroCarouselDots) {
      const dots = els.heroCarouselDots.querySelectorAll('.carousel-dot');
      dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
          stopHeroTimer();
          renderHeroSlide(index);
          startHeroTimer();
        });
      });
    }

    // Pause on hover
    if (els.heroCard) {
      els.heroCard.addEventListener('mouseenter', stopHeroTimer);
      els.heroCard.addEventListener('mouseleave', startHeroTimer);
    }

    startHeroTimer();
  }

  function startHeroTimer() {
    stopHeroTimer();
    state.heroTimer = setInterval(() => {
      const slides = EXAMMOCK_DATA.heroSlides;
      const nextSlide = (state.heroCurrentSlide + 1) % slides.length;
      renderHeroSlide(nextSlide);
    }, 5500);
  }

  function stopHeroTimer() {
    if (state.heroTimer) {
      clearInterval(state.heroTimer);
      state.heroTimer = null;
    }
  }

  function renderHeroSlide(index) {
    state.heroCurrentSlide = index;
    const slides = EXAMMOCK_DATA.heroSlides;
    if (!slides || !slides[index]) return;

    const s = slides[index];
    const isHi = state.lang === 'hi';

    if (els.heroBadge) els.heroBadge.textContent = isHi ? s.badgeHi : s.badgeEn;
    if (els.heroTitle) els.heroTitle.textContent = isHi ? s.titleHi : s.titleEn;
    if (els.heroSubtitle) els.heroSubtitle.textContent = isHi ? s.descHi : s.descEn;
    if (els.heroBtnText) els.heroBtnText.textContent = isHi ? s.btnTextHi : s.btnTextEn;

    // Change SVG Illustration
    if (els.heroIllustrationSvg && HERO_ICONS[s.illustration]) {
      els.heroIllustrationSvg.innerHTML = HERO_ICONS[s.illustration];
    }

    // Update active dot
    if (els.heroCarouselDots) {
      const dots = els.heroCarouselDots.querySelectorAll('.carousel-dot');
      dots.forEach((dot, i) => {
        const isActive = i === index;
        dot.classList.toggle('active', isActive);
        dot.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
    }
  }

  // --------------------------------------------------------------------------
  // Popular Mock Tests (2-Column Grid with Circular Progress Rings)
  // --------------------------------------------------------------------------
  function renderPopularMocks() {
    if (!els.popularMockGrid) return;

    const query = (state.searchQuery || '').trim().toLowerCase();
    const isHi = state.lang === 'hi';
    const allMocks = EXAMMOCK_DATA.popularMocks || [];

    // Filter by search query
    const filtered = allMocks.filter(m => {
      if (!query) return true;
      const title = (isHi ? m.titleHi : m.titleEn).toLowerCase();
      const cat = (m.category || '').toLowerCase();
      const examId = (m.examId || '').toLowerCase();
      const tag = (isHi ? m.tagHi : m.tagEn).toLowerCase();
      return title.includes(query) || cat.includes(query) || examId.includes(query) || tag.includes(query);
    });

    if (filtered.length === 0) {
      els.popularMockGrid.innerHTML = `
        <div class="empty-box" style="grid-column: 1 / -1;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <b>${isHi ? 'कोई मॉक टेस्ट नहीं मिला' : 'No mock tests match your search'}</b>
          <p>${isHi ? 'कृपया "IBPS", "SBI", "SSC", या "CGL" खोजकर देखें।' : 'Try searching "IBPS", "SBI", "SSC", or "CGL".'}</p>
          <button class="pending-skip-btn" onclick="document.getElementById('examSearchInput').value=''; document.getElementById('examSearchInput').dispatchEvent(new Event('input'));">
            ${isHi ? 'खोज हटाएं' : 'Clear search'}
          </button>
        </div>
      `;
      return;
    }

    // Build Cards HTML
    const cardsHtml = filtered.map(mock => {
      const title = isHi ? mock.titleHi : mock.titleEn;
      const sections = isHi ? mock.sectionsHi : mock.sectionsEn;
      const attempts = isHi ? mock.attemptsHi : mock.attemptsEn;
      const dateMeta = isHi ? mock.dateMetaHi : mock.dateMetaEn;
      const tag = isHi ? mock.tagHi : mock.tagEn;
      const btnText = isHi ? 'टेस्ट शुरू करें' : 'Enroll Now';

      // SVG Circular Progress calculation
      const pct = mock.accuracyScore || 75;
      const radius = 20;
      const circumference = 2 * Math.PI * radius; // ~125.66
      const offset = circumference - (pct / 100) * circumference;
      const ringColor = mock.ringColor || '#1B6CA8';

      return `
        <article class="mock-card" data-exam-id="${esc(mock.examId)}" data-stage="${esc(mock.stage)}">
          <div class="mock-card-top">
            <!-- Circular Progress Ring (SVG) -->
            <div class="progress-ring-wrap" title="Average Score: ${pct}%">
              <svg class="progress-ring-svg" viewBox="0 0 52 52">
                <circle class="progress-ring-bg" cx="26" cy="26" r="${radius}"></circle>
                <circle 
                  class="progress-ring-circle" 
                  cx="26" 
                  cy="26" 
                  r="${radius}" 
                  stroke="${ringColor}" 
                  stroke-dasharray="${circumference}" 
                  stroke-dashoffset="${offset}"
                ></circle>
              </svg>
              <span class="progress-ring-text">${pct}%</span>
            </div>

            <!-- Card Info -->
            <div class="mock-card-info">
              <span class="mock-card-badge">${esc(tag)}</span>
              <h4 class="mock-card-title" title="${esc(title)}">${esc(title)}</h4>
              <div class="mock-meta-row">
                <span class="mock-meta-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="16" y1="2" x2="16" y2="6"></line>
                    <line x1="8" y1="2" x2="8" y2="6"></line>
                  </svg>
                  ${esc(sections)}
                </span>
                <span class="mock-meta-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                  </svg>
                  ${esc(attempts)}
                </span>
                <span class="mock-meta-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                  ${esc(dateMeta)}
                </span>
              </div>
            </div>
          </div>

          <!-- Enroll / Start Test Button -->
          <button type="button" class="mock-card-btn" data-action="enroll" data-id="${esc(mock.id)}">
            <span>${btnText}</span>
            <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2.2" fill="none">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        </article>
      `;
    }).join('');

    els.popularMockGrid.innerHTML = cardsHtml;

    // Attach click listeners to cards
    els.popularMockGrid.querySelectorAll('[data-action="enroll"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const card = e.target.closest('.mock-card');
        if (!card) return;
        const examId = card.getAttribute('data-exam-id');
        const stage = card.getAttribute('data-stage');
        openStartExamModal(examId, stage);
      });
    });
  }

  // --------------------------------------------------------------------------
  // Pending Exams Widget (Skip & Continue)
  // --------------------------------------------------------------------------
  function renderPendingExams() {
    if (!els.pendingExamsList) return;

    const isHi = state.lang === 'hi';
    const query = (state.searchQuery || '').trim().toLowerCase();
    const list = state.activePendingList || [];

    const filtered = list.filter(item => {
      if (!query) return true;
      const title = (isHi ? item.titleHi : item.titleEn).toLowerCase();
      return title.includes(query);
    });

    if (filtered.length === 0) {
      els.pendingExamsList.innerHTML = `
        <div class="empty-box" style="padding:20px 10px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span style="font-size:0.82rem;">${isHi ? 'कोई अधूरा टेस्ट नहीं है।' : 'No pending exams.'}</span>
        </div>
      `;
      return;
    }

    const html = filtered.map(item => {
      const title = isHi ? item.titleHi : item.titleEn;
      const questionsText = isHi ? item.questionsTextHi : item.questionsTextEn;
      const timeLeft = isHi ? item.timeLeftHi : item.timeLeftEn;
      const skipLabel = isHi ? 'छोड़ें' : 'Skip';
      const continueLabel = isHi ? 'जारी रखें' : 'Continue';

      return `
        <div class="pending-card" id="pendingCard-${item.id}">
          <div class="pending-card-top">
            <h5 class="pending-exam-title">${esc(title)}</h5>
            <span class="pending-pct-badge">${item.progressPct}%</span>
          </div>

          <div class="mini-progress-bar">
            <div class="mini-progress-fill" style="width: ${item.progressPct}%;"></div>
          </div>

          <div class="pending-meta-text">
            <span>${esc(questionsText)}</span>
            <span>${esc(timeLeft)}</span>
          </div>

          <div class="pending-btn-row">
            <button type="button" class="pending-skip-btn" data-skip-id="${item.id}">
              ${skipLabel}
            </button>
            <button type="button" class="pending-continue-btn" data-continue-id="${item.id}" data-real="${item.isRealAttempt ? 'true' : 'false'}">
              ${continueLabel}
            </button>
          </div>
        </div>
      `;
    }).join('');

    els.pendingExamsList.innerHTML = html;

    // Attach listeners for Skip & Continue
    els.pendingExamsList.querySelectorAll('[data-skip-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-skip-id');
        skipPendingExam(id);
      });
    });

    els.pendingExamsList.querySelectorAll('[data-continue-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-continue-id');
        const isReal = btn.getAttribute('data-real') === 'true';
        continuePendingExam(id, isReal);
      });
    });
  }

  function skipPendingExam(id) {
    state.activePendingList = state.activePendingList.filter(item => String(item.id) !== String(id));
    const cardEl = document.getElementById(`pendingCard-${id}`);
    if (cardEl) {
      cardEl.style.opacity = '0';
      cardEl.style.transform = 'translateX(20px)';
      setTimeout(() => renderPendingExams(), 200);
    } else {
      renderPendingExams();
    }
  }

  async function continuePendingExam(id, isReal) {
    if (isReal && auth.token()) {
      try {
        const res = await api(`/api/attempt/${id}`);
        if (res && res.attempt) {
          const a = res.attempt;
          const activePaper = {
            attemptId: a.id,
            paperId: a.paper_id,
            examId: a.exam_id,
            exam: a.exam_name,
            stage: a.stage,
            testType: a.test_type,
            section: a.section,
            language: a.language,
            duration: a.duration || 3600,
            questions: a.questions || []
          };
          localStorage.setItem('activePaper', JSON.stringify(activePaper));
          window.location.href = 'test.htm';
          return;
        }
      } catch (e) {
        console.warn('[Dashboard] Could not resume attempt, creating new:', e.message);
      }
    }

    // Default mock resume: open exam modal for that pending test
    const item = state.activePendingList.find(x => String(x.id) === String(id));
    if (item && item.examId) {
      openStartExamModal(item.examId, item.stage || 'Prelims');
    } else {
      window.location.href = 'mocks.htm';
    }
  }

  // --------------------------------------------------------------------------
  // Statistics Bar Chart (Pure SVG, 2 bars per section group, NO heavy library)
  // Section groups: Reasoning, Quant, English
  // Dark Blue (#0E3F6B) + Light Blue (#1B6CA8)
  // --------------------------------------------------------------------------
  function renderStatisticsChart() {
    if (!els.statsChartContainer) return;

    const isHi = state.lang === 'hi';
    const isDark = state.theme === 'dark';

    // Palette for dark / light modes
    const barDarkBlue = isDark ? '#38BDF8' : '#0E3F6B';
    const barLightBlue = isDark ? '#1D4ED8' : '#1B6CA8';
    const textAxisColor = isDark ? '#94A3B8' : '#64748B';
    const gridLineColor = isDark ? '#1E2F48' : '#E8EEF5';

    // Section benchmarks: prioritize real user accuracy from `/api/performance`
    let data = [...EXAMMOCK_DATA.sectionStats];

    if (state.performance && Array.isArray(state.performance.sections) && state.performance.sections.length > 0) {
      data = data.map(group => {
        const match = state.performance.sections.find(s => {
          const sName = (s.section || '').toLowerCase();
          return sName.includes(group.id) || group.nameEn.toLowerCase().includes(sName);
        });
        if (match && match.accuracy !== undefined) {
          return {
            ...group,
            userScore: Math.round(Number(match.accuracy || 0))
          };
        }
        return {
          ...group,
          userScore: 0
        };
      });
    } else {
      data = data.map(group => ({ ...group, userScore: 0 }));
    }

    // SVG Chart Geometry
    const svgWidth = 280;
    const svgHeight = 175;
    const paddingLeft = 32;
    const paddingRight = 14;
    const paddingTop = 22;
    const paddingBottom = 28;

    const plotWidth = svgWidth - paddingLeft - paddingRight;
    const plotHeight = svgHeight - paddingTop - paddingBottom;

    // 3 groups -> group width & bar width
    const groupCount = data.length;
    const groupWidth = plotWidth / groupCount;
    const barWidth = 14;
    const barGap = 4;

    // Gridlines at 0%, 50%, 100%
    const gridLevels = [0, 50, 100];
    const gridLinesSvg = gridLevels.map(lvl => {
      const y = paddingTop + plotHeight - (lvl / 100) * plotHeight;
      return `
        <line x1="${paddingLeft}" y1="${y}" x2="${svgWidth - paddingRight}" y2="${y}" stroke="${gridLineColor}" stroke-width="1" stroke-dasharray="2,3" />
        <text x="${paddingLeft - 6}" y="${y + 3}" fill="${textAxisColor}" font-size="9" text-anchor="end" font-family="Poppins, sans-serif">${lvl}%</text>
      `;
    }).join('');

    // Bars for each group
    const groupsSvg = data.map((d, i) => {
      const groupCenterX = paddingLeft + i * groupWidth + groupWidth / 2;
      const b1X = groupCenterX - barWidth - barGap / 2;
      const b2X = groupCenterX + barGap / 2;

      const userVal = Math.max(2, Math.min(100, d.userScore));
      const avgVal = Math.max(2, Math.min(100, d.avgScore));

      const b1H = (userVal / 100) * plotHeight;
      const b2H = (avgVal / 100) * plotHeight;

      const b1Y = paddingTop + plotHeight - b1H;
      const b2Y = paddingTop + plotHeight - b2H;

      const label = isHi ? d.nameHi.split(' ')[0] : d.nameEn;

      return `
        <g class="chart-group">
          <!-- Bar 1: User Score (Dark Blue) -->
          <rect 
            class="chart-bar" 
            x="${b1X}" 
            y="${b1Y}" 
            width="${barWidth}" 
            height="${b1H}" 
            rx="3" 
            fill="${barDarkBlue}"
          >
            <title>${isHi ? 'आपका स्कोर: ' : 'Your Score: '}${userVal}%</title>
          </rect>
          <!-- Value Label Above Bar 1 -->
          <text x="${b1X + barWidth / 2}" y="${b1Y - 4}" fill="${barDarkBlue}" font-size="8.5" font-weight="700" text-anchor="middle" font-family="Poppins, sans-serif">${userVal}%</text>

          <!-- Bar 2: Avg Score (Light Blue) -->
          <rect 
            class="chart-bar" 
            x="${b2X}" 
            y="${b2Y}" 
            width="${barWidth}" 
            height="${b2H}" 
            rx="3" 
            fill="${barLightBlue}"
          >
            <title>${isHi ? 'अखिल भारतीय औसत: ' : 'All-India Avg: '}${avgVal}%</title>
          </rect>
          <!-- Value Label Above Bar 2 -->
          <text x="${b2X + barWidth / 2}" y="${b2Y - 4}" fill="${barLightBlue}" font-size="8.5" font-weight="600" text-anchor="middle" font-family="Poppins, sans-serif">${avgVal}%</text>

          <!-- X Axis Section Label Below -->
          <text x="${groupCenterX}" y="${svgHeight - 8}" fill="${textAxisColor}" font-size="10" font-weight="600" text-anchor="middle" font-family="Poppins, sans-serif">${esc(label)}</text>
        </g>
      `;
    }).join('');

    // Render Full SVG
    els.statsChartContainer.innerHTML = `
      <svg viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet">
        <!-- Horizontal Grid Lines -->
        ${gridLinesSvg}

        <!-- Base Axis Line -->
        <line x1="${paddingLeft}" y1="${paddingTop + plotHeight}" x2="${svgWidth - paddingRight}" y2="${paddingTop + plotHeight}" stroke="${textAxisColor}" stroke-width="1.2" />

        <!-- Bars & Labels -->
        ${groupsSvg}
      </svg>
    `;
  }

  // --------------------------------------------------------------------------
  // Notifications Popover
  // --------------------------------------------------------------------------
  function renderNotifications() {
    if (!els.notifList) return;

    const notifs = EXAMMOCK_DATA.notifications || [];
    const isHi = state.lang === 'hi';

    if (notifs.length === 0) {
      els.notifList.innerHTML = `<div class="empty-box" style="padding:16px;">${isHi ? 'कोई नई सूचना नहीं है।' : 'No notifications.'}</div>`;
      if (els.notifDot) els.notifDot.style.display = 'none';
      return;
    }

    const unreadCount = notifs.filter(n => n.unread).length;
    if (els.notifDot) {
      els.notifDot.style.display = unreadCount > 0 ? 'block' : 'none';
    }

    const html = notifs.map(n => `
      <div class="notif-item ${n.unread ? 'unread' : ''}">
        <div class="notif-item-body">
          <b>${esc(isHi ? n.titleHi : n.titleEn)}</b>
          <p>${esc(isHi ? n.textHi : n.textEn)}</p>
          <span>${esc(isHi ? n.timeHi : n.timeEn)}</span>
        </div>
      </div>
    `).join('');

    els.notifList.innerHTML = html;
  }

  // --------------------------------------------------------------------------
  // Modals Management
  // --------------------------------------------------------------------------
  function openStartExamModal(examId, stage) {
    let examObj = (state.exams || []).find(x => x.examId === examId && (!stage || x.stage === stage));

    if (!examObj) {
      // Create fallback configuration object
      examObj = {
        examId: examId || 'ibps-clerk',
        exam: examId ? examId.toUpperCase().replace('-', ' ') : 'IBPS PO Prelims',
        stage: stage || 'Prelims',
        sections: [
          { id: 'reasoning', name: 'Reasoning Ability', count: 35 },
          { id: 'quant', name: 'Quantitative Aptitude', count: 35 },
          { id: 'english', name: 'English Language', count: 30 }
        ],
        duration: 3600
      };
    }

    state.selectedExamForModal = examObj;

    if (els.modalExamTitle) {
      els.modalExamTitle.textContent = `${examObj.exam} • ${examObj.stage}`;
    }
    if (els.modalExamMeta) {
      const qCount = (examObj.sections || []).reduce((s, x) => s + (Number(x.count) || 0), 0) || 100;
      const mins = Math.round((Number(examObj.duration) || 3600) / 60);
      els.modalExamMeta.textContent = `${qCount} Questions • ${mins} Minutes • Standard CBT Interface`;
    }

    // Populate Section Select
    if (els.modalSectionSelect) {
      const sections = examObj.sections || [];
      els.modalSectionSelect.innerHTML = sections.map(s => `
        <option value="${esc(s.id || s.name)}">${esc(s.name)}</option>
      `).join('');
    }

    // Reset selects
    if (els.modalTestTypeSelect) els.modalTestTypeSelect.value = 'full';
    if (els.modalSectionGroup) els.modalSectionGroup.style.display = 'none';

    els.startExamModal.classList.add('open');
  }

  async function launchExamFromModal() {
    if (!state.selectedExamForModal) return;

    const testType = els.modalTestTypeSelect ? els.modalTestTypeSelect.value : 'full';
    const section = testType === 'sectional' && els.modalSectionSelect ? els.modalSectionSelect.value : '';
    const language = els.modalLangSelect ? els.modalLangSelect.value : 'ENGLISH';
    const mode = els.modalSourceSelect ? els.modalSourceSelect.value : 'bank';
    const isAi = mode === 'ai';

    // If not logged in, prompt or redirect to login.htm
    if (!auth.token()) {
      if (confirm(state.lang === 'hi' ? 'टेस्ट शुरू करने के लिए लॉगिन आवश्यक है। क्या आप लॉगिन पेज पर जाना चाहते हैं?' : 'Login is required to launch mock tests. Go to login page?')) {
        window.location.href = 'login.htm';
      }
      return;
    }

    els.modalLaunchBtn.disabled = true;
    els.modalLaunchBtn.textContent = isAi ? 'AI is generating questions...' : 'Preparing paper...';

    try {
      const res = await api('/api/start-mock', {
        method: 'POST',
        body: JSON.stringify({
          examId: state.selectedExamForModal.examId,
          stage: state.selectedExamForModal.stage,
          testType: testType,
          section: section,
          language: language,
          mode: mode
        })
      });

      if (res && res.paper) {
        localStorage.setItem('activePaper', JSON.stringify(res.paper));
        window.location.href = 'test.htm';
      } else {
        throw new Error('Failed to obtain paper');
      }
    } catch (e) {
      alert(e.message || 'Could not start exam. Redirecting to mock configuration.');
      window.location.href = 'mocks.htm';
    } finally {
      els.modalLaunchBtn.disabled = false;
      els.modalLaunchBtn.textContent = state.lang === 'hi' ? 'मॉक टेस्ट अभी शुरू करें' : 'Launch Mock Test Now';
    }
  }

  function openRankingModal() {
    if (!els.rankingTableBody) return;

    const data = EXAMMOCK_DATA.ranking || [];
    const html = data.map(item => {
      let rankBadgeClass = '';
      if (item.rank === 1) rankBadgeClass = 'rank-1';
      else if (item.rank === 2) rankBadgeClass = 'rank-2';
      else if (item.rank === 3) rankBadgeClass = 'rank-3';

      return `
        <tr class="${item.isCurrent ? 'current-user' : ''}">
          <td>
            <span class="rank-badge ${rankBadgeClass}">${item.rank}</span>
          </td>
          <td>
            <b>${esc(item.name)}</b>
            <div style="font-size:0.75rem; color:var(--text-muted);">${esc(item.state || 'India')}</div>
          </td>
          <td><b>${esc(item.score)}</b></td>
          <td><span style="color:var(--color-primary); font-weight:700;">${esc(item.percentile)}</span></td>
        </tr>
      `;
    }).join('');

    els.rankingTableBody.innerHTML = html;
    els.rankingModal.classList.add('open');
  }

  function openProfileModal() {
    loadUserData();
    els.profileModal.classList.add('open');
  }

  // --------------------------------------------------------------------------
  // Event Listeners
  // --------------------------------------------------------------------------
  function setupEventListeners() {
    // Language Toggle
    if (els.langBtnEn) els.langBtnEn.addEventListener('click', () => applyLanguage('en'));
    if (els.langBtnHi) els.langBtnHi.addEventListener('click', () => applyLanguage('hi'));

    // Dark Mode Toggle
    if (els.themeToggleBtn) els.themeToggleBtn.addEventListener('click', toggleTheme);

    // Mobile Hamburger
    if (els.mobileMenuBtn) {
      els.mobileMenuBtn.addEventListener('click', () => {
        els.appSidebar.classList.add('mobile-open');
        els.sidebarBackdrop.classList.add('mobile-open');
      });
    }

    if (els.sidebarCloseBtn) {
      els.sidebarCloseBtn.addEventListener('click', closeMobileSidebar);
    }

    if (els.sidebarBackdrop) {
      els.sidebarBackdrop.addEventListener('click', closeMobileSidebar);
    }

    function closeMobileSidebar() {
      els.appSidebar.classList.remove('mobile-open');
      els.sidebarBackdrop.classList.remove('mobile-open');
    }

    // Sidebar Action Buttons
    if (els.navItemRanking) els.navItemRanking.addEventListener('click', openRankingModal);
    if (els.navItemProfile) els.navItemProfile.addEventListener('click', openProfileModal);
    if (els.userProfileWidget) els.userProfileWidget.addEventListener('click', openProfileModal);

    if (els.navItemSettings) {
      els.navItemSettings.addEventListener('click', () => {
        toggleTheme();
      });
    }

    if (els.navItemLogout) {
      els.navItemLogout.addEventListener('click', () => {
        logout();
      });
    }

    if (els.modalProfileLogoutBtn) {
      els.modalProfileLogoutBtn.addEventListener('click', () => {
        logout();
      });
    }

    // Notifications Popover Toggle
    if (els.notifBtn) {
      els.notifBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        els.notifPopover.classList.toggle('show');
      });
    }

    document.addEventListener('click', (e) => {
      if (els.notifPopover && !els.notifPopover.contains(e.target) && e.target !== els.notifBtn) {
        els.notifPopover.classList.remove('show');
      }
    });

    if (els.notifMarkReadBtn) {
      els.notifMarkReadBtn.addEventListener('click', () => {
        if (EXAMMOCK_DATA.notifications) {
          EXAMMOCK_DATA.notifications.forEach(n => n.unread = false);
        }
        renderNotifications();
      });
    }

    // Live Search Input Filter
    if (els.examSearchInput) {
      els.examSearchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        els.searchClearBtn.classList.toggle('visible', !!state.searchQuery);
        renderPopularMocks();
        renderPendingExams();
      });
    }

    if (els.searchClearBtn) {
      els.searchClearBtn.addEventListener('click', () => {
        els.examSearchInput.value = '';
        state.searchQuery = '';
        els.searchClearBtn.classList.remove('visible');
        renderPopularMocks();
        renderPendingExams();
        els.examSearchInput.focus();
      });
    }

    // Hero Action Button
    if (els.heroActionBtn) {
      els.heroActionBtn.addEventListener('click', () => {
        const slide = EXAMMOCK_DATA.heroSlides[state.heroCurrentSlide];
        if (slide && slide.targetExamId) {
          openStartExamModal(slide.targetExamId, slide.targetStage);
        } else {
          window.location.href = 'mocks.htm';
        }
      });
    }

    // Modal Test Type Change
    if (els.modalTestTypeSelect) {
      els.modalTestTypeSelect.addEventListener('change', () => {
        if (els.modalSectionGroup) {
          els.modalSectionGroup.style.display = els.modalTestTypeSelect.value === 'sectional' ? 'block' : 'none';
        }
      });
    }

    // Modal Close Buttons
    if (els.startExamModalClose) els.startExamModalClose.addEventListener('click', () => els.startExamModal.classList.remove('open'));
    if (els.modalCancelBtn) els.modalCancelBtn.addEventListener('click', () => els.startExamModal.classList.remove('open'));
    if (els.modalLaunchBtn) els.modalLaunchBtn.addEventListener('click', launchExamFromModal);

    if (els.rankingModalClose) els.rankingModalClose.addEventListener('click', () => els.rankingModal.classList.remove('open'));
    if (els.rankingModalCloseBtn) els.rankingModalCloseBtn.addEventListener('click', () => els.rankingModal.classList.remove('open'));

    if (els.profileModalClose) els.profileModalClose.addEventListener('click', () => els.profileModal.classList.remove('open'));
    if (els.profileModalCloseBtn) els.profileModalCloseBtn.addEventListener('click', () => els.profileModal.classList.remove('open'));

    // Close modals on Esc key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
        if (els.notifPopover) els.notifPopover.classList.remove('show');
      }
    });
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------
  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // Auto-run when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();