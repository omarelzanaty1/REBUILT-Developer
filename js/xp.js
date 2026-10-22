/* ============================================================
   REBUILT — xp.js
   Turns a lifetime XP total into a level + progress, and applies
   new XP while reporting whether a level-up happened.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.XP = (function () {
  const { xpForLevel } = REBUILT.Data;

  /**
   * Given a lifetime XP total, return where the user sits:
   * { level, currentLevelXP, neededForNextLevel }
   */
  function getLevelInfo(totalXP) {
    let level = 1;
    let remaining = totalXP;
    let needed = xpForLevel(level);

    while (remaining >= needed) {
      remaining -= needed;
      level++;
      needed = xpForLevel(level);
    }

    return {
      level,
      currentLevelXP: remaining,
      neededForNextLevel: needed,
      progressPct: Math.min(100, Math.round((remaining / needed) * 100)),
    };
  }

  /**
   * Add XP to a state object (mutates state.xp.total) and return
   * { leveledUp, fromLevel, toLevel }.
   */
  function addXP(state, amount) {
    const before = getLevelInfo(state.xp.total);
    state.xp.total = Math.max(0, state.xp.total + amount);
    const after = getLevelInfo(state.xp.total);
    return {
      leveledUp: after.level > before.level,
      fromLevel: before.level,
      toLevel: after.level,
    };
  }

  return { getLevelInfo, addXP };
})();
