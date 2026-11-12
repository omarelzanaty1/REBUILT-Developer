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

  /* Everything below that people read is translated when it is asked for (never frozen at load), so a language
     switch shows up on the next render. Only ids/keys are ever stored. */
  const dt = (key) => REBUILT.t("data." + key);
  const weekdayLabels = () => REBUILT.I18n.weekdays();

  const PRIORITIES = ["low", "medium", "high", "urgent"];

  const OCCUPATION_IDS = ["student", "employee", "freelancer", "trainer", "teacher", "entrepreneur", "other"];
  const occupations = () => OCCUPATION_IDS.map((id) => ({ id, label: dt("occupation." + id) }));

  const SKILL_KEYS = ["programming", "design", "marketing", "communication", "english", "video", "writing", "data"];
  const HOBBY_KEYS = ["reading", "gym", "gaming", "football", "music", "design", "travel", "drawing"];
  const GOAL_KEYS = ["organize", "new_skill", "exercise", "read_more", "build_project", "focus"];
  const presetSkills = () => SKILL_KEYS.map((k) => dt("skill." + k));
  const presetHobbies = () => HOBBY_KEYS.map((k) => dt("hobby." + k));
  const presetGoals = () => GOAL_KEYS.map((k) => dt("goal." + k));

  /** A preset the person picked in one language, shown in another (so the chip stays selected after a language switch).
      Anything that is not a preset — what they typed — is returned untouched. */
  const PRESET_GROUPS = { skills: ["skill", SKILL_KEYS], hobbies: ["hobby", HOBBY_KEYS], goals: ["goal", GOAL_KEYS] };
  function convertPreset(group, value, from, to) {
    const g = PRESET_GROUPS[group];
    if (!g) return value;
    const key = g[1].find((k) => REBUILT.I18n.raw(from, "data." + g[0] + "." + k) === value);
    return key ? REBUILT.I18n.raw(to, "data." + g[0] + "." + key) : value;
  }

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
      get name() { return dt("ach.first_step.name"); },
      get description() { return dt("ach.first_step.desc"); },
      xpBonus: 15,
      test: (ctx) => ctx.totalHabitCompletions >= 1,
    },
    {
      id: "task_crusher",
      icon: "tasks",
      get name() { return dt("ach.task_crusher.name"); },
      get description() { return dt("ach.task_crusher.desc"); },
      xpBonus: 40,
      test: (ctx) => ctx.totalTasksCompleted >= 10,
    },
    {
      id: "streak_7",
      icon: "flame",
      get name() { return dt("ach.streak_7.name"); },
      get description() { return dt("ach.streak_7.desc"); },
      xpBonus: 50,
      test: (ctx) => ctx.longestStreak >= 7,
    },
    {
      id: "streak_30",
      icon: "trophy",
      get name() { return dt("ach.streak_30.name"); },
      get description() { return dt("ach.streak_30.desc"); },
      xpBonus: 200,
      test: (ctx) => ctx.longestStreak >= 30,
    },
    {
      id: "early_bird",
      icon: "sun",
      get name() { return dt("ach.early_bird.name"); },
      get description() { return dt("ach.early_bird.desc"); },
      xpBonus: 30,
      test: (ctx) => ctx.hasEarlyCompletion,
    },
    {
      id: "perfect_day",
      icon: "star",
      get name() { return dt("ach.perfect_day.name"); },
      get description() { return dt("ach.perfect_day.desc"); },
      xpBonus: 40,
      test: (ctx) => ctx.hasPerfectDay,
    },
    {
      id: "consistency_50",
      icon: "repeat",
      get name() { return dt("ach.consistency_50.name"); },
      get description() { return dt("ach.consistency_50.desc"); },
      xpBonus: 60,
      test: (ctx) => ctx.totalHabitCompletions >= 50,
    },
    {
      id: "book_worm",
      icon: "book",
      get name() { return dt("ach.book_worm.name"); },
      get description() { return dt("ach.book_worm.desc"); },
      xpBonus: 40,
      test: (ctx) => ctx.maxSingleHabitCompletions >= 15,
    },
    {
      id: "level_10",
      icon: "sparkles",
      get name() { return dt("ach.level_10.name"); },
      get description() { return dt("ach.level_10.desc"); },
      xpBonus: 80,
      test: (ctx) => ctx.level >= 10,
    },
    {
      id: "xp_1000",
      icon: "bolt",
      get name() { return dt("ach.xp_1000.name"); },
      get description() { return dt("ach.xp_1000.desc"); },
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

  /**
   * The MOMENT something is created, as a local wall-clock timestamp with no zone: "2026-11-03T21:38:12.345".
   * It is what habits and tasks are written to the server's created_at with (see supabaseData.js → createdAtFor).
   *  - It is in the same «frame» as the day-only value the app wrote before ("2026-11-03T00:00:00" = local day, read back as if UTC),
   *    so the first 10 characters are always the local day = todayISO(): the day the app reads back never moves, and old rows still sort correctly.
   *  - Every call is later than the one before, even in the same millisecond (several rows made in a loop keep their order). A clock that
   *    went back a little (summer-time change, at most 2 hours) does not repeat a stamp either; a clock set back further is believed.
   */
  let lastStampMs = -Infinity;
  function stampNow() {
    const d = new Date();
    let ms = d.getTime() - d.getTimezoneOffset() * 60000; // the wall-clock reading, as if it were UTC
    if (ms <= lastStampMs && lastStampMs - ms < 2 * 3600000) ms = lastStampMs + 1;
    lastStampMs = ms;
    return new Date(ms).toISOString().slice(0, 23);
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
      { id: "h1", title: dt("demo.habit.h1"), icon: "droplet", xp: 20 },
      { id: "h2", title: dt("demo.habit.h2"), icon: "book", xp: 30, time: "20:00" },
      { id: "h3", title: dt("demo.habit.h3"), icon: "dumbbell", xp: 40, time: "19:00" },
      { id: "h4", title: dt("demo.habit.h4"), icon: "moon", xp: 25 },
      { id: "h5", title: dt("demo.habit.h5"), icon: "leaf", xp: 20 },
      { id: "h6", title: dt("demo.habit.h6"), icon: "apple", xp: 20 },
      { id: "h7", title: dt("demo.habit.h7"), icon: "pen", xp: 15 },
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
      { id: "t1", title: dt("demo.task.t1"), description: "", priority: "high", date: today, time: "11:00", xp: 25, completed: true, completedAt: today, createdAt: todayISO(-2) },
      { id: "t2", title: dt("demo.task.t2"), description: "", priority: "medium", date: today, time: "14:00", xp: 25, completed: true, completedAt: today, createdAt: todayISO(-1) },
      { id: "t3", title: dt("demo.task.t3"), description: dt("demo.task.t3_desc"), priority: "medium", date: todayISO(1), time: null, xp: 25, completed: false, completedAt: null, createdAt: today },
      { id: "t4", title: dt("demo.task.t4"), description: "", priority: "low", date: todayISO(2), time: null, xp: 25, completed: false, completedAt: null, createdAt: today },
      { id: "t5", title: dt("demo.task.t5"), description: "", priority: "urgent", date: today, time: "17:00", xp: 25, completed: false, completedAt: null, createdAt: today },
    ];

    totalXP += 25 + 25;
    totalXP = 6450; // land mid-level-7 to match the product's original example feel

    const scheduleItems = [
      { id: "s1", title: dt("demo.schedule.s1"), type: "event", date: today, startTime: "08:00", endTime: "09:30", notes: "", completed: true },
      { id: "s2", title: dt("demo.schedule.s2"), type: "break", date: today, startTime: "13:00", endTime: "14:00", notes: "", completed: false },
    ];

    return {
      version: 3,
      meta: { isDemo: true, isOnboarded: true, hasLocalAccount: true },
      user: {
        id: generateId("user"),
        name: dt("demo.user.name"),
        email: "demo@rebuilt.app",
        avatar: "",
        createdAt: todayISO(-20),
      },
      userProfile: {
        occupation: "employee",
        occupationCustom: "",
        lifeDescription: dt("demo.user.life"),
        skills: [dt("skill.marketing"), dt("skill.design")],
        hobbies: [dt("hobby.reading"), dt("hobby.gym")],
        goals: [dt("goal.organize"), dt("goal.read_more")],
        challenges: dt("demo.user.challenges"),
      },
      aiProfile: freshAiProfile(),
      xp: { total: totalXP },
      streak: { current: 0, longest: Math.max(longestStreak, 12) },
      habits,
      tasks,
      goals: [
        {
          id: generateId("goal"), title: dt("demo.goal.books"), why: dt("demo.goal.books_why"), targetDate: todayISO(120), status: "active",
          steps: [
            { id: generateId("step"), title: dt("demo.goal.books_s1"), done: true },
            { id: generateId("step"), title: dt("demo.goal.books_s2"), done: true },
            { id: generateId("step"), title: dt("demo.goal.books_s3"), done: false },
            { id: generateId("step"), title: dt("demo.goal.books_s4"), done: false },
          ],
          createdAt: todayISO(-14), completedAt: null,
        },
        {
          id: generateId("goal"), title: dt("demo.goal.budget"), why: "", targetDate: todayISO(9), status: "active",
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
    get WEEKDAY_LABELS() { return weekdayLabels(); },
    PRIORITIES,
    get OCCUPATIONS() { return occupations(); },
    get PRESET_SKILLS() { return presetSkills(); },
    get PRESET_HOBBIES() { return presetHobbies(); },
    get PRESET_GOALS() { return presetGoals(); },
    ACHIEVEMENTS,
    generateId,
    xpForLevel,
    convertPreset,
    isHabitActiveOn,
    buildEmptyState,
    buildDemoState,
    todayISO,
    stampNow,
    formatLocalDate,
  };
})();
