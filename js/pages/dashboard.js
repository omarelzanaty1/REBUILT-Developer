/* ============================================================
   REBUILT — pages/dashboard.js
   Fully dynamic — every number here comes from real state. Brand
   new / emptied-out users get a "getting started" view instead of
   dead zeros.
   ============================================================ */

window.REBUILT = window.REBUILT || {};
REBUILT.Pages = REBUILT.Pages || {};

REBUILT.Pages.dashboard = (function () {
  const { Messages, XP, Streak, Charts, Components, Data, Helpers, Icons: I } = REBUILT;
  const esc = Components.esc;
  const fmt = (n) => REBUILT.I18n.number(n);

  /* The voice picks a random variant each call; re-rendering after every tap would make the
     copy flicker. Keep a line until the situation it describes actually changes. */
  const memo = {};
  function stable(key, signature, make) {
    signature = REBUILT.I18n.lang() + "|" + signature; // a line written in one language is never shown in another
    if (!memo[key] || memo[key].sig !== signature) memo[key] = { sig: signature, text: make() };
    return memo[key].text;
  }
  const pctTier = (p) => (p <= 0 ? 0 : p >= 100 ? 100 : p >= 50 ? 50 : 1);

  function dateLine() {
    return REBUILT.I18n.date(new Date(), { weekday: "long", day: "numeric", month: "long" });
  }

  /** Greeting + level ring. `sub` is the line under the greeting; `extra` goes below it. */
  function hero(state, levelInfo, sub, extra) {
    return `
      <section class="hero card card--brand">
        <div class="hero__main">
          <div class="eyebrow">${dateLine()}</div>
          <h1 class="hero__greeting">${stable("greeting", Data.todayISO(0) + "|" + Math.floor(new Date().getHours() / 6) + "|" + (state.user.name || ""), () => Messages.greeting(state))}</h1>
          <p class="hero__sub">${sub}</p>
          ${extra || ""}
        </div>
        <div class="hero__level" aria-label="${REBUILT.t("dashboard.level", { level: levelInfo.level })}">
          <div class="level-ring">
            ${Charts.radialProgress({ pct: levelInfo.progressPct, size: 132, strokeWidth: 11, ariaLabel: REBUILT.t("dashboard.level_progress") })}
            <div class="level-ring__center">
              <span class="level-ring__label">LEVEL</span>
              <span class="level-ring__value num">${levelInfo.level}</span>
            </div>
          </div>
          <div class="hero__xp num" dir="ltr">${fmt(levelInfo.currentLevelXP)} / ${fmt(levelInfo.neededForNextLevel)} XP</div>
        </div>
      </section>`;
  }

  function statTile(icon, label, value, hint) {
    return `
      <div class="stat">
        <span class="stat__icon">${I.svg(icon)}</span>
        <span class="stat__value">${value}</span>
        <span class="stat__label">${label}</span>
        ${hint ? `<span class="stat__hint">${hint}</span>` : ""}
      </div>`;
  }

  /** Last 7 days, oldest first. A day is "full" when every habit was done — the same rule the streak
      counts — so this strip can never disagree with the number above it. "Partial" = some activity. */
  function weekStrip(state) {
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(Data.todayISO(-i));
    return `
      <div class="week-strip" role="img" aria-label="${REBUILT.t("dashboard.last_7_days_completed_days")}">
        ${days
          .map((date, i) => {
            const e = state.history[date];
            const full = !!e && !!e.allHabitsCompleted;
            const partial = !full && !!e && ((e.habitsCompleted || 0) > 0 || (e.tasksCompleted || 0) > 0);
            const label = Data.WEEKDAY_LABELS[new Date(date + "T00:00:00").getDay()];
            return `<span class="week-strip__day ${full ? "is-active" : ""} ${partial ? "is-partial" : ""} ${i === 6 ? "is-today" : ""}"><i>${full ? I.svg("check", { size: 14, stroke: 3 }) : ""}</i><small>${label}</small></span>`;
          })
          .join("")}
      </div>
      <p class="week-legend">${REBUILT.t("dashboard.a_day_counts_toward_your")}</p>`;
  }

  function goalsCard(state) {
    const active = REBUILT.Goals.sorted(state.goals).filter((g) => g.status === "active");
    return `
      <section class="card">
        <div class="card__head">
          <div><h2 class="card__title">${REBUILT.t("dashboard.your_goals")}</h2></div>
          <button type="button" class="card__link" data-nav="goals">${REBUILT.t("dashboard.all_goals", { p1: I.svg("chevronLeft", { size: 14 }) })}</button>
        </div>
        ${active.length
          ? `<div class="goal-mini-list">${active.slice(0, 3).map(REBUILT.Components.goalMini).join("")}</div>`
          : Components.emptyState({ compact: true, icon: "target", text: REBUILT.t("dashboard.set_a_goal_and_break"), actions: [{ label: REBUILT.t("dashboard.new_goal"), action: "open-add-goal", icon: "plus" }] })}
      </section>`;
  }

  function render(state) {
    const levelInfo = XP.getLevelInfo(state.xp.total);
    if (Helpers.isFreshState(state)) return freshHTML(state, levelInfo);

    const today = Data.todayISO(0);
    const entry = Streak.getEntry(state, today);
    const progress = Helpers.calculateDailyProgress(state);
    const todayHabits = Helpers.getTodayHabits(state);
    const remaining = entry.totalHabits - entry.habitsCompleted;

    const todaysTasks = state.tasks
      .filter((t) => !t.completed || t.completedAt === today)
      .filter((t) => !t.date || t.date <= today || t.completed)
      .slice(0, 6);

    const scheduleToday = state.scheduleItems
      .filter((s) => s.date === today)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .slice(0, 4);

    const recentAchievements = REBUILT.Achievements.getEnriched(state).filter((a) => a.unlocked).slice(-3).reverse();
    const totalHabitsFinished = state.habits.reduce((sum, h) => sum + (h.completionHistory || []).length, 0);
    const totalTasksFinished = state.tasks.filter((t) => t.completed).length;

    const todayBar = `
      <div class="today-bar">
        <div class="today-bar__top">
          <span>${REBUILT.t("dashboard.today_s_progress")}</span>
          <span class="num">${progress.pct}%</span>
        </div>
        <div class="progress progress--lg" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.pct}" aria-label="${REBUILT.t("dashboard.today_s_progress")}">
          <span class="progress__fill" style="width:${progress.pct}%"></span>
        </div>
        <div class="today-bar__meta">
          <span>${I.svg("flame", { size: 14 })}<span class="num">${entry.habitsCompleted}/${entry.totalHabits}</span> ${REBUILT.t("dashboard.habits")}</span>
          <span>${I.svg("tasks", { size: 14 })}<span class="num">${entry.tasksCompleted}</span> ${REBUILT.t("dashboard.tasks")}</span>
          <span>${I.svg("bolt", { size: 14 })}<bdi class="num">+${entry.xpEarned} XP</bdi></span>
        </div>
      </div>`;

    return `
      ${hero(state, levelInfo, stable("progress", pctTier(progress.pct), () => Messages.progressGreeting(state, progress.pct)), todayBar)}

      <section class="stat-grid" aria-label="${REBUILT.t("dashboard.summary")}">
        ${statTile("bolt", REBUILT.t("dashboard.total_xp"), fmt(state.xp.total))}
        ${statTile("flame", REBUILT.t("dashboard.current_streak"), `${state.streak.current}<small> ${REBUILT.t("dashboard.days", { n: state.streak.current })}</small>`)}
        ${statTile("repeat", REBUILT.t("dashboard.habits_done"), fmt(totalHabitsFinished))}
        ${statTile("tasks", REBUILT.t("dashboard.tasks_completed"), fmt(totalTasksFinished))}
      </section>

      <div class="split">
        <div class="stack">
          <section class="card">
            <div class="card__head">
              <div>
                <h2 class="card__title">${REBUILT.t("dashboard.today_s_habits")}</h2>
                ${entry.totalHabits > 0 ? `<p class="card__sub">${remaining > 0 ? stable("few", remaining, () => Messages.fewHabitsLeft(state, remaining)) : stable("alldone", "done", () => Messages.allHabitsDone(state))}</p>` : ""}
              </div>
              <button type="button" class="card__link" data-nav="habits">${REBUILT.t("dashboard.all_habits", { p1: I.svg("chevronLeft", { size: 14 }) })}</button>
            </div>
            <div class="row-list">
              ${todayHabits.length
                ? todayHabits.map(Components.habitRow).join("")
                : Components.emptyState({ compact: true, icon: "flame", text: Messages.emptyHabits(), actions: [{ label: REBUILT.t("dashboard.add_habit"), action: "open-add-habit", icon: "plus" }] })}
            </div>
          </section>

          <section class="card">
            <div class="card__head">
              <h2 class="card__title">${REBUILT.t("dashboard.today_s_tasks")}</h2>
              <button type="button" class="card__link" data-nav="tasks">${REBUILT.t("dashboard.all_tasks", { p1: I.svg("chevronLeft", { size: 14 }) })}</button>
            </div>
            <div class="row-list">
              ${todaysTasks.length
                ? todaysTasks.map(Components.taskRow).join("")
                : Components.emptyState({ compact: true, icon: "tasks", text: Messages.emptyTasks(), actions: [{ label: REBUILT.t("dashboard.add_task"), action: "open-add-task", icon: "plus" }] })}
            </div>
          </section>
        </div>

        <aside class="stack">
          <section class="card card--streak">
            <div class="card__head"><h2 class="card__title">${REBUILT.t("dashboard.streak")}</h2></div>
            <div class="streak-display">
              <span class="streak-display__flame">${I.svg("flame", { size: 34 })}</span>
              <span class="streak-display__number num">${state.streak.current}</span>
              <span class="streak-display__unit">${REBUILT.t("dashboard.days", { n: state.streak.current })}</span>
            </div>
            ${weekStrip(state)}
            <p class="card__sub">${stable("streak", state.streak.current, () => Messages.streakSubtitle(state, state.streak.current))}</p>
            <p class="card__meta">${REBUILT.t("dashboard.longest_streak")} <span class="num">${state.streak.longest}</span> ${REBUILT.t("dashboard.days", { n: state.streak.longest })}</p>
          </section>

          ${goalsCard(state)}

          ${scheduleToday.length ? `
          <section class="card">
            <div class="card__head">
              <h2 class="card__title">${REBUILT.t("dashboard.your_day_plan")}</h2>
              <button type="button" class="card__link" data-nav="planner">${REBUILT.t("dashboard.my_full_day", { p1: I.svg("chevronLeft", { size: 14 }) })}</button>
            </div>
            <div class="row-list">${scheduleToday.map((s) => Components.scheduleRow(s, { editable: false })).join("")}</div>
          </section>` : ""}

          ${recentAchievements.length ? `
          <section class="card">
            <div class="card__head">
              <h2 class="card__title">${REBUILT.t("dashboard.your_latest_achievements")}</h2>
              <button type="button" class="card__link" data-nav="achievements">${REBUILT.t("dashboard.all", { p1: I.svg("chevronLeft", { size: 14 }) })}</button>
            </div>
            <div class="badge-grid badge-grid--compact">${recentAchievements.map(Components.achievementBadge).join("")}</div>
          </section>` : ""}
        </aside>
      </div>
    `;
  }

  function freshHTML(state, levelInfo) {
    const steps = [
      ["flame", REBUILT.t("dashboard.first_habit"), REBUILT.t("dashboard.a_small_thing_you_do"), "open-add-habit", REBUILT.t("dashboard.add_habit")],
      ["tasks", REBUILT.t("dashboard.first_task"), REBUILT.t("dashboard.work_that_needs_to_be"), "open-add-task", REBUILT.t("dashboard.add_task")],
      ["target", REBUILT.t("dashboard.first_goal"), REBUILT.t("dashboard.a_result_you_want_to"), "open-add-goal", REBUILT.t("dashboard.add_goal")],
      ["calendar", REBUILT.t("dashboard.your_day_plan_2"), REBUILT.t("dashboard.plan_your_time_hour_by"), "open-add-schedule-item", REBUILT.t("dashboard.start_planning")],
    ];
    return `
      ${hero(state, levelInfo, Messages.welcomeFresh().split("\n\n")[1] || "")}

      <section class="card">
        <div class="card__head">
          <div>
            <h2 class="card__title">${REBUILT.t("dashboard.let_s_get_started")}</h2>
            <p class="card__sub">${REBUILT.t("dashboard.pick_a_starting_point_you")}</p>
          </div>
        </div>
        <div class="start-grid">
          ${steps.map((s) => `
            <button type="button" class="start-tile" data-action="${s[3]}">
              <span class="start-tile__ico">${I.svg(s[0], { size: 24 })}</span>
              <span class="start-tile__text"><strong>${s[1]}</strong><small>${s[2]}</small></span>
              <span class="start-tile__cta">${s[4]} ${I.svg("arrowLeft", { size: 16 })}</span>
            </button>`).join("")}
        </div>
      </section>

      ${state.goals.some((g) => g.status === "active") ? goalsCard(state) : ""}
    `;
  }

  return { render };
})();
