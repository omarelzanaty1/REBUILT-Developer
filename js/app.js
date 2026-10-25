/* ============================================================
   REBUILT — app.js
   Holds the live state object, runs the first-run gate (auth +
   onboarding) before the app shell, wires up navigation + the
   single delegated click listener, and implements every action
   that mutates state.

   Deleting is never gated behind a browser confirm(): everything
   that can be undone (habits, tasks, schedule items, goals, steps)
   is removed immediately and offers "تراجع" in a toast. Only
   actions that cannot be undone (wipe all data, replace all data)
   ask first, in an in-app dialog.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.App = (function () {
  let state = null;
  let lastSettledDay = null;
  let navBound = false;
  let oauthResult = null; // how the trip to Google went, kept until the gate has finished

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const todayISO = () => REBUILT.Data.todayISO(0);

  function save() {
    REBUILT.Storage.save(state);
  }

  /** Mirror today's recomputed history entry + any newly unlocked achievements to Supabase (no-ops in local mode). */
  function syncDerivedState(unlocked) {
    const today = todayISO();
    REBUILT.Storage.syncDailyHistory(state.user.id, today, state.history[today]);
    unlocked.forEach((def) => {
      const record = state.achievements.find((a) => a.id === def.id);
      REBUILT.Storage.syncUnlockAchievement(state.user.id, def.id, (record && record.unlockedAt) || today, def.xpBonus || 0);
    });
  }

  /** Run the standard "something changed" pipeline: refresh today, streak, achievements, persist, re-render. */
  function settle() {
    REBUILT.Streak.refreshToday(state);
    REBUILT.Streak.recomputeStreak(state);
    const unlocked = REBUILT.Achievements.checkAll(state);
    syncDerivedState(unlocked);
    save();
    lastSettledDay = todayISO();
    REBUILT.Router.renderCurrent();
    unlocked.forEach((def) => {
      REBUILT.Toast.achievement(def.name, def.icon);
      REBUILT.Toast.confetti();
    });
    return unlocked;
  }

  /** Persist + re-render without touching XP/streak (planner items, goals, profile). */
  function commit() {
    save();
    REBUILT.Router.renderCurrent();
  }

  function migrateAchievements() {
    REBUILT.Data.ACHIEVEMENTS.forEach((def) => {
      if (!state.achievements.find((a) => a.id === def.id)) {
        state.achievements.push({ id: def.id, unlocked: false, unlockedAt: null });
      }
    });
  }

  /** Fill in any fields an older saved state (pre-Phase-2) wouldn't have, so we never crash on load. */
  function migrateShape() {
    if (!state.meta) state.meta = { isDemo: false, isOnboarded: true, hasLocalAccount: true }; // pre-existing saves are treated as already onboarded
    if (state.meta.isOnboarded === undefined) state.meta.isOnboarded = true;
    if (state.meta.hasLocalAccount === undefined) state.meta.hasLocalAccount = true;
    if (!state.user) state.user = { id: REBUILT.Data.generateId("user"), name: "", email: "", avatar: "", createdAt: todayISO() };
    if (!state.settings) state.settings = { theme: "dark", reduceMotion: false };
    if (!state.userProfile) state.userProfile = { occupation: "", occupationCustom: "", lifeDescription: "", skills: [], hobbies: [], goals: [], challenges: "" };
    if (!state.aiProfile) {
      state.aiProfile = { userType: null, communicationStyle: null, motivationStyle: null, preferredResponseLength: "medium", productivityStyle: null, disciplineLevel: null, planningPreference: null, commonPatterns: [], knownChallenges: [] };
    }
    if (!state.scheduleItems) state.scheduleItems = [];
    if (!state.aiConversation) state.aiConversation = [];
    if (state.user.email === undefined) state.user.email = "";
    if (!state.lastMessageIndex) state.lastMessageIndex = {};
    if (!state.history) state.history = {};
    if (!state.achievements) state.achievements = [];
    if (!state.streak) state.streak = { current: 0, longest: 0 };
    if (!state.xp) state.xp = { total: 0 };
    REBUILT.Goals.migrate(state);
    migrateAchievements();
  }

  /** After a real sign-in / sign-up the server copy is the truth — never carry over whatever this browser had cached. */
  async function reloadState() {
    if (!REBUILT.Auth.isRealAuth()) return state;
    try {
      const fresh = await REBUILT.Storage.load();
      if (fresh) {
        state = fresh;
        migrateShape();
      }
    } catch (err) {
      console.warn("REBUILT: could not refresh state after sign-in", err);
    }
    return state;
  }

  async function init() {
    REBUILT.Auth.watchAuthEvents();
    const saved = await REBUILT.Storage.load();
    state = saved || REBUILT.Data.buildEmptyState();
    migrateShape();

    // When real auth is active, the server is the source of truth for "am I
    // signed in?" — this is also what picks up a session created by clicking
    // the email-confirmation link.
    if (REBUILT.Auth.isRealAuth()) {
      try {
        const session = await REBUILT.Auth.getSession(state);
        if (session.loggedIn) {
          state.meta.hasLocalAccount = true;
          state.user.id = session.userId;
          state.user.email = session.email;
          if (!state.user.name && session.name) state.user.name = session.name; // e.g. the name Google sends
        } else if (state.meta.hasLocalAccount) {
          // Local flag claims signed-in but the server disagrees (expired /
          // signed out elsewhere) — send them back through the gate.
          state.meta.hasLocalAccount = false;
        }
        REBUILT.Storage.save(state);
      } catch (err) {
        // Offline or Supabase unreachable: fall back to whatever local state says.
        console.warn("REBUILT: could not verify session, continuing offline", err);
      }
    }

    // Back from Google (sign-in or "link my Google account")? Read how it went before the gate decides what to show.
    try {
      oauthResult = await REBUILT.Auth.consumeOAuthResult();
    } catch (err) {
      console.warn("REBUILT: could not read the Google result", err);
      oauthResult = null;
    }

    REBUILT.Gate.start(state, onGatePassed, { reload: reloadState, oauth: oauthResult });
  }

  /** Shown after the gate: a linking attempt lands on Settings (where the result is explained); other failures get a toast. */
  function announceOAuthResult() {
    const r = oauthResult;
    oauthResult = null;
    if (!r) return null;
    if (r.mode === "link") {
      REBUILT.OAuthNotice = r; // settings.js shows it next to the sign-in methods, then clears it
      if (r.ok) REBUILT.Toast.show({ icon: "checkCircle", text: "اتربط حساب Google بحسابك.", tone: "success" });
      return "settings";
    }
    if (r.ok === false) REBUILT.Toast.show({ icon: "alert", text: REBUILT.Components.esc(r.error), tone: "danger", duration: 5000 });
    return null;
  }

  function onGatePassed() {
    REBUILT.Streak.refreshToday(state);
    REBUILT.Streak.recomputeStreak(state);
    const unlocked = REBUILT.Achievements.checkAll(state); // reconcile silently — no toasts for history that predates this session
    syncDerivedState(unlocked);
    document.body.classList.toggle("reduce-motion", !!state.settings.reduceMotion);
    save();
    lastSettledDay = todayISO();

    REBUILT.Shell.mount();
    bindDelegates();
    const landing = announceOAuthResult();
    REBUILT.Router.navigateTo(landing || REBUILT.Router.pageFromHash() || "dashboard");
  }

  function bindDelegates() {
    if (navBound) return;
    navBound = true;

    document.body.addEventListener("click", (e) => {
      const navEl = e.target.closest("[data-nav]");
      if (navEl) {
        e.preventDefault();
        REBUILT.Router.navigateTo(navEl.dataset.nav);
        return;
      }
      const el = e.target.closest("[data-action]");
      if (!el || el.closest("#gate-root")) return;
      Actions.dispatch(el.dataset.action, el.dataset.id, el);
    });

    // Catch a day rollover if the tab is left open across midnight — but never
    // re-render under the user's hands (typing a step, filling a form) otherwise.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && lastSettledDay !== todayISO() && !REBUILT.Modal.isOpen()) settle();
    });
  }

  /* ---------------- Undo helper ---------------- */

  function undoToast(text, onUndo) {
    REBUILT.Toast.show({
      icon: "trash",
      text,
      tone: "default",
      action: { label: "تراجع", onClick: onUndo },
    });
  }

  /* ---------------- Actions ---------------- */

  const Actions = {
    dispatch(action, id, el) {
      switch (action) {
        case "toggle-habit": return Actions.toggleHabit(id);
        case "edit-habit": return REBUILT.Pages.habits.openForm(state, id);
        case "delete-habit": return Actions.deleteHabit(id);
        case "open-add-habit": return REBUILT.Pages.habits.openForm(state);
        case "toggle-task": return Actions.toggleTask(id);
        case "edit-task": return REBUILT.Pages.tasks.openForm(state, id);
        case "delete-task": return Actions.deleteTask(id);
        case "open-add-task": return REBUILT.Pages.tasks.openForm(state);
        case "toggle-schedule-item": return Actions.toggleScheduleItem(id);
        case "edit-schedule-item": return REBUILT.Pages.planner.openForm(state, id);
        case "delete-schedule-item": return Actions.deleteScheduleItem(id);
        case "open-add-schedule-item": return REBUILT.Pages.planner.openForm(state);
        case "open-add-goal": return REBUILT.Pages.goals.openForm(state);
        case "edit-goal": return REBUILT.Pages.goals.openForm(state, id);
        case "delete-goal": return Actions.deleteGoal(id);
        case "toggle-step": return Actions.toggleStep(id, el && el.dataset.step);
        case "delete-step": return Actions.deleteStep(id, el && el.dataset.step);
        case "complete-goal": return Actions.completeGoal(id);
        case "reopen-goal": return Actions.reopenGoal(id);
        default: return;
      }
    },

    /* ---- Habits ---- */

    toggleHabit(id) {
      const habit = state.habits.find((h) => h.id === id);
      if (!habit) return;
      const today = todayISO();
      const alreadyDone = habit.completionHistory.includes(today);

      if (alreadyDone) {
        habit.completionHistory = habit.completionHistory.filter((d) => d !== today);
        REBUILT.XP.addXP(state, -habit.xp);
        REBUILT.Streak.logXPToday(state, -habit.xp);
        REBUILT.Streak.computeHabitStreak(habit);
        REBUILT.Storage.syncHabitCompletion(state.user.id, habit.id, today, habit.xp, false);
        settle();
        return;
      }

      habit.completionHistory.push(today);
      if (new Date().getHours() < 8) state.earlyCompletionEver = true;
      REBUILT.Streak.computeHabitStreak(habit);
      const levelResult = REBUILT.XP.addXP(state, habit.xp);
      REBUILT.Streak.logXPToday(state, habit.xp);
      REBUILT.Storage.syncHabitCompletion(state.user.id, habit.id, today, habit.xp, true);

      settle();

      REBUILT.Toast.xpGain(habit.xp);
      REBUILT.Toast.show({ icon: "checkCircle", text: REBUILT.Messages.habitCompleted(state), tone: "success", duration: 2200 });

      if (levelResult.leveledUp) {
        REBUILT.Toast.levelUp(levelResult.toLevel, REBUILT.Messages.levelUp(state, levelResult.toLevel));
      }
    },

    deleteHabit(id) {
      const index = state.habits.findIndex((h) => h.id === id);
      if (index < 0) return;
      const snapshot = clone(state.habits[index]);
      // Revoke this habit's historical XP so the total never outlives its record.
      const historicalXP = (snapshot.completionHistory || []).length * snapshot.xp;
      if (historicalXP > 0) REBUILT.XP.addXP(state, -historicalXP);
      state.habits.splice(index, 1);
      REBUILT.Storage.syncDeleteHabit(id);
      REBUILT.Modal.close();
      settle();
      undoToast("اتمسحت العادة.", () => Actions.restoreHabit(snapshot, index));
    },

    restoreHabit(snapshot, index) {
      if (state.habits.some((h) => h.id === snapshot.id)) return;
      state.habits.splice(Math.min(index, state.habits.length), 0, snapshot);
      const historicalXP = (snapshot.completionHistory || []).length * snapshot.xp;
      if (historicalXP > 0) REBUILT.XP.addXP(state, historicalXP);
      REBUILT.Streak.computeHabitStreak(snapshot);
      REBUILT.Storage.syncRestoreHabit(state.user.id, snapshot);
      settle();
      REBUILT.Toast.show({ icon: "undo", text: "رجّعنا العادة.", tone: "default", duration: 2000 });
    },

    addHabit(payload) {
      const habit = {
        id: REBUILT.Data.generateId("habit"),
        title: payload.title,
        description: payload.description || "",
        icon: payload.icon,
        xp: payload.xp,
        frequency: payload.frequency,
        targetDays: payload.targetDays || [],
        time: payload.time || null,
        createdAt: todayISO(),
        completionHistory: [],
        currentStreak: 0,
        longestStreak: 0,
      };
      state.habits.push(habit);
      REBUILT.Storage.syncAddHabit(state.user.id, habit);
      settle();
      REBUILT.Toast.show({ icon: "flame", text: "عادة جديدة اتضافت، يلا نبدأ فيها.", tone: "success" });
    },

    updateHabit(id, payload) {
      const habit = state.habits.find((h) => h.id === id);
      if (!habit) return;
      Object.assign(habit, payload);
      REBUILT.Streak.computeHabitStreak(habit);
      REBUILT.Storage.syncUpdateHabit(id, payload);
      settle();
      REBUILT.Toast.show({ icon: "check", text: "اتحفظت التعديلات.", tone: "default", duration: 1800 });
    },

    /* ---- Tasks ---- */

    toggleTask(id) {
      const task = state.tasks.find((t) => t.id === id);
      if (!task) return;
      const today = todayISO();

      if (task.completed) {
        task.completed = false;
        task.completedAt = null;
        REBUILT.XP.addXP(state, -task.xp);
        REBUILT.Streak.logXPToday(state, -task.xp);
        REBUILT.Storage.syncToggleTask(id, false, null, 0);
        settle();
        return;
      }

      task.completed = true;
      task.completedAt = today;
      const levelResult = REBUILT.XP.addXP(state, task.xp);
      REBUILT.Streak.logXPToday(state, task.xp);
      REBUILT.Storage.syncToggleTask(id, true, today, task.xp);
      settle();

      REBUILT.Toast.xpGain(task.xp);
      REBUILT.Toast.show({ icon: "checkCircle", text: REBUILT.Messages.taskCompleted(state), tone: "success", duration: 2200 });
      if (levelResult.leveledUp) {
        REBUILT.Toast.levelUp(levelResult.toLevel, REBUILT.Messages.levelUp(state, levelResult.toLevel));
      }
    },

    deleteTask(id) {
      const index = state.tasks.findIndex((t) => t.id === id);
      if (index < 0) return;
      const snapshot = clone(state.tasks[index]);
      // A completed task's XP is revoked on delete — no XP should exist without a live record backing it.
      if (snapshot.completed) REBUILT.XP.addXP(state, -snapshot.xp);
      state.tasks.splice(index, 1);
      REBUILT.Storage.syncDeleteTask(id);
      REBUILT.Modal.close();
      settle();
      undoToast("اتمسحت المهمة.", () => Actions.restoreTask(snapshot, index));
    },

    restoreTask(snapshot, index) {
      if (state.tasks.some((t) => t.id === snapshot.id)) return;
      state.tasks.splice(Math.min(index, state.tasks.length), 0, snapshot);
      if (snapshot.completed) REBUILT.XP.addXP(state, snapshot.xp);
      REBUILT.Storage.syncRestoreTask(state.user.id, snapshot);
      settle();
      REBUILT.Toast.show({ icon: "undo", text: "رجّعنا المهمة.", tone: "default", duration: 2000 });
    },

    addTask(payload) {
      const task = {
        id: REBUILT.Data.generateId("task"),
        title: payload.title,
        description: payload.description || "",
        priority: payload.priority,
        date: payload.date || null,
        time: payload.time || null,
        xp: payload.xp,
        completed: false,
        completedAt: null,
        createdAt: todayISO(),
      };
      state.tasks.push(task);
      REBUILT.Storage.syncAddTask(state.user.id, task);
      settle();
      REBUILT.Toast.show({ icon: "tasks", text: "تمام، ضفناها للقايمة.", tone: "success" });
    },

    updateTask(id, payload) {
      const task = state.tasks.find((t) => t.id === id);
      if (!task) return;
      Object.assign(task, payload);
      REBUILT.Storage.syncUpdateTask(id, payload);
      settle();
      REBUILT.Toast.show({ icon: "check", text: "اتحفظت التعديلات.", tone: "default", duration: 1800 });
    },

    /* ---- Planner / schedule items ---- */

    addScheduleItem(payload) {
      const item = {
        id: REBUILT.Data.generateId("sched"),
        title: payload.title,
        type: payload.type || "event",
        date: payload.date,
        startTime: payload.startTime,
        endTime: payload.endTime || null,
        notes: payload.notes || "",
        completed: false,
      };
      state.scheduleItems.push(item);
      REBUILT.Storage.syncAddScheduleItem(state.user.id, item);
      commit();
      REBUILT.Toast.show({ icon: "calendar", text: "اتضاف لخطة يومك.", tone: "success" });
    },

    updateScheduleItem(id, payload) {
      const item = state.scheduleItems.find((s) => s.id === id);
      if (!item) return;
      Object.assign(item, payload);
      REBUILT.Storage.syncUpdateScheduleItem(id, payload);
      commit();
      REBUILT.Toast.show({ icon: "check", text: "اتحفظت التعديلات.", tone: "default", duration: 1800 });
    },

    deleteScheduleItem(id) {
      const index = state.scheduleItems.findIndex((s) => s.id === id);
      if (index < 0) return;
      const snapshot = clone(state.scheduleItems[index]);
      state.scheduleItems.splice(index, 1);
      REBUILT.Storage.syncDeleteScheduleItem(id);
      REBUILT.Modal.close();
      commit();
      undoToast("اتمسح من خطة اليوم.", () => Actions.restoreScheduleItem(snapshot, index));
    },

    restoreScheduleItem(snapshot, index) {
      if (state.scheduleItems.some((s) => s.id === snapshot.id)) return;
      state.scheduleItems.splice(Math.min(index, state.scheduleItems.length), 0, snapshot);
      REBUILT.Storage.syncRestoreScheduleItem(state.user.id, snapshot);
      commit();
      REBUILT.Toast.show({ icon: "undo", text: "رجّعنا العنصر.", tone: "default", duration: 2000 });
    },

    toggleScheduleItem(id) {
      const item = state.scheduleItems.find((s) => s.id === id);
      if (!item) return;
      item.completed = !item.completed;
      REBUILT.Storage.syncToggleScheduleItem(id, item.completed);
      commit();
    },

    /* ---- Goals (progress is derived from steps — see goals.js) ---- */

    persistGoals() {
      state.userProfile.goals = REBUILT.Goals.titlesFor(state.goals);
      REBUILT.Storage.syncGoals(state.user.id, state.goals);
      commit();
    },

    addGoal(payload) {
      const goal = REBUILT.Goals.create(payload);
      state.goals.push(goal);
      Actions.persistGoals();
      REBUILT.Toast.show({ icon: "target", text: "هدف جديد اتضاف. قسّمه لخطوات صغيرة.", tone: "success" });
    },

    updateGoal(id, payload) {
      const idx = state.goals.findIndex((g) => g.id === id);
      if (idx < 0) return;
      const prev = state.goals[idx];
      const next = REBUILT.Goals.clean(Object.assign({}, prev, payload, { id: prev.id, createdAt: prev.createdAt }));
      // A finished goal that gained an unticked step is, honestly, not finished any more.
      if (next.status === "done" && next.steps.some((s) => !s.done)) { next.status = "active"; next.completedAt = null; }
      state.goals[idx] = next;
      Actions.persistGoals();
      REBUILT.Toast.show({ icon: "check", text: "اتحفظت التعديلات.", tone: "default", duration: 1800 });
    },

    deleteGoal(id) {
      const index = state.goals.findIndex((g) => g.id === id);
      if (index < 0) return;
      const snapshot = clone(state.goals[index]);
      state.goals.splice(index, 1);
      REBUILT.Modal.close();
      Actions.persistGoals();
      undoToast("اتمسح الهدف.", () => Actions.restoreGoal(snapshot, index));
    },

    restoreGoal(snapshot, index) {
      if (state.goals.some((g) => g.id === snapshot.id)) return;
      state.goals.splice(Math.min(index, state.goals.length), 0, snapshot);
      Actions.persistGoals();
      REBUILT.Toast.show({ icon: "undo", text: "رجّعنا الهدف.", tone: "default", duration: 2000 });
    },

    addStep(goalId, title) {
      const goal = state.goals.find((g) => g.id === goalId);
      const text = String(title || "").trim();
      if (!goal || !text) return false;
      goal.steps.push({ id: REBUILT.Data.generateId("step"), title: text, done: false });
      if (goal.status === "done") { goal.status = "active"; goal.completedAt = null; }
      Actions.persistGoals();
      return true;
    },

    toggleStep(goalId, stepId) {
      const goal = state.goals.find((g) => g.id === goalId);
      const step = goal && goal.steps.find((s) => s.id === stepId);
      if (!step) return;
      step.done = !step.done;
      Actions.persistGoals();
    },

    deleteStep(goalId, stepId) {
      const goal = state.goals.find((g) => g.id === goalId);
      if (!goal) return;
      const index = goal.steps.findIndex((s) => s.id === stepId);
      if (index < 0) return;
      const removed = goal.steps.splice(index, 1)[0];
      Actions.persistGoals();
      undoToast("اتمسحت الخطوة.", () => {
        const g = state.goals.find((x) => x.id === goalId);
        if (!g || g.steps.some((s) => s.id === removed.id)) return;
        g.steps.splice(Math.min(index, g.steps.length), 0, removed);
        Actions.persistGoals();
      });
    },

    completeGoal(id) {
      const goal = state.goals.find((g) => g.id === id);
      if (!goal) return;
      goal.status = "done";
      goal.completedAt = todayISO();
      Actions.persistGoals();
      REBUILT.Toast.show({ icon: "trophy", text: "هدف اتحقق! مبروك.", tone: "achievement", duration: 3600 });
      REBUILT.Toast.confetti();
    },

    reopenGoal(id) {
      const goal = state.goals.find((g) => g.id === id);
      if (!goal) return;
      goal.status = "active";
      goal.completedAt = null;
      Actions.persistGoals();
    },

    /* ---- Profile / settings ---- */

    updateProfile(payload) {
      Object.assign(state.user, payload);
      REBUILT.Storage.syncProfile(state.user.id, payload);
      commit();
    },

    /** Occupation / life description / skills / hobbies / challenges (goals have their own page). */
    updateUserProfile(payload) {
      Object.assign(state.userProfile, payload);
      REBUILT.Storage.syncUserProfile(state.user.id, payload);
      commit();
    },

    updateSettings(payload) {
      Object.assign(state.settings, payload);
      if ("reduceMotion" in payload) {
        document.body.classList.toggle("reduce-motion", !!state.settings.reduceMotion);
      }
      REBUILT.Storage.syncProfile(state.user.id, { settings: state.settings });
      save();
    },

    async changePassword(newPassword) {
      return REBUILT.Auth.updatePassword(newPassword);
    },

    async signOut() {
      try {
        await REBUILT.Auth.signOut(state);
      } catch (err) {
        console.warn("REBUILT: sign-out request failed", err);
      }
      // A signed-in account lives on the server; don't leave its data behind in this
      // browser for whoever signs in next. (Local-only accounts keep their device copy.)
      if (REBUILT.Auth.isRealAuth()) REBUILT.Storage.clear();
      else save();
      try { history.replaceState(null, "", window.location.pathname + window.location.search); } catch (err) { /* cosmetic */ }
      window.location.reload();
    },

    /* ---- Data import/export/demo ---- (local mode only — see settings.js) ---- */

    exportData() {
      try {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `rebuilt-backup-${todayISO()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        REBUILT.Toast.show({ icon: "download", text: "اتصدّرت بياناتك.", tone: "success" });
      } catch (err) {
        REBUILT.Toast.error(REBUILT.Messages.genericError());
      }
    },

    importData(file) {
      if (REBUILT.Auth.isRealAuth()) {
        REBUILT.Toast.error("الاستيراد متاح في الوضع المحلي بس.");
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        let parsed;
        try {
          parsed = JSON.parse(reader.result);
          if (!parsed || !Array.isArray(parsed.habits) || !Array.isArray(parsed.tasks)) throw new Error("shape");
        } catch (err) {
          REBUILT.Toast.error("الملف ده مش متوافق. جرّب ملف تاني.");
          return;
        }
        const ok = await REBUILT.Modal.confirm({
          title: "استبدال بياناتك الحالية؟",
          text: "هيتم استبدال كل بياناتك الحالية على الجهاز ده ببيانات الملف. الخطوة دي مش بترجع.",
          confirmLabel: "استبدل البيانات",
          danger: true,
        });
        if (!ok) return;
        state = parsed;
        migrateShape();
        save();
        REBUILT.Router.navigateTo("dashboard");
        REBUILT.Toast.show({ icon: "upload", text: "اتضافت البيانات بنجاح.", tone: "success" });
      };
      reader.onerror = () => REBUILT.Toast.error(REBUILT.Messages.genericError());
      reader.readAsText(file);
    },

    async loadDemoData() {
      if (REBUILT.Auth.isRealAuth()) return;
      const ok = await REBUILT.Modal.confirm({
        title: "تحميل بيانات تجريبية؟",
        text: "هتستبدل بياناتك الحالية على الجهاز ده ببيانات تجريبية للتجربة بس.",
        confirmLabel: "حمّل البيانات التجريبية",
      });
      if (!ok) return;
      state = REBUILT.Data.buildDemoState();
      migrateShape();
      save();
      REBUILT.Router.navigateTo("dashboard");
      REBUILT.Toast.show({ icon: "info", text: "اتحمّلت بيانات تجريبية.", tone: "success" });
    },

    async resetToEmpty() {
      if (REBUILT.Auth.isRealAuth()) return;
      const ok = await REBUILT.Modal.confirm({
        title: "مسح كل البيانات؟",
        text: "هيتمسح كل اللي على الجهاز ده نهائيًا: العادات، المهام، الأهداف، الـXP والتاريخ. مفيش رجوع من الخطوة دي.",
        confirmLabel: "امسح كل حاجة",
        danger: true,
      });
      if (!ok) return;
      const keepAccount = state.meta.hasLocalAccount;
      const name = state.user.name;
      const email = state.user.email;
      state = REBUILT.Data.buildEmptyState();
      if (keepAccount) {
        state.meta.hasLocalAccount = true;
        state.meta.isOnboarded = false; // let them re-run onboarding on a truly clean slate
        state.user.name = name;
        state.user.email = email;
      }
      save();
      window.location.reload();
    },
  };

  return {
    init,
    Actions,
    get state() {
      return state;
    },
  };
})();

REBUILT.Actions = REBUILT.App.Actions;

document.addEventListener("DOMContentLoaded", function () {
  REBUILT.App.init();
});
