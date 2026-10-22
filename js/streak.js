/* ============================================================
   REBUILT — streak.js
   A day "counts" toward the overall streak when every habit that
   was active that day got done. Individual habits keep their own
   streak too, computed straight from completionHistory — never a
   blind counter — and frequency-aware (daily/custom skip inactive
   days; weekly counts per-week quotas instead of per-day).
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Streak = (function () {
  const { todayISO, isHabitActiveOn, formatLocalDate } = REBUILT.Data;

  function getEntry(state, date) {
    if (!state.history[date]) {
      state.history[date] = {
        habitsCompleted: 0,
        totalHabits: 0,
        tasksCompleted: 0,
        xpEarned: 0,
        allHabitsCompleted: false,
      };
    }
    return state.history[date];
  }

  /** Recompute today's derived counters from the source-of-truth habit/task lists. */
  function refreshToday(state) {
    const today = todayISO(0);
    const entry = getEntry(state, today);
    const activeToday = state.habits.filter((h) => isHabitActiveOn(h, new Date()));
    const totalHabits = activeToday.length;
    const habitsCompleted = activeToday.filter((h) => h.completionHistory.includes(today)).length;
    const tasksCompletedToday = state.tasks.filter((t) => t.completed && t.completedAt === today).length;

    entry.totalHabits = totalHabits;
    entry.habitsCompleted = habitsCompleted;
    entry.tasksCompleted = tasksCompletedToday;
    entry.allHabitsCompleted = totalHabits > 0 && habitsCompleted === totalHabits;

    return entry;
  }

  /** Log XP earned (or reversed, if negative) today — call whenever XP is granted or revoked. */
  function logXPToday(state, amount) {
    const entry = getEntry(state, todayISO(0));
    entry.xpEarned = (entry.xpEarned || 0) + amount;
  }

  /** Walk backward from today through history to compute the live day-streak. */
  function recomputeStreak(state) {
    const today = todayISO(0);
    let streak = 0;
    let offset = 0;

    if (state.history[today] && state.history[today].allHabitsCompleted) {
      streak = 1;
      offset = -1;
    } else {
      offset = -1; // today unfinished doesn't break the streak yet
    }

    for (let i = 0; i < 3650; i++) {
      const date = todayISO(offset);
      const entry = state.history[date];
      if (entry && entry.allHabitsCompleted) {
        streak++;
        offset--;
      } else {
        break;
      }
    }

    state.streak.current = streak;
    state.streak.longest = Math.max(state.streak.longest || 0, streak);
    return streak;
  }

  function isoOfWeek(dateObj) {
    // Week key using an Egypt-style Saturday-start week: "YYYY-WW" isn't needed —
    // we just need a stable per-week bucket key, so use the ISO date of that week's Saturday.
    const d = new Date(dateObj);
    const day = d.getDay(); // 0=Sun..6=Sat
    const diffToSaturday = (day + 1) % 7; // days since the most recent Saturday
    d.setDate(d.getDate() - diffToSaturday);
    return formatLocalDate(d);
  }

  /** Recompute a single habit's current/longest streak straight from completionHistory. Frequency-aware. */
  function computeHabitStreak(habit) {
    const today = todayISO(0);
    const history = new Set(habit.completionHistory || []);

    if (habit.frequency === "weekly") {
      // Streak = consecutive weeks (ending this week or last) with at least one completion.
      const weeksWithCompletion = new Set();
      history.forEach((date) => weeksWithCompletion.add(isoOfWeek(new Date(date + "T00:00:00"))));

      let current = 0;
      let cursor = new Date(today + "T00:00:00");
      const thisWeekKey = isoOfWeek(cursor);
      let offsetWeeks = weeksWithCompletion.has(thisWeekKey) ? 0 : -1;
      for (let i = 0; i < 520; i++) {
        const c = new Date(cursor);
        c.setDate(c.getDate() + offsetWeeks * 7);
        const key = isoOfWeek(c);
        if (weeksWithCompletion.has(key)) {
          current++;
          offsetWeeks--;
        } else {
          break;
        }
      }
      habit.currentStreak = current;
      habit.longestStreak = Math.max(habit.longestStreak || 0, current, weeksWithCompletion.size >= current ? current : 0);
      return habit;
    }

    // Daily / custom: walk day-by-day from creation, only evaluating days the habit was actually active on.
    let longest = 0;
    let running = 0;
    const start = habit.createdAt ? new Date(habit.createdAt + "T00:00:00") : new Date();
    const cursor = new Date(start);
    const end = new Date(today + "T00:00:00");
    for (let i = 0; i < 1000 && cursor <= end; i++) {
      if (isHabitActiveOn(habit, cursor)) {
        const dateStr = formatLocalDate(cursor);
        if (history.has(dateStr)) {
          running++;
          longest = Math.max(longest, running);
        } else if (dateStr !== today) {
          running = 0;
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    let current = 0;
    const cursor2 = new Date(end);
    let skippedToday = false;
    for (let i = 0; i < 1000; i++) {
      if (isHabitActiveOn(habit, cursor2)) {
        const dateStr = formatLocalDate(cursor2);
        if (history.has(dateStr)) {
          current++;
        } else if (dateStr === today && !skippedToday) {
          skippedToday = true; // today pending doesn't break the streak yet
        } else {
          break;
        }
      }
      cursor2.setDate(cursor2.getDate() - 1);
      if (cursor2 < start) break;
    }

    habit.currentStreak = current;
    habit.longestStreak = Math.max(longest, current);
    return habit;
  }

  return { getEntry, refreshToday, logXPToday, recomputeStreak, computeHabitStreak, isoOfWeek };
})();
