/* ============================================================
   REBUILT — helpers.js
   Centralized calculations shared by every page, so "what counts
   as today", "what's the day's progress", etc. is computed in
   exactly one place instead of re-derived per screen.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Helpers = (function () {
  const { todayISO, isHabitActiveOn } = REBUILT.Data;

  function getToday() {
    return todayISO(0);
  }

  /** Habits active today (respecting daily/weekly/custom frequency). */
  function getTodayHabits(state) {
    const now = new Date();
    return state.habits.filter((h) => isHabitActiveOn(h, now));
  }

  /** Tasks relevant to today: due today, or overdue-and-still-open, or completed today. */
  function getTodayTasks(state) {
    const today = getToday();
    return state.tasks.filter((t) => {
      if (t.completed) return t.completedAt === today;
      if (!t.date) return false;
      return t.date <= today;
    });
  }

  /** completed-today ÷ scheduled-today, exactly as asked: today's items only, not the whole app's history. */
  function calculateDailyProgress(state) {
    const todayHabits = getTodayHabits(state);
    const today = getToday();
    const habitsDone = todayHabits.filter((h) => h.completionHistory.includes(today)).length;

    const dueTasks = state.tasks.filter((t) => t.date === today || (t.completed && t.completedAt === today));
    const tasksDone = dueTasks.filter((t) => t.completed).length;

    const total = todayHabits.length + dueTasks.length;
    const done = habitsDone + tasksDone;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    return { habitsDone, habitsTotal: todayHabits.length, tasksDone, tasksTotal: dueTasks.length, done, total, pct };
  }

  /** Last 7 days of completion % + XP, oldest first — the real numbers behind the weekly chart. */
  function calculateWeeklyStats(state) {
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(todayISO(-i));
    return days.map((date) => {
      const entry = state.history[date] || { habitsCompleted: 0, totalHabits: 0, tasksCompleted: 0, xpEarned: 0 };
      const pct = entry.totalHabits > 0 ? Math.round((entry.habitsCompleted / entry.totalHabits) * 100) : 0;
      return { date, pct, xp: entry.xpEarned || 0, habitsCompleted: entry.habitsCompleted, tasksCompleted: entry.tasksCompleted };
    });
  }

  /** The one authoritative XP total — every screen should read it through here, never re-derive it. */
  function calculateTotalXP(state) {
    return state.xp.total;
  }

  function hasEnoughHistoryForAnalytics(state) {
    return Object.keys(state.history).length >= 3;
  }

  function isFreshState(state) {
    return state.habits.length === 0 && state.tasks.length === 0 && (state.scheduleItems || []).length === 0;
  }

  return {
    getToday,
    getTodayHabits,
    getTodayTasks,
    calculateDailyProgress,
    calculateWeeklyStats,
    calculateTotalXP,
    hasEnoughHistoryForAnalytics,
    isFreshState,
  };
})();
