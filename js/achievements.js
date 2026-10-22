/* ============================================================
   REBUILT — achievements.js
   Builds a small context object from current state and checks
   every achievement definition against it.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Achievements = (function () {
  const { ACHIEVEMENTS, todayISO } = REBUILT.Data;

  function buildContext(state) {
    const totalHabitCompletions = state.habits.reduce(
      (sum, h) => sum + (h.completionHistory ? h.completionHistory.length : 0),
      0
    );
    const maxSingleHabitCompletions = state.habits.reduce(
      (max, h) => Math.max(max, h.completionHistory ? h.completionHistory.length : 0),
      0
    );
    const totalTasksCompleted = state.tasks.filter((t) => t.completed).length;
    const hasPerfectDay = Object.values(state.history).some(
      (day) => day.allHabitsCompleted && day.totalHabits > 0 && day.tasksCompleted > 0
    );
    const levelInfo = REBUILT.XP.getLevelInfo(state.xp.total);

    return {
      longestStreak: state.streak.longest || 0,
      totalHabitCompletions,
      maxSingleHabitCompletions,
      totalTasksCompleted,
      hasPerfectDay,
      hasEarlyCompletion: !!state.earlyCompletionEver,
      level: levelInfo.level,
      totalXP: state.xp.total,
    };
  }

  /** Check all achievements; unlock any newly-earned ones. Returns the unlocked defs. */
  function checkAll(state) {
    const ctx = buildContext(state);
    const newlyUnlocked = [];

    ACHIEVEMENTS.forEach((def) => {
      const record = state.achievements.find((a) => a.id === def.id);
      if (!record || record.unlocked) return;
      if (def.test(ctx)) {
        record.unlocked = true;
        record.unlockedAt = todayISO(0);
        if (def.xpBonus) {
          REBUILT.XP.addXP(state, def.xpBonus);
          REBUILT.Streak.logXPToday(state, def.xpBonus);
        }
        newlyUnlocked.push(def);
      }
    });

    return newlyUnlocked;
  }

  function getEnriched(state) {
    return ACHIEVEMENTS.map((def) => {
      const record = state.achievements.find((a) => a.id === def.id) || {};
      return Object.assign({}, def, {
        unlocked: !!record.unlocked,
        unlockedAt: record.unlockedAt || null,
      });
    });
  }

  return { checkAll, getEnriched, buildContext };
})();
