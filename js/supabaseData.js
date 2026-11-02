/* ============================================================
   REBUILT — supabaseData.js
   The only file that knows the real Supabase table/column names.
   Two jobs:
     1. loadFullState() — read every table for the signed-in user and
        reassemble them into the exact same state shape local mode
        already uses (REBUILT.Data.buildEmptyState()'s shape), so the
        rest of the app never has to know which backend it's on.
     2. A thin CRUD function per table, used by storage.js's sync*
        wrappers to mirror a local mutation to the server. These are
        intentionally "dumb" — no retry/guard logic here, that lives
        in storage.js so it's in one place for every call.

   Every write includes user_id explicitly: RLS requires auth.uid() =
   user_id on insert, and we're always using the user's own session
   (never the service-role key) from this client-side code.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.SupabaseData = (function () {
  /* ---------------- Row → client-shape mapping ---------------- */

  function habitFromRow(row, allCompletions) {
    const completionHistory = allCompletions
      .filter((c) => c.habit_id === row.id)
      .map((c) => c.completed_on);
    return {
      id: row.id,
      title: row.title,
      description: row.description || "",
      icon: row.icon,
      xp: row.xp,
      frequency: row.frequency,
      targetDays: row.target_days || [],
      time: row.time || null,
      createdAt: row.created_at ? row.created_at.slice(0, 10) : null,
      completionHistory,
      currentStreak: 0, // recomputed right after load via REBUILT.Streak, same as local mode
      longestStreak: 0,
    };
  }

  function taskFromRow(row) {
    return {
      id: row.id,
      title: row.title,
      description: row.description || "",
      priority: row.priority,
      date: row.date,
      time: row.time || null,
      xp: row.xp,
      completed: row.completed,
      completedAt: row.completed_at || null,
      createdAt: row.created_at ? row.created_at.slice(0, 10) : null,
    };
  }

  function scheduleItemFromRow(row) {
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time || null,
      notes: row.notes || "",
      completed: row.completed,
    };
  }

  /* ---------------- Strict mode helpers ---------------- */

  const SC = () => REBUILT.SupabaseClient;
  /** STRICT MODE (see supabaseClient.js → mustUseBackend): failures are thrown as BackendError instead of being handed back / swallowed. */
  const strictOn = () => !!(SC() && SC().mustUseBackend && SC().mustUseBackend());

  /**
   * One write. Off strict mode the query is returned untouched (the caller gets `{ error }` back, as it always did).
   * In strict mode it becomes a promise that REJECTS with a BackendError (kind, table, code) when the server answered with an
   * error or the request itself threw. `okCodes` lists server codes that mean «it is already so» (a duplicate completion).
   */
  function write(table, op, build, okCodes) {
    if (!strictOn()) return build();
    return (async () => {
      let res;
      try {
        res = await build();
      } catch (err) {
        throw SC().toBackendError(err, { table, op });
      }
      const error = res && res.error;
      if (error) {
        if (okCodes && okCodes.indexOf(String(error.code)) !== -1) return res;
        throw SC().toBackendError(error, { table, op });
      }
      return res;
    })();
  }

  /* ---------------- Load: reassemble the full state from the DB ---------------- */

  // The Data API cuts every answer at a fixed number of rows (1000 by default), silently. Tables that grow are therefore read
  // page by page, and the pages are checked against the server's own total, so a long history can never load «partly».
  const PAGE = 1000;

  /**
   * Read every row a query matches. `build()` must return a fresh select with `{ count: "exact" }`, already filtered and ordered.
   * Resolves { data, error } like a single query would: on a failure data is null; on a short read (fewer rows than the total
   * the server reported) the rows read so far come back together with an `incomplete` error.
   */
  async function fetchAll(build) {
    let from = 0;
    let total = null;
    let rows = [];
    for (;;) {
      const res = await build().range(from, from + PAGE - 1);
      if (res.error) return { data: null, error: res.error };
      const got = res.data || [];
      if (total === null && typeof res.count === "number") total = res.count;
      rows = rows.concat(got);
      from += got.length;
      if (got.length === 0) break; // nothing more is coming
      if (total === null ? got.length < PAGE : rows.length >= total) break;
    }
    if (total !== null && rows.length < total) {
      return { data: rows, error: { code: "INCOMPLETE", message: "read " + rows.length + " of " + total + " rows", incomplete: true } };
    }
    return { data: rows, error: null };
  }

  async function loadFullState(sb, userId) {
    const strict = strictOn();
    // In strict mode a query that THROWS is just another failed query: all failures are collected and reported together.
    const guard = (p) => (strict ? Promise.resolve(p).then((r) => r, (e) => ({ data: null, error: e || { message: "request failed" } })) : p);
    // Paging needs a total order, or two pages could repeat / skip a row: every list is ordered by its key (conversations by time, then id).
    const list = (table, columns, orderBy) =>
      guard(fetchAll(() => orderBy.reduce((q, col) => q.order(col, { ascending: true }), sb.from(table).select(columns, { count: "exact" }).eq("user_id", userId))));

    const [
      profileRes,
      userProfileRes,
      aiProfileRes,
      habitsRes,
      completionsRes,
      tasksRes,
      scheduleRes,
      historyRes,
      achievementsRes,
      xpRes,
      convRes,
    ] = await Promise.all([
      guard(sb.from("profiles").select("*").eq("id", userId).maybeSingle()),
      guard(sb.from("user_profiles").select("*").eq("user_id", userId).maybeSingle()),
      guard(sb.from("ai_profiles").select("*").eq("user_id", userId).maybeSingle()),
      list("habits", "*", ["id"]),
      list("habit_completions", "habit_id, completed_on", ["id"]),
      list("tasks", "*", ["id"]),
      list("schedule_items", "*", ["id"]),
      list("daily_history", "*", ["date"]),
      list("unlocked_achievements", "*", ["achievement_id"]),
      guard(sb.from("user_xp_totals").select("total_xp").eq("user_id", userId).maybeSingle()),
      list("ai_conversations", "role, content, created_at", ["created_at", "id"]),
    ]);

    if (strict) {
      // Every source is checked. A failure is an error naming the table(s) — never an empty list, and nothing is built from half an answer.
      const named = [["profiles", profileRes], ["user_profiles", userProfileRes], ["ai_profiles", aiProfileRes], ["habits", habitsRes], ["habit_completions", completionsRes],
        ["tasks", tasksRes], ["schedule_items", scheduleRes], ["daily_history", historyRes], ["unlocked_achievements", achievementsRes], ["user_xp_totals", xpRes], ["ai_conversations", convRes]];
      const failed = named.filter((n) => n[1] && n[1].error);
      if (failed.length) {
        const kinds = failed.map((n) => (n[1].error && n[1].error.incomplete ? "incomplete" : SC().classify(n[1].error).kind));
        const kind = ["session", "network", "permission", "missing_table", "server", "incomplete"].find((k) => kinds.indexOf(k) !== -1) || kinds[0];
        const first = failed[0][1].error;
        throw new (SC().BackendError)(kind, (first && first.message) || "load failed", { tables: failed.map((n) => n[0]), table: failed[0][0], code: first && first.code ? String(first.code) : "", status: (first && first.status) || 0, op: "load" });
      }
      if (!profileRes.data) throw new (SC().BackendError)("profile_missing", "no profiles row for this account", { table: "profiles", op: "load" });
    }

    // The signup trigger always creates this row; if it's missing something
    // is badly wrong server-side — fall back to local rather than build a
    // broken state from nothing.
    if (profileRes.error || !profileRes.data) {
      console.warn("REBUILT: could not load profile from Supabase", profileRes.error);
      return null;
    }

    const profile = profileRes.data;
    const userProfileRow = userProfileRes.data || {};
    const aiProfileRow = aiProfileRes.data || {};
    const completions = completionsRes.data || [];

    const state = REBUILT.Data.buildEmptyState();

    state.user.id = userId;
    state.user.name = profile.name || "";
    state.user.email = profile.email || "";
    state.user.avatar = ""; // avatars are rendered from the name's initial (see Brand.avatar)
    state.user.createdAt = profile.created_at ? profile.created_at.slice(0, 10) : state.user.createdAt;

    state.meta.isDemo = false;
    state.meta.hasLocalAccount = true;
    state.meta.isOnboarded = !!profile.is_onboarded;

    if (profile.settings && typeof profile.settings === "object") {
      state.settings = Object.assign({}, state.settings, profile.settings);
    }

    state.userProfile = {
      occupation: userProfileRow.occupation || "",
      occupationCustom: userProfileRow.occupation_custom || "",
      lifeDescription: userProfileRow.life_description || "",
      skills: userProfileRow.skills || [],
      hobbies: userProfileRow.hobbies || [],
      goals: [], // filled from the rich goal list below
      challenges: userProfileRow.challenges || "",
    };
    // user_profiles.goals holds rich goal entries (and plain titles from older versions) — see goals.js.
    state.goals = REBUILT.Goals.decodeAll(userProfileRow.goals || []);
    state.userProfile.goals = REBUILT.Goals.titlesFor(state.goals);

    state.aiProfile = {
      userType: aiProfileRow.user_type || null,
      communicationStyle: aiProfileRow.communication_style || null,
      motivationStyle: aiProfileRow.motivation_style || null,
      preferredResponseLength: aiProfileRow.preferred_response_length || "medium",
      productivityStyle: aiProfileRow.productivity_style || null,
      disciplineLevel: aiProfileRow.discipline_level || null,
      planningPreference: aiProfileRow.planning_preference || null,
      commonPatterns: aiProfileRow.common_patterns || [],
      knownChallenges: aiProfileRow.known_challenges || [],
    };

    state.habits = (habitsRes.data || []).map((row) => habitFromRow(row, completions));
    state.tasks = (tasksRes.data || []).map(taskFromRow);
    state.scheduleItems = (scheduleRes.data || []).map(scheduleItemFromRow);

    state.history = {};
    (historyRes.data || []).forEach((row) => {
      state.history[row.date] = {
        habitsCompleted: row.habits_completed,
        totalHabits: row.total_habits,
        tasksCompleted: row.tasks_completed,
        xpEarned: row.xp_earned,
        allHabitsCompleted: row.all_habits_completed,
      };
    });

    const unlockedAt = {};
    (achievementsRes.data || []).forEach((row) => {
      unlockedAt[row.achievement_id] = row.unlocked_at;
    });
    state.achievements = REBUILT.Data.ACHIEVEMENTS.map((def) => ({
      id: def.id,
      unlocked: Object.prototype.hasOwnProperty.call(unlockedAt, def.id),
      unlockedAt: unlockedAt[def.id] || null,
    }));

    state.xp.total = xpRes.data && typeof xpRes.data.total_xp === "number" ? xpRes.data.total_xp : 0;

    state.aiConversation = (convRes.data || []).map((m) => ({
      role: m.role,
      text: m.content,
      at: m.created_at,
    }));

    // Streaks are always derived, never stored/trusted — recompute fresh
    // from what was just loaded, exactly like local mode does on every change.
    state.habits.forEach((h) => REBUILT.Streak.computeHabitStreak(h));
    REBUILT.Streak.recomputeStreak(state);

    return state;
  }

  /* ---------------- Habits ---------------- */

  function insertHabit(sb, userId, habit) {
    return write("habits", "insert", () => sb.from("habits").insert({
      id: habit.id,
      user_id: userId,
      title: habit.title,
      description: habit.description || "",
      icon: habit.icon,
      xp: habit.xp,
      frequency: habit.frequency,
      target_days: habit.targetDays || [],
      time: habit.time || null,
      created_at: habit.createdAt ? habit.createdAt + "T00:00:00" : undefined,
    }));
  }

  function updateHabit(sb, id, fields) {
    const row = {};
    if ("title" in fields) row.title = fields.title;
    if ("description" in fields) row.description = fields.description || "";
    if ("icon" in fields) row.icon = fields.icon;
    if ("xp" in fields) row.xp = fields.xp;
    if ("frequency" in fields) row.frequency = fields.frequency;
    if ("targetDays" in fields) row.target_days = fields.targetDays || [];
    if ("time" in fields) row.time = fields.time || null;
    return write("habits", "update", () => sb.from("habits").update(row).eq("id", id));
  }

  function deleteHabit(sb, id) {
    return write("habits", "delete", () => sb.from("habits").delete().eq("id", id));
  }

  function insertHabitCompletion(sb, userId, habitId, date, xpAwarded) {
    // 23505 = this habit is already completed on that day (unique habit_id + completed_on): the completion exists, so it counts as saved.
    return write("habit_completions", "insert", () => sb.from("habit_completions").insert({
      user_id: userId,
      habit_id: habitId,
      completed_on: date,
      xp_awarded: xpAwarded,
    }), ["23505"]);
  }

  function deleteHabitCompletion(sb, habitId, date) {
    return write("habit_completions", "delete", () => sb.from("habit_completions").delete().eq("habit_id", habitId).eq("completed_on", date));
  }

  /* ---------------- Tasks ---------------- */

  function insertTask(sb, userId, task) {
    return write("tasks", "insert", () => sb.from("tasks").insert({
      id: task.id,
      user_id: userId,
      title: task.title,
      description: task.description || "",
      priority: task.priority,
      date: task.date || null,
      time: task.time || null,
      xp: task.xp,
      completed: false,
      completed_at: null,
      xp_awarded: 0,
      created_at: task.createdAt ? task.createdAt + "T00:00:00" : undefined,
    }));
  }

  function updateTask(sb, id, fields) {
    const row = {};
    if ("title" in fields) row.title = fields.title;
    if ("description" in fields) row.description = fields.description || "";
    if ("priority" in fields) row.priority = fields.priority;
    if ("date" in fields) row.date = fields.date || null;
    if ("time" in fields) row.time = fields.time || null;
    if ("xp" in fields) row.xp = fields.xp;
    return write("tasks", "update", () => sb.from("tasks").update(row).eq("id", id));
  }

  function deleteTask(sb, id) {
    return write("tasks", "delete", () => sb.from("tasks").delete().eq("id", id));
  }

  function setTaskCompletion(sb, id, completed, completedAt, xpAwarded) {
    return write("tasks", "update", () => sb.from("tasks").update({ completed, completed_at: completedAt, xp_awarded: xpAwarded }).eq("id", id));
  }

  /* ---------------- Schedule items ---------------- */

  function insertScheduleItem(sb, userId, item) {
    return write("schedule_items", "insert", () => sb.from("schedule_items").insert({
      id: item.id,
      user_id: userId,
      title: item.title,
      type: item.type || "event",
      date: item.date,
      start_time: item.startTime,
      end_time: item.endTime || null,
      notes: item.notes || "",
      completed: false,
    }));
  }

  function updateScheduleItem(sb, id, fields) {
    const row = {};
    if ("title" in fields) row.title = fields.title;
    if ("type" in fields) row.type = fields.type;
    if ("date" in fields) row.date = fields.date;
    if ("startTime" in fields) row.start_time = fields.startTime;
    if ("endTime" in fields) row.end_time = fields.endTime || null;
    if ("notes" in fields) row.notes = fields.notes || "";
    return write("schedule_items", "update", () => sb.from("schedule_items").update(row).eq("id", id));
  }

  function deleteScheduleItem(sb, id) {
    return write("schedule_items", "delete", () => sb.from("schedule_items").delete().eq("id", id));
  }

  function setScheduleItemCompletion(sb, id, completed) {
    return write("schedule_items", "update", () => sb.from("schedule_items").update({ completed }).eq("id", id));
  }

  /* ---------------- Daily history / achievements ---------------- */

  function upsertDailyHistory(sb, userId, date, entry) {
    return write("daily_history", "upsert", () => sb.from("daily_history").upsert(
      {
        user_id: userId,
        date,
        habits_completed: entry.habitsCompleted || 0,
        total_habits: entry.totalHabits || 0,
        tasks_completed: entry.tasksCompleted || 0,
        xp_earned: entry.xpEarned || 0,
        all_habits_completed: !!entry.allHabitsCompleted,
      },
      { onConflict: "user_id,date" }
    ));
  }

  function insertUnlockedAchievement(sb, userId, achievementId, unlockedAt, xpAwarded) {
    return write("unlocked_achievements", "upsert", () => sb.from("unlocked_achievements").upsert(
      {
        user_id: userId,
        achievement_id: achievementId,
        unlocked_at: unlockedAt,
        xp_awarded: xpAwarded || 0,
      },
      { onConflict: "user_id,achievement_id", ignoreDuplicates: true }
    ));
  }

  /* ---------------- Profile / settings / onboarding ---------------- */

  function updateProfile(sb, userId, fields) {
    const row = {};
    if ("name" in fields) row.name = fields.name;
    if ("avatar" in fields) row.avatar = fields.avatar;
    if ("settings" in fields) row.settings = fields.settings;
    if ("isOnboarded" in fields) row.is_onboarded = fields.isOnboarded;
    return write("profiles", "update", () => sb.from("profiles").update(row).eq("id", userId));
  }

  function updateUserProfile(sb, userId, fields) {
    const row = {};
    if ("occupation" in fields) row.occupation = fields.occupation || "";
    if ("occupationCustom" in fields) row.occupation_custom = fields.occupationCustom || "";
    if ("lifeDescription" in fields) row.life_description = fields.lifeDescription || "";
    if ("skills" in fields) row.skills = fields.skills || [];
    if ("hobbies" in fields) row.hobbies = fields.hobbies || [];
    if ("goals" in fields) row.goals = fields.goals || [];
    if ("challenges" in fields) row.challenges = fields.challenges || "";
    return write("user_profiles", "update", () => sb.from("user_profiles").update(row).eq("user_id", userId));
  }

  function updateAiProfile(sb, userId, fields) {
    const row = {};
    if ("knownChallenges" in fields) row.known_challenges = fields.knownChallenges || [];
    if ("preferredResponseLength" in fields) row.preferred_response_length = fields.preferredResponseLength;
    return write("ai_profiles", "update", () => sb.from("ai_profiles").update(row).eq("user_id", userId));
  }

  return {
    loadFullState,
    insertHabit,
    updateHabit,
    deleteHabit,
    insertHabitCompletion,
    deleteHabitCompletion,
    insertTask,
    updateTask,
    deleteTask,
    setTaskCompletion,
    insertScheduleItem,
    updateScheduleItem,
    deleteScheduleItem,
    setScheduleItemCompletion,
    upsertDailyHistory,
    insertUnlockedAchievement,
    updateProfile,
    updateUserProfile,
    updateAiProfile,
  };
})();
