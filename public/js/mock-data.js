/**
 * ExamMock-AI — Mock Data Catalog & Fallbacks
 * 
 * This file contains mock data used when:
 * 1. The user has not attempted mocks yet, or
 * 2. Visual assets / rich catalog metadata (like student counts, ratings, carousel slides)
 *    are displayed alongside live API data.
 * 
 * Replace or edit values in this file to customize demo catalogs, announcements, and benchmarks.
 */

const EXAMMOCK_DATA = {
  // --------------------------------------------------------------------------
  // Default Aspirant / User Profile fallback (when guest or before API fetch)
  // --------------------------------------------------------------------------
  defaultUser: {
    name: "Aditya Sharma",
    roleEn: "Aspirant • Target SBI / IBPS 2026",
    roleHi: "प्रतियोगी छात्र • लक्ष्य SBI / IBPS 2026",
    avatar: "AS",
    targetExam: "IBPS PO / SBI Clerk",
    testsAttempted: 14,
    avgScore: "78.4%",
    airRank: "#142"
  },

  // --------------------------------------------------------------------------
  // Hero Banner Carousel Slides (3 auto-rotating slides)
  // --------------------------------------------------------------------------
  heroSlides: [
    {
      id: "slide-ibps-po",
      badgeEn: "NEW BLUEPRINT 2026",
      badgeHi: "नया पैटर्न 2026",
      titleEn: "New Exams Available Now!",
      titleHi: "नए मॉक टेस्ट अब उपलब्ध हैं!",
      descEn: "Full-length IBPS PO & Clerk Prelims series with authentic sectional timer and latest syllogism & puzzle patterns.",
      descHi: "नवीनतम सेक्शनल टाइमर और पहेली पैटर्न के साथ आईबीपीएस पीओ और क्लर्क प्रीलिम्स की संपूर्ण टेस्ट श्रृंखला।",
      btnTextEn: "Explore More >",
      btnTextHi: "और देखें >",
      targetExamId: "ibps-clerk",
      targetStage: "Prelims",
      illustration: "trophy",
      badgeColor: "#F59E0B"
    },
    {
      id: "slide-sbi-clerk",
      badgeEn: "ALL INDIA LIVE MOCK",
      badgeHi: "अखिल भारतीय लाइव टेस्ट",
      titleEn: "SBI PO & Clerk Mega Speed Drill",
      titleHi: "एसबीआई पीओ एवं क्लर्क मेगा स्पीड ड्रिल",
      descEn: "Compete with 45,000+ banking aspirants across India. Instant percentile prediction and AI sectional feedback.",
      descHi: "देश भर के 45,000+ अभ्यर्थियों के साथ प्रतिस्पर्धा करें। त्वरित पर्सेंटाइल और एआई सेक्शनल समीक्षा प्राप्त करें।",
      btnTextEn: "Take Challenge >",
      btnTextHi: "चुनौती शुरू करें >",
      targetExamId: "sbi-po",
      targetStage: "Prelims",
      illustration: "rocket",
      badgeColor: "#10B981"
    },
    {
      id: "slide-ssc-cgl",
      badgeEn: "SSC TIER-I READY POOL",
      badgeHi: "एसएससी टियर-I विशेष",
      titleEn: "SSC CGL 2026 All-Rounder Mock",
      titleHi: "एसएससी सीजीएल 2026 ऑल-राउंडर मॉक",
      descEn: "Tier-I CBT papers covering Quantitative Aptitude, Reasoning, GA and English with strict negative marking calculation.",
      descHi: "गणित, रीजनिंग, सामान्य जागरूकता और अंग्रेजी के 100 प्रश्नों का पूर्ण टेस्ट, वास्तविक नेगेटिव मार्किंग के साथ।",
      btnTextEn: "Enroll Now >",
      btnTextHi: "नामांकन करें >",
      targetExamId: "ssc-cgl",
      targetStage: "Tier-I",
      illustration: "target",
      badgeColor: "#8B5CF6"
    }
  ],

  // --------------------------------------------------------------------------
  // Popular Mock Tests (2-column grid in light blue container)
  // Circular progress ring shows benchmark accuracy / completion score.
  // --------------------------------------------------------------------------
  popularMocks: [
    {
      id: "mock-ibps-po-12",
      titleEn: "IBPS PO Prelims Mock 12",
      titleHi: "आईबीपीएस पीओ प्रीलिम्स मॉक 12",
      category: "banking",
      examId: "sbi-po",
      stage: "Prelims",
      accuracyScore: 78,
      ringColor: "#1B6CA8",
      sectionsEn: "3 Sections • 100 Questions",
      sectionsHi: "3 खंड • 100 प्रश्न",
      attemptsEn: "14.2k Attempted",
      attemptsHi: "14.2k अभ्यर्थियों ने दिया",
      dateMetaEn: "60 Mins • Updated Today",
      dateMetaHi: "60 मिनट • आज अपडेटेड",
      tagEn: "Trending",
      tagHi: "ट्रेंडिंग"
    },
    {
      id: "mock-sbi-clerk-08",
      titleEn: "SBI Clerk Prelims Speed Test 08",
      titleHi: "एसबीआई क्लर्क प्रीलिम्स स्पीड टेस्ट 08",
      category: "banking",
      examId: "sbi-clerk",
      stage: "Prelims",
      accuracyScore: 84,
      ringColor: "#10B981",
      sectionsEn: "3 Sections • 100 Questions",
      sectionsHi: "3 खंड • 100 प्रश्न",
      attemptsEn: "18.9k Attempted",
      attemptsHi: "18.9k अभ्यर्थियों ने दिया",
      dateMetaEn: "60 Mins • High Scoring",
      dateMetaHi: "60 मिनट • उच्च स्कोरिंग",
      tagEn: "High Yield",
      tagHi: "महत्वपूर्ण"
    },
    {
      id: "mock-ssc-cgl-04",
      titleEn: "SSC CGL Tier-I Master Mock 04",
      titleHi: "एसएससी सीजीएल टियर-I मास्टर मॉक 04",
      category: "ssc",
      examId: "ssc-cgl",
      stage: "Tier-I",
      accuracyScore: 68,
      ringColor: "#F59E0B",
      sectionsEn: "4 Sections • 100 Questions",
      sectionsHi: "4 खंड • 100 प्रश्न",
      attemptsEn: "22.5k Attempted",
      attemptsHi: "22.5k अभ्यर्थियों ने दिया",
      dateMetaEn: "60 Mins • PYQ Pattern",
      dateMetaHi: "60 मिनट • पिछले वर्ष आधारित",
      tagEn: "Master Level",
      tagHi: "मास्टर लेवल"
    },
    {
      id: "mock-ssc-chsl-06",
      titleEn: "SSC CHSL Tier-I Speed Drill 06",
      titleHi: "एसएससी सीएचएसएल टियर-I स्पीड ड्रिल 06",
      category: "ssc",
      examId: "ssc-chsl",
      stage: "Tier-I",
      accuracyScore: 72,
      ringColor: "#6366F1",
      sectionsEn: "4 Sections • 100 Questions",
      sectionsHi: "4 खंड • 100 प्रश्न",
      attemptsEn: "11.4k Attempted",
      attemptsHi: "11.4k अभ्यर्थियों ने दिया",
      dateMetaEn: "60 Mins • Moderate Level",
      dateMetaHi: "60 मिनट • मध्यम स्तर",
      tagEn: "Speed Drill",
      tagHi: "स्पीड टेस्ट"
    },
    {
      id: "mock-rrb-ntpc-03",
      titleEn: "RRB NTPC CBT-1 Full CBT Mock",
      titleHi: "आरआरबी एनटीपीसी सीबीटी-1 संपूर्ण मॉक",
      category: "railways",
      examId: "rrb-ntpc-graduate",
      stage: "CBT-1",
      accuracyScore: 81,
      ringColor: "#0E3F6B",
      sectionsEn: "3 Sections • 100 Questions",
      sectionsHi: "3 खंड • 100 प्रश्न",
      attemptsEn: "16.1k Attempted",
      attemptsHi: "16.1k अभ्यर्थियों ने दिया",
      dateMetaEn: "90 Mins • Science Focus",
      dateMetaHi: "90 मिनट • विज्ञान विशेष",
      tagEn: "Railways",
      tagHi: "रेलवे"
    },
    {
      id: "mock-ibps-clerk-02",
      titleEn: "IBPS Clerk Prelims Standard Mock",
      titleHi: "आईबीपीएस क्लर्क प्रीलिम्स मानक मॉक",
      category: "banking",
      examId: "ibps-clerk",
      stage: "Prelims",
      accuracyScore: 76,
      ringColor: "#0284C7",
      sectionsEn: "3 Sections • 100 Questions",
      sectionsHi: "3 खंड • 100 प्रश्न",
      attemptsEn: "13.7k Attempted",
      attemptsHi: "13.7k अभ्यर्थियों ने दिया",
      dateMetaEn: "60 Mins • Active Pool",
      dateMetaHi: "60 मिनट • सक्रिय पूल",
      tagEn: "Clerk Prelims",
      tagHi: "क्लर्क प्रीलिम्स"
    }
  ],

  // --------------------------------------------------------------------------
  // Pending Exams (Right column list with Skip / Continue)
  // --------------------------------------------------------------------------
  pendingExams: [
    {
      id: "pending-1",
      titleEn: "IBPS Clerk Prelims - Mock 03",
      titleHi: "आईबीपीएस क्लर्क प्रीलिम्स - मॉक 03",
      examId: "ibps-clerk",
      stage: "Prelims",
      progressPct: 65,
      questionsTextEn: "35 / 100 Questions Left",
      questionsTextHi: "35 / 100 प्रश्न शेष",
      timeLeftEn: "24m 10s remaining",
      timeLeftHi: "24 मिनट 10 सेकंड शेष",
      category: "banking"
    },
    {
      id: "pending-2",
      titleEn: "SSC CGL Tier-I: Quant Sectional",
      titleHi: "एसएससी सीजीएल टियर-I: गणित सेक्शनल",
      examId: "ssc-cgl",
      stage: "Tier-I",
      progressPct: 40,
      questionsTextEn: "15 / 25 Questions Left",
      questionsTextHi: "15 / 25 प्रश्न शेष",
      timeLeftEn: "11m 45s remaining",
      timeLeftHi: "11 मिनट 45 सेकंड शेष",
      category: "ssc"
    },
    {
      id: "pending-3",
      titleEn: "SBI PO Prelims - Speed Drill 02",
      titleHi: "एसबीआई पीओ प्रीलिम्स - स्पीड ड्रिल 02",
      examId: "sbi-po",
      stage: "Prelims",
      progressPct: 80,
      questionsTextEn: "20 / 100 Questions Left",
      questionsTextHi: "20 / 100 प्रश्न शेष",
      timeLeftEn: "14m 20s remaining",
      timeLeftHi: "14 मिनट 20 सेकंड शेष",
      category: "banking"
    }
  ],

  // --------------------------------------------------------------------------
  // Statistics Bar Chart Benchmark Data (Reasoning, Quant, English)
  // Two bars per section group: Dark Blue (#0E3F6B) + Light Blue (#1B6CA8)
  // --------------------------------------------------------------------------
  sectionStats: [
    {
      id: "reasoning",
      nameEn: "Reasoning",
      nameHi: "तर्कशक्ति (Reasoning)",
      userScore: 78,
      avgScore: 68,
      userLabelEn: "Your Accuracy: 78%",
      userLabelHi: "आपकी सटीकता: 78%",
      avgLabelEn: "All-India Avg: 68%",
      avgLabelHi: "अखिल भारतीय औसत: 68%",
      totalQuestions: 35,
      timePerQ: "48s"
    },
    {
      id: "quant",
      nameEn: "Quant",
      nameHi: "गणित (Quant)",
      userScore: 64,
      avgScore: 58,
      userLabelEn: "Your Accuracy: 64%",
      userLabelHi: "आपकी सटीकता: 64%",
      avgLabelEn: "All-India Avg: 58%",
      avgLabelHi: "अखिल भारतीय औसत: 58%",
      totalQuestions: 35,
      timePerQ: "62s"
    },
    {
      id: "english",
      nameEn: "English",
      nameHi: "अंग्रेजी (English)",
      userScore: 82,
      avgScore: 62,
      userLabelEn: "Your Accuracy: 82%",
      userLabelHi: "आपकी सटीकता: 82%",
      avgLabelEn: "All-India Avg: 62%",
      avgLabelHi: "अखिल भारतीय औसत: 62%",
      totalQuestions: 30,
      timePerQ: "35s"
    }
  ],

  // --------------------------------------------------------------------------
  // Leaderboard / All India Ranking Data
  // --------------------------------------------------------------------------
  ranking: [
    { rank: 1, name: "Aman Verma", state: "Uttar Pradesh", score: "94.50 / 100", percentile: "99.98%" },
    { rank: 2, name: "Neha Deshmukh", state: "Maharashtra", score: "92.00 / 100", percentile: "99.85%" },
    { rank: 3, name: "Rohit Sundaram", state: "Tamil Nadu", score: "91.25 / 100", percentile: "99.70%" },
    { rank: 4, name: "Pooja Choudhary", state: "Rajasthan", score: "89.75 / 100", percentile: "99.42%" },
    { rank: 142, name: "Aditya Sharma (You)", state: "Delhi NCR", score: "78.50 / 100", percentile: "96.40%", isCurrent: true }
  ],

  // --------------------------------------------------------------------------
  // Notifications Data
  // --------------------------------------------------------------------------
  notifications: [
    {
      id: "notif-1",
      titleEn: "New All-India Live Mock 12",
      titleHi: "नया अखिल भारतीय लाइव मॉक 12",
      textEn: "IBPS PO 2026 Prelims Mock 12 is now live for all enrolled students.",
      textHi: "आईबीपीएस पीओ 2026 प्रीलिम्स मॉक 12 अब सभी छात्रों के लिए लाइव है।",
      timeEn: "10 mins ago",
      timeHi: "10 मिनट पहले",
      unread: true
    },
    {
      id: "notif-2",
      titleEn: "Accuracy Milestone",
      titleHi: "सटीकता उपलब्धि",
      textEn: "Your English Language accuracy reached 82% (+6% improvement).",
      textHi: "आपकी अंग्रेजी भाषा सटीकता 82% (+6% सुधार) पर पहुंच गई है।",
      timeEn: "2 hours ago",
      timeHi: "2 घंटे पहले",
      unread: true
    },
    {
      id: "notif-3",
      titleEn: "Daily Quant Speed Drill",
      titleHi: "दैनिक गणित स्पीड ड्रिल",
      textEn: "15 simplification & approximation questions added to the practice bank.",
      textHi: "अभ्यास बैंक में 15 सरलीकरण और सन्निकटन प्रश्न जोड़े गए हैं।",
      timeEn: "Yesterday",
      timeHi: "कल",
      unread: false
    }
  ],

  // --------------------------------------------------------------------------
  // Multi-Language Strings (English / हिन्दी)
  // --------------------------------------------------------------------------
  i18n: {
    en: {
      brandName: "ExamMock-AI",
      brandTagline: "CBT Mock Engine",
      navHome: "Home Page",
      navDashboard: "Dashboard",
      navTraining: "Training / Practice",
      navPreviewExams: "Preview Exams",
      navMyRanking: "My Ranking",
      navStatistics: "Statistics",
      navSettingsHeader: "Settings",
      navProfile: "Profile",
      navSettings: "Settings",
      navLogout: "Logout",
      pageTitle: "Dashboard",
      searchPlaceholder: "Search for exam...",
      searchClear: "Clear",
      popularTitle: "Popular Mock Tests",
      popularSub: "Based on official blueprints & trending student enrollments",
      viewAll: "View All",
      enrollNow: "Enroll Now",
      startTest: "Start Test",
      pendingTitle: "Pending Exams",
      pendingSub: "Resume your unsubmitted mocks",
      skipBtn: "Skip",
      continueBtn: "Continue",
      statsTitle: "Statistics",
      statsSub: "Sectional accuracy vs All-India average",
      legendUser: "Your Score",
      legendAvg: "All-India Avg",
      emptySearch: "No exams matched your search",
      emptySearchTip: "Try searching 'IBPS', 'SBI', 'SSC', or 'CGL'",
      notificationTitle: "Notifications",
      markAllRead: "Mark all as read",
      rankingTitle: "All India Leaderboard",
      rankingSub: "Live percentile and rank based on recent mock scores",
      rankCol: "Rank",
      candidateCol: "Candidate",
      stateCol: "State",
      scoreCol: "Score",
      percentileCol: "Percentile",
      profileTitle: "Candidate Profile",
      profileRole: "Aspirant",
      profileSave: "Save Changes",
      profileClose: "Close",
      modalStartMockTitle: "Configure & Start Test",
      testTypeFull: "Full-Length Mock",
      testTypeSectional: "Sectional Speed Drill",
      selectLang: "Exam Interface Language",
      questionSourceLabel: "Question Source / Generator Mode",
      sourceBank: "⚡ Instant Ready Pool (Fastest - 1s)",
      sourceAi: "✨ 100% Fresh Paper by Gemini AI (~15-25s)",
      launchButton: "Launch Mock Test Now",
      cancel: "Cancel",
      darkModeTooltip: "Toggle Dark / Light Mode",
      langTooltip: "Switch Language / भाषा बदलें",
      themeDark: "Dark Mode",
      themeLight: "Light Mode",
      close: "Close"
    },
    hi: {
      brandName: "ExamMock-AI",
      brandTagline: "सीबीटी मॉक इंजन",
      navHome: "मुख्य पृष्ठ",
      navDashboard: "डैशबोर्ड",
      navTraining: "अभ्यास एवं क्विज़",
      navPreviewExams: "मॉक टेस्ट सूची",
      navMyRanking: "मेरी रैंकिंग (AIR)",
      navStatistics: "प्रदर्शन विश्लेषण",
      navSettingsHeader: "सेटिंग्स",
      navProfile: "प्रोफ़ाइल",
      navSettings: "सेटिंग्स",
      navLogout: "लॉगआउट",
      pageTitle: "डैशबोर्ड",
      searchPlaceholder: "परीक्षा या विषय खोजें...",
      searchClear: "हटाएं",
      popularTitle: "लोकप्रिय मॉक टेस्ट",
      popularSub: "आधिकारिक परीक्षा पैटर्न और सर्वाधिक हल किए गए टेस्ट",
      viewAll: "सभी देखें",
      enrollNow: "नामांकन करें",
      startTest: "टेस्ट शुरू करें",
      pendingTitle: "अधूरे टेस्ट",
      pendingSub: "अपने शेष टेस्ट को यहीं से जारी रखें",
      skipBtn: "छोड़ें",
      continueBtn: "जारी रखें",
      statsTitle: "प्रदर्शन आंकड़े",
      statsSub: "खंडवार सटीकता बनाम अखिल भारतीय औसत",
      legendUser: "आपका स्कोर",
      legendAvg: "अखिल भारतीय औसत",
      emptySearch: "आपकी खोज से कोई परीक्षा नहीं मिली",
      emptySearchTip: "'IBPS', 'SBI', 'SSC', या 'CGL' लिखकर खोजें",
      notificationTitle: "सूचनाएं एवं अपडेट",
      markAllRead: "सभी पढ़ी गईं मार्क करें",
      rankingTitle: "अखिल भारतीय लीडरबोर्ड",
      rankingSub: "हालिया मॉक टेस्ट के आधार पर वास्तविक रैंक व पर्सेंटाइल",
      rankCol: "रैंक",
      candidateCol: "अभ्यर्थी",
      stateCol: "राज्य",
      scoreCol: "स्कोर",
      percentileCol: "पर्सेंटाइल",
      profileTitle: "अभ्यर्थी प्रोफ़ाइल",
      profileRole: "प्रतियोगी छात्र",
      profileSave: "परिवर्तन सहेजें",
      profileClose: "बंद करें",
      modalStartMockTitle: "मॉक टेस्ट विन्यास व प्रारंभ",
      testTypeFull: "संपूर्ण मॉक टेस्ट (Full Mock)",
      testTypeSectional: "सेक्शनल स्पीड ड्रिल (Sectional)",
      selectLang: "परीक्षा भाषा (Language)",
      questionSourceLabel: "प्रश्न स्रोत / जनरेटर मोड",
      sourceBank: "⚡ तैयार पूल (तुरंत प्रारंभ - 1s)",
      sourceAi: "✨ 100% फ्रेश जेमिनी एआई द्वारा (~15-25s)",
      launchButton: "मॉक टेस्ट अभी शुरू करें",
      cancel: "रद्द करें",
      darkModeTooltip: "डार्क / लाइट मोड बदलें",
      langTooltip: "भाषा बदलें (Switch Language)",
      themeDark: "डार्क मोड",
      themeLight: "लाइट मोड",
      close: "बंद करें"
    }
  }
};

// Make accessible to window
if (typeof window !== "undefined") {
  window.EXAMMOCK_DATA = EXAMMOCK_DATA;
}
