/* ============================================================
   REBUILT — data.js
   Constants, XP/Level curve, achievement definitions, and the
   two starting states: a real clean state for new users, and an
   optional demo state a user can load from Settings to explore.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Data = (function () {

  const STORAGE_KEY = "rebuilt_state_v1";

  /* Habit icons are keys into REBUILT.Icons (see icons.js → HABIT_ICONS); older saves may still hold
     emoji, which Icons.resolve() maps to the closest key at render time. */

  const WEEKDAY_LABELS = ["أحد", "اتنين", "تلات", "أربع", "خميس", "جمعة", "سبت"];

  const PRIORITIES = ["low", "medium", "high", "urgent"];

  const OCCUPATIONS = [
    { id: "student", label: "طالب" },
    { id: "employee", label: "موظف" },
    { id: "freelancer", label: "فريلانسر" },
    { id: "trainer", label: "مدرّب" },
    { id: "teacher", label: "مدرّس" },
    { id: "entrepreneur", label: "صاحب مشروع" },
    { id: "other", label: "حاجة تانية" },
  ];

  const PRESET_SKILLS = ["برمجة", "تصميم", "تسويق", "تواصل", "لغة إنجليزية", "مونتاج فيديو", "كتابة", "تحليل بيانات"];
  const PRESET_HOBBIES = ["قراءة", "جيم", "جيمنج", "كورة", "موسيقى", "تصميم", "سفر", "رسم"];
  const PRESET_GOALS = ["تنظيم يومي", "تطوير مهارة جديدة", "الالتزام بالرياضة", "قراءة أكتر", "بناء مشروع", "تحسين التركيز"];

  /**
   * Every new row's id is a real UUID — required so it can be written
   * straight into Supabase's `uuid` columns with no server round-trip
   * (the row is created offline-safe and the same id threads from parent
   * to child, e.g. a habit and the completion that follows it instantly).
   * `prefix` is accepted for call-site readability but no longer used.
   */
  function generateId(prefix) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    // Fallback for a browser without crypto.randomUUID (rare, pre-2022 engines).
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * habit.frequency is a plain string: 'daily' | 'weekly' | 'custom'.
   * 'daily'  → active every day.
   * 'weekly' → can be logged any day; tracked as a per-week quota.
   * 'custom' → active only on habit.targetDays (0=Sunday..6=Saturday).
   */
  function isHabitActiveOn(habit, dateObj) {
    if (!habit.frequency || habit.frequency === "daily" || habit.frequency === "weekly") return true;
    const day = dateObj.getDay();
    return Array.isArray(habit.targetDays) && habit.targetDays.includes(day);
  }

  /* ---------- XP required to go from level L to L+1 ---------- */
  // Grows steadily so later levels feel earned, without punishing early progress.
  function xpForLevel(level) {
    return 400 + (level - 1) * 180;
  }

  /* ---------- Achievement catalogue ----------
     `test(ctx)` receives a computed context object (see achievements.js)
     and returns true once the requirement is met. Every unlock is permanent
     and its xpBonus is only ever granted once. */
  const ACHIEVEMENTS = [
    {
      id: "first_step",
      icon: "flag",
      name: "أول خطوة",
      description: "خلصت أول عادة ليك في REBUILT.",
      xpBonus: 15,
      test: (ctx) => ctx.totalHabitCompletions >= 1,
    },
    {
      id: "task_crusher",
      icon: "tasks",
      name: "مفرمة المهام",
      description: "خلصت 10 مهام من قائمتك.",
      xpBonus: 40,
      test: (ctx) => ctx.totalTasksCompleted >= 10,
    },
    {
      id: "streak_7",
      icon: "flame",
      name: "أسبوع بلا توقف",
      description: "كملت 7 أيام ورا بعض من غير ما تقطع.",
      xpBonus: 50,
      test: (ctx) => ctx.longestStreak >= 7,
    },
    {
      id: "streak_30",
      icon: "trophy",
      name: "شهر كامل",
      description: "30 يوم ورا بعض. ده مش هزار.",
      xpBonus: 200,
      test: (ctx) => ctx.longestStreak >= 30,
    },
    {
      id: "early_bird",
      icon: "sun",
      name: "الطيور المبكرة",
      description: "خلصت عادة قبل الساعة 8 الصبح.",
      xpBonus: 30,
      test: (ctx) => ctx.hasEarlyCompletion,
    },
    {
      id: "perfect_day",
      icon: "star",
      name: "يوم مثالي",
      description: "خلصت كل العادات والمهام المجدولة في يوم واحد.",
      xpBonus: 40,
      test: (ctx) => ctx.hasPerfectDay,
    },
    {
      id: "consistency_50",
      icon: "repeat",
      name: "الاستمرارية",
      description: "50 عادة متكملة على مدار رحلتك.",
      xpBonus: 60,
      test: (ctx) => ctx.totalHabitCompletions >= 50,
    },
    {
      id: "book_worm",
      icon: "book",
      name: "دودة الكتب",
      description: "كررت نفس العادة 15 مرة. ثبات حقيقي.",
      xpBonus: 40,
      test: (ctx) => ctx.maxSingleHabitCompletions >= 15,
    },
    {
      id: "level_10",
      icon: "sparkles",
      name: "لسه في الأول",
      description: "وصلت للـ Level 10.",
      xpBonus: 80,
      test: (ctx) => ctx.level >= 10,
    },
    {
      id: "xp_1000",
      icon: "bolt",
      name: "أول 1000",
      description: "جمعت أول <bdi>1000 XP</bdi> في رحلتك.",
      xpBonus: 30,
      test: (ctx) => ctx.totalXP >= 1000,
    },
  ];

  /**
   * Format a Date object as YYYY-MM-DD using its LOCAL calendar date —
   * never `.toISOString().slice(0, 10)`, which converts to UTC first and
   * silently shifts the date by a day for any positive UTC offset (e.g.
   * Egypt, UTC+3: local midnight is already the previous day in UTC, so
   * every "today" computed that way lands one day early).
   */
  function formatLocalDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function todayISO(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + (offsetDays || 0));
    return formatLocalDate(d);
  }

  function freshSettings() {
    return { notifications: true, theme: "dark", reduceMotion: false };
  }

  function freshUserProfile() {
    return {
      occupation: "",
      occupationCustom: "",
      lifeDescription: "",
      skills: [],
      hobbies: [],
      goals: [],
      challenges: "",
    };
  }

  /** Seeded lightly from onboarding; the rest is meant to be learned gradually later, not assumed now. */
  function freshAiProfile() {
    return {
      userType: null,
      communicationStyle: null,
      motivationStyle: null,
      preferredResponseLength: "medium",
      productivityStyle: null,
      disciplineLevel: null,
      planningPreference: null,
      commonPatterns: [],
      knownChallenges: [],
    };
  }

  /** The real starting point for every new user: no habits, no tasks, no history. */
  function buildEmptyState() {
    return {
      version: 3,
      meta: { isDemo: false, isOnboarded: false, hasLocalAccount: false },
      user: {
        id: generateId("user"),
        name: "",
        email: "",
        avatar: "",
        createdAt: todayISO(0),
      },
      userProfile: freshUserProfile(),
      aiProfile: freshAiProfile(),
      xp: { total: 0 },
      streak: { current: 0, longest: 0 },
      habits: [],
      tasks: [],
      goals: [],
      scheduleItems: [],
      aiConversation: [],
      achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, unlocked: false, unlockedAt: null })),
      history: {},
      settings: freshSettings(),
      lastMessageIndex: {},
    };
  }

  /** Optional demo content — only ever loaded when the user explicitly asks for it in Settings. */
  function buildDemoState() {
    const habitDefs = [
      { id: "h1", title: "شرب المياه", icon: "droplet", xp: 20 },
      { id: "h2", title: "القراءة 20 دقيقة", icon: "book", xp: 30, time: "20:00" },
      { id: "h3", title: "التمرين", icon: "dumbbell", xp: 40, time: "19:00" },
      { id: "h4", title: "النوم بدري", icon: "moon", xp: 25 },
      { id: "h5", title: "تأمل 5 دقايق", icon: "leaf", xp: 20 },
      { id: "h6", title: "أكل صحي", icon: "apple", xp: 20 },
      { id: "h7", title: "كتابة يوميات", icon: "pen", xp: 15 },
    ];

    const habits = habitDefs.map((h) => ({
      id: h.id,
      title: h.title,
      description: "",
      icon: h.icon,
      xp: h.xp,
      frequency: "daily",
      targetDays: [],
      time: h.time || null,
      createdAt: todayISO(-20),
      completionHistory: [],
      currentStreak: 0,
      longestStreak: 0,
    }));

    const history = {};
    let totalXP = 0;
    let runningStreak = 0;
    let longestStreak = 0;

    for (let offset = -13; offset <= -1; offset++) {
      const date = todayISO(offset);
      const completionChance = [0.9, 0.85, 0.95, 0.4, 1, 0.9, 0.8, 1, 1, 0.9, 1, 1, 0.95][offset + 13];
      let habitsCompleted = 0;
      habits.forEach((habit, idx) => {
        const roll = ((offset * 7 + idx * 13) % 10) / 10; // deterministic pseudo-random
        if (Math.abs(roll) < completionChance) {
          habit.completionHistory.push(date);
          habitsCompleted++;
          totalXP += habit.xp;
        }
      });
      const tasksCompleted = habitsCompleted > 4 ? 2 : 1;
      const xpEarned = habitsCompleted * 25 + tasksCompleted * 25;
      totalXP += tasksCompleted * 25;
      const allDone = habitsCompleted === habits.length;
      history[date] = {
        habitsCompleted,
        totalHabits: habits.length,
        tasksCompleted,
        xpEarned,
        allHabitsCompleted: allDone,
      };
      if (allDone) {
        runningStreak++;
        longestStreak = Math.max(longestStreak, runningStreak);
      } else {
        runningStreak = 0;
      }
    }

    const today = todayISO(0);
    habits[0].completionHistory.push(today);
    habits[1].completionHistory.push(today);
    history[today] = {
      habitsCompleted: 2,
      totalHabits: habits.length,
      tasksCompleted: 1,
      xpEarned: 2 * 25 + 25,
      allHabitsCompleted: false,
    };
    totalXP += 2 * 25 + 25;

    habits.forEach((habit) => {
      let cur = 0;
      let max = 0;
      for (let offset = -20; offset <= 0; offset++) {
        const date = todayISO(offset);
        if (habit.completionHistory.includes(date)) {
          cur++;
          max = Math.max(max, cur);
        } else if (date !== today) {
          cur = 0;
        }
      }
      habit.currentStreak = cur;
      habit.longestStreak = max;
    });

    const tasks = [
      { id: "t1", title: "تجهيز عرض الشغل", description: "", priority: "high", date: today, time: "11:00", xp: 25, completed: true, completedAt: today, createdAt: todayISO(-2) },
      { id: "t2", title: "مكالمة مع العميل", description: "", priority: "medium", date: today, time: "14:00", xp: 25, completed: true, completedAt: today, createdAt: todayISO(-1) },
      { id: "t3", title: "مراجعة الميزانية الشهرية", description: "بند الاشتراكات والمصاريف المتغيرة", priority: "medium", date: todayISO(1), time: null, xp: 25, completed: false, completedAt: null, createdAt: today },
      { id: "t4", title: "حجز موعد الدكتور", description: "", priority: "low", date: todayISO(2), time: null, xp: 25, completed: false, completedAt: null, createdAt: today },
      { id: "t5", title: "الرد على الإيميلات المتأخرة", description: "", priority: "urgent", date: today, time: "17:00", xp: 25, completed: false, completedAt: null, createdAt: today },
    ];

    totalXP += 25 + 25;
    totalXP = 6450; // land mid-level-7 to match the product's original example feel

    const scheduleItems = [
      { id: "s1", title: "محاضرة", type: "event", date: today, startTime: "08:00", endTime: "09:30", notes: "", completed: true },
      { id: "s2", title: "غداء وراحة", type: "break", date: today, startTime: "13:00", endTime: "14:00", notes: "", completed: false },
    ];

    return {
      version: 3,
      meta: { isDemo: true, isOnboarded: true, hasLocalAccount: true },
      user: {
        id: generateId("user"),
        name: "عمر",
        email: "demo@rebuilt.app",
        avatar: "",
        createdAt: todayISO(-20),
      },
      userProfile: {
        occupation: "employee",
        occupationCustom: "",
        lifeDescription: "شغال في شركة تسويق وبحاول أنظم وقتي بين الشغل والرياضة والقراءة.",
        skills: ["تسويق", "تصميم"],
        hobbies: ["قراءة", "جيم"],
        goals: ["تنظيم يومي", "قراءة أكتر"],
        challenges: "بابدأ حاجات كتير وما بكملهاش.",
      },
      aiProfile: freshAiProfile(),
      xp: { total: totalXP },
      streak: { current: 0, longest: Math.max(longestStreak, 12) },
      habits,
      tasks,
      goals: [
        {
          id: generateId("goal"), title: "قراءة 12 كتاب السنة دي", why: "عايز أرجع أقرأ بانتظام.", targetDate: todayISO(120), status: "active",
          steps: [
            { id: generateId("step"), title: "اختار أول 3 كتب", done: true },
            { id: generateId("step"), title: "خلّص الكتاب الأول", done: true },
            { id: generateId("step"), title: "خلّص الكتاب التاني", done: false },
            { id: generateId("step"), title: "خلّص الكتاب التالت", done: false },
          ],
          createdAt: todayISO(-14), completedAt: null,
        },
        {
          id: generateId("goal"), title: "تنظيم ميزانية الشهر", why: "", targetDate: todayISO(9), status: "active",
          steps: [], createdAt: todayISO(-3), completedAt: null,
        },
      ],
      scheduleItems,
      aiConversation: [],
      achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, unlocked: false, unlockedAt: null })),
      history,
      settings: freshSettings(),
      lastMessageIndex: {},
    };
  }

  return {
    STORAGE_KEY,
    WEEKDAY_LABELS,
    PRIORITIES,
    OCCUPATIONS,
    PRESET_SKILLS,
    PRESET_HOBBIES,
    PRESET_GOALS,
    ACHIEVEMENTS,
    generateId,
    xpForLevel,
    isHabitActiveOn,
    buildEmptyState,
    buildDemoState,
    todayISO,
    formatLocalDate,
  };
})();
