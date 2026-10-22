/* ============================================================
   REBUILT — storage.js
   Every read/write to persistence goes through here.

   Two halves:
   • load()/save()/clear() — the local cache. save()/clear() always
     write the device-local copy, in both modes, so the app has an
     offline mirror even when a real account is connected. load() is
     async: when a real Supabase session exists it fetches the full
     state from the server (the source of truth); otherwise it falls
     back to the local cache.
   • sync* — one function per mutation type. In local mode every one
     of these no-ops instantly. In connected mode each mirrors a
     local state change to Supabase, fire-and-forget from the
     caller's point of view: the UI already updated optimistically
     against local state, so a sync failure is logged, never thrown
     back into a click handler.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Storage = (function () {
  const KEY = REBUILT.Data.STORAGE_KEY;

  function loadLocalCache() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch (err) {
      console.error("REBUILT: failed to read saved data", err);
      return null;
    }
  }

  async function load() {
    if (REBUILT.Auth.isRealAuth()) {
      try {
        const sb = REBUILT.SupabaseClient.get();
        const { data, error } = await sb.auth.getUser();
        if (!error && data && data.user) {
          const remote = await REBUILT.SupabaseData.loadFullState(sb, data.user.id);
          if (remote) return remote;
        }
      } catch (err) {
        // Offline / Supabase unreachable mid-load: the local cache is the
        // honest fallback rather than leaving the app stuck.
        console.warn("REBUILT: could not load from Supabase, falling back to local cache", err);
      }
    }
    return loadLocalCache();
  }

  function save(state) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.error("REBUILT: failed to save data", err);
      return false;
    }
  }

  function clear() {
    try {
      window.localStorage.removeItem(KEY);
      return true;
    } catch (err) {
      return false;
    }
  }

  /* ================= Sync layer ================= */

  const pendingCreates = new Map(); // client-generated id -> in-flight create promise

  function connected() {
    return REBUILT.Auth.isRealAuth();
  }

  function client() {
    return REBUILT.SupabaseClient.get();
  }

  /**
   * A sync call's own bug must never break the caller — log and swallow.
   * Always wraps the result with Promise.resolve() rather than checking
   * for a `.catch` method: a Postgrest query builder is a bare thenable
   * (it implements `.then()`, which is what actually fires the request)
   * and may not expose `.catch` directly — checking for it first would
   * skip ever calling `.then()`, so the request would silently never fire.
   */
  function guarded(fn) {
    try {
      return Promise.resolve(fn()).catch((err) => console.warn("REBUILT: sync failed", err));
    } catch (err) {
      console.warn("REBUILT: sync threw synchronously", err);
      return Promise.resolve();
    }
  }

  /** If a create for this id is still in flight, wait for it first — avoids a
   *  foreign-key race when a dependent action (complete/edit/delete) fires
   *  immediately after the create that produced the parent row. */
  async function afterPending(id) {
    const pending = pendingCreates.get(id);
    if (pending) {
      try {
        await pending;
      } catch (err) {
        // the create's own failure is already logged by trackCreate
      }
    }
  }

  function trackCreate(id, promise) {
    const tracked = Promise.resolve(promise)
      .catch((err) => console.warn("REBUILT: create sync failed", err))
      .finally(() => {
        if (pendingCreates.get(id) === tracked) pendingCreates.delete(id);
      });
    pendingCreates.set(id, tracked);
    return tracked;
  }

  /* ---- Habits ---- */

  function syncAddHabit(userId, habit) {
    if (!connected()) return;
    return guarded(() => trackCreate(habit.id, REBUILT.SupabaseData.insertHabit(client(), userId, habit)));
  }

  function syncUpdateHabit(id, fields) {
    if (!connected()) return;
    return guarded(async () => {
      await afterPending(id);
      return REBUILT.SupabaseData.updateHabit(client(), id, fields);
    });
  }

  function syncDeleteHabit(id) {
    if (!connected()) return;
    // Registered as pending so an immediate "undo" (re-create) waits for this delete to land first.
    return guarded(() =>
      trackCreate(
        id,
        (async () => {
          await afterPending(id);
          return REBUILT.SupabaseData.deleteHabit(client(), id);
        })()
      )
    );
  }

  function syncHabitCompletion(userId, habitId, date, xpAwarded, isCompleting) {
    if (!connected()) return;
    return guarded(async () => {
      await afterPending(habitId);
      return isCompleting
        ? REBUILT.SupabaseData.insertHabitCompletion(client(), userId, habitId, date, xpAwarded)
        : REBUILT.SupabaseData.deleteHabitCompletion(client(), habitId, date);
    });
  }

  /* ---- Tasks ---- */

  function syncAddTask(userId, task) {
    if (!connected()) return;
    return guarded(() => trackCreate(task.id, REBUILT.SupabaseData.insertTask(client(), userId, task)));
  }

  function syncUpdateTask(id, fields) {
    if (!connected()) return;
    return guarded(async () => {
      await afterPending(id);
      return REBUILT.SupabaseData.updateTask(client(), id, fields);
    });
  }

  function syncDeleteTask(id) {
    if (!connected()) return;
    // Registered as pending so an immediate "undo" (re-create) waits for this delete to land first.
    return guarded(() =>
      trackCreate(
        id,
        (async () => {
          await afterPending(id);
          return REBUILT.SupabaseData.deleteTask(client(), id);
        })()
      )
    );
  }

  function syncToggleTask(id, completed, completedAt, xpAwarded) {
    if (!connected()) return;
    return guarded(async () => {
      await afterPending(id);
      return REBUILT.SupabaseData.setTaskCompletion(client(), id, completed, completedAt, xpAwarded);
    });
  }

  /* ---- Planner / schedule items ---- */

  function syncAddScheduleItem(userId, item) {
    if (!connected()) return;
    return guarded(() => trackCreate(item.id, REBUILT.SupabaseData.insertScheduleItem(client(), userId, item)));
  }

  function syncUpdateScheduleItem(id, fields) {
    if (!connected()) return;
    return guarded(async () => {
      await afterPending(id);
      return REBUILT.SupabaseData.updateScheduleItem(client(), id, fields);
    });
  }

  function syncDeleteScheduleItem(id) {
    if (!connected()) return;
    // Registered as pending so an immediate "undo" (re-create) waits for this delete to land first.
    return guarded(() =>
      trackCreate(
        id,
        (async () => {
          await afterPending(id);
          return REBUILT.SupabaseData.deleteScheduleItem(client(), id);
        })()
      )
    );
  }

  function syncToggleScheduleItem(id, completed) {
    if (!connected()) return;
    return guarded(async () => {
      await afterPending(id);
      return REBUILT.SupabaseData.setScheduleItemCompletion(client(), id, completed);
    });
  }

  /* ---- Daily history / achievements ---- */

  function syncDailyHistory(userId, date, entry) {
    if (!connected()) return;
    return guarded(() => REBUILT.SupabaseData.upsertDailyHistory(client(), userId, date, entry));
  }

  function syncUnlockAchievement(userId, achievementId, unlockedAt, xpAwarded) {
    if (!connected()) return;
    return guarded(() => REBUILT.SupabaseData.insertUnlockedAchievement(client(), userId, achievementId, unlockedAt, xpAwarded));
  }

  /* ---- Undo support: re-create something that was just deleted ---- */

  /** Re-insert a deleted habit and its completion rows (the delete cascaded them server-side). */
  function syncRestoreHabit(userId, habit) {
    if (!connected()) return;
    return guarded(() =>
      trackCreate(
        habit.id,
        (async () => {
          await afterPending(habit.id);
          await REBUILT.SupabaseData.insertHabit(client(), userId, habit);
          for (const date of habit.completionHistory || []) {
            await REBUILT.SupabaseData.insertHabitCompletion(client(), userId, habit.id, date, habit.xp);
          }
        })()
      )
    );
  }

  function syncRestoreTask(userId, task) {
    if (!connected()) return;
    return guarded(() =>
      trackCreate(
        task.id,
        (async () => {
          await afterPending(task.id);
          await REBUILT.SupabaseData.insertTask(client(), userId, task);
          if (task.completed) {
            await REBUILT.SupabaseData.setTaskCompletion(client(), task.id, true, task.completedAt, task.xp);
          }
        })()
      )
    );
  }

  function syncRestoreScheduleItem(userId, item) {
    if (!connected()) return;
    return guarded(() =>
      trackCreate(
        item.id,
        (async () => {
          await afterPending(item.id);
          await REBUILT.SupabaseData.insertScheduleItem(client(), userId, item);
          if (item.completed) await REBUILT.SupabaseData.setScheduleItemCompletion(client(), item.id, true);
        })()
      )
    );
  }

  /* ---- Goals (stored in user_profiles.goals — see goals.js) ---- */

  // Every goal edit rewrites the whole list, so writes are chained: two quick edits
  // (e.g. ticking three steps in a row) can never land on the server out of order.
  let goalsQueue = Promise.resolve();
  function syncGoals(userId, goals) {
    if (!connected()) return;
    const encoded = REBUILT.Goals.encodeAll(goals); // snapshot now, not when the turn comes
    goalsQueue = goalsQueue.then(() =>
      guarded(() => REBUILT.SupabaseData.updateUserProfile(client(), userId, { goals: encoded }))
    );
    return goalsQueue;
  }

  /* ---- Profile / settings / onboarding ---- */

  function syncProfile(userId, fields) {
    if (!connected()) return;
    return guarded(() => REBUILT.SupabaseData.updateProfile(client(), userId, fields));
  }

  /** Edit-profile (occupation, life description, skills, hobbies, challenges). Goals go through syncGoals. */
  function syncUserProfile(userId, fields) {
    if (!connected()) return;
    return guarded(() => REBUILT.SupabaseData.updateUserProfile(client(), userId, fields));
  }

  function syncOnboarding(userId, userProfileFields, knownChallenges, goals) {
    if (!connected()) return;
    // Goals are stored in rich form (see goals.js); the plain titles in userProfile.goals are replaced.
    const fields = Object.assign({}, userProfileFields, { goals: REBUILT.Goals.encodeAll(goals || []) });
    return guarded(() =>
      Promise.all([
        REBUILT.SupabaseData.updateUserProfile(client(), userId, fields),
        REBUILT.SupabaseData.updateAiProfile(client(), userId, { knownChallenges }),
        REBUILT.SupabaseData.updateProfile(client(), userId, { isOnboarded: true }),
      ])
    );
  }

  return {
    load,
    save,
    clear,
    syncAddHabit,
    syncUpdateHabit,
    syncDeleteHabit,
    syncHabitCompletion,
    syncAddTask,
    syncUpdateTask,
    syncDeleteTask,
    syncToggleTask,
    syncAddScheduleItem,
    syncUpdateScheduleItem,
    syncDeleteScheduleItem,
    syncToggleScheduleItem,
    syncDailyHistory,
    syncUnlockAchievement,
    syncRestoreHabit,
    syncRestoreTask,
    syncRestoreScheduleItem,
    syncGoals,
    syncProfile,
    syncUserProfile,
    syncOnboarding,
  };
})();
