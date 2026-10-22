/* ============================================================
   REBUILT — goals.js
   Goal model + helpers.

   A goal is a titled outcome with optional steps ("خطوات"). Progress
   is DERIVED from the steps (done ÷ total) — never stored — so it can
   never drift from what the user actually ticked.

     goal = { id, title, why, targetDate|null, status:"active"|"done",
              steps:[{id,title,done}], createdAt, completedAt|null }

   Persistence (no schema change): the existing `user_profiles.goals`
   text[] column holds one entry per goal. New goals are written as
   "rbg1:" + compact JSON; plain-text entries written by earlier
   versions (onboarding chips) are read as goals with no steps. So
   nothing already saved is lost or rewritten until the user edits it.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Goals = (function () {
  const PREFIX = "rbg1:";
  const { todayISO, generateId } = REBUILT.Data;

  /* ---------- Creation / normalisation ---------- */

  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function clean(goal) {
    const steps = Array.isArray(goal.steps) ? goal.steps : [];
    return {
      id: goal.id || generateId("goal"),
      title: String(goal.title || "").trim(),
      why: String(goal.why || "").trim(),
      targetDate: goal.targetDate || null,
      status: goal.status === "done" ? "done" : "active",
      steps: steps
        .map((s) => ({ id: s.id || generateId("step"), title: String(s.title || "").trim(), done: !!s.done }))
        .filter((s) => s.title),
      createdAt: goal.createdAt || todayISO(0),
      completedAt: goal.completedAt || null,
    };
  }

  function create(payload) {
    return clean(payload);
  }

  /* ---------- Progress (derived) ---------- */

  function progress(goal) {
    const total = goal.steps.length;
    const done = goal.steps.filter((s) => s.done).length;
    let pct;
    if (total > 0) pct = Math.round((done / total) * 100);
    else pct = goal.status === "done" ? 100 : 0;
    if (goal.status === "done") pct = 100;
    return { done, total, pct };
  }

  /** Days until the target date (negative = overdue), or null without a date. */
  function daysLeft(goal) {
    if (!goal.targetDate || goal.status === "done") return null;
    const a = new Date(todayISO(0) + "T00:00:00");
    const b = new Date(goal.targetDate + "T00:00:00");
    return Math.round((b - a) / 86400000);
  }

  /** Egyptian-Arabic day count: يوم / يومين / 3–10 أيام / 11+ يوم. */
  function daysWord(n) {
    if (n === 1) return "يوم";
    if (n === 2) return "يومين";
    if (n >= 3 && n <= 10) return n + " أيام";
    return n + " يوم";
  }

  function dueLabel(goal) {
    const d = daysLeft(goal);
    if (d === null) return "";
    if (d < 0) return d === -1 ? "متأخر يوم" : `متأخر ${daysWord(Math.abs(d))}`;
    if (d === 0) return "الموعد النهارده";
    if (d === 1) return "الموعد بكرة";
    return `فاضل ${daysWord(d)}`;
  }

  /** Active first (soonest deadline first, then newest), completed last. */
  function sorted(goals) {
    return goals.slice().sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      if (a.status === "active") {
        const ad = a.targetDate || "9999-12-31";
        const bd = b.targetDate || "9999-12-31";
        if (ad !== bd) return ad < bd ? -1 : 1;
      }
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });
  }

  function stats(goals) {
    const active = goals.filter((g) => g.status === "active");
    const done = goals.filter((g) => g.status === "done");
    const avg = active.length ? Math.round(active.reduce((s, g) => s + progress(g).pct, 0) / active.length) : 0;
    return { total: goals.length, active: active.length, done: done.length, avgProgress: avg };
  }

  /** Titles of goals still being worked on — what the profile / AI context call "goals". */
  function titlesFor(goals) {
    return goals.filter((g) => g.status === "active").map((g) => g.title);
  }

  /* ---------- (De)serialisation for user_profiles.goals ---------- */

  function encode(goal) {
    const g = clean(goal);
    return (
      PREFIX +
      JSON.stringify({
        i: g.id,
        t: g.title,
        w: g.why || undefined,
        d: g.targetDate || undefined,
        s: g.status === "done" ? "done" : undefined,
        c: g.createdAt,
        x: g.completedAt || undefined,
        p: g.steps.length ? g.steps.map((s) => [s.id, s.title, s.done ? 1 : 0]) : undefined,
      })
    );
  }

  function decode(entry) {
    const raw = String(entry == null ? "" : entry);
    if (raw.startsWith(PREFIX)) {
      try {
        const o = JSON.parse(raw.slice(PREFIX.length));
        return clean({
          id: o.i,
          title: o.t,
          why: o.w,
          targetDate: o.d,
          status: o.s,
          createdAt: o.c,
          completedAt: o.x,
          steps: (o.p || []).map((p) => ({ id: p[0], title: p[1], done: !!p[2] })),
        });
      } catch (err) {
        /* fall through: treat the text as a plain title rather than lose it */
      }
    }
    const title = raw.trim();
    if (!title) return null;
    // Legacy plain-text goal: stable id so re-reading never creates duplicates.
    return clean({ id: "legacy-" + hash(title), title });
  }

  const encodeAll = (goals) => goals.map(encode);
  function decodeAll(entries) {
    const seen = new Set();
    return (Array.isArray(entries) ? entries : [])
      .map(decode)
      .filter((g) => g && g.title && !seen.has(g.id) && seen.add(g.id));
  }

  /* ---------- State migration ---------- */

  /** Make sure state.goals exists and that older profile-only goals become real goal objects (once). */
  function migrate(state) {
    if (!Array.isArray(state.goals)) {
      state.goals = decodeAll(state.userProfile && state.userProfile.goals);
    }
    state.goals = state.goals.map(clean).filter((g) => g.title);
    state.userProfile.goals = titlesFor(state.goals);
  }

  return { create, clean, progress, daysLeft, dueLabel, sorted, stats, titlesFor, encode, decode, encodeAll, decodeAll, migrate };
})();
