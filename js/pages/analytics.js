/* ============================================================
   REBUILT — pages/analytics.js
   Every figure is computed from real history. With fewer than
   three recorded days there isn't enough to say anything honest,
   so the page says that instead of drawing empty charts.
   ============================================================ */

window.REBUILT = window.REBUILT || {};
REBUILT.Pages = REBUILT.Pages || {};

REBUILT.Pages.analytics = (function () {
  const { Charts, Data, Components, Icons: I } = REBUILT;
  const esc = Components.esc;
  const fmt = (n) => REBUILT.I18n.number(n);
  const MIN_DAYS = 3;

  function lastNDays(n) {
    const days = [];
    for (let i = n - 1; i >= 0; i--) days.push(Data.todayISO(-i));
    return days;
  }

  function entryOf(state, date) {
    return state.history[date] || { habitsCompleted: 0, totalHabits: 0, tasksCompleted: 0, xpEarned: 0 };
  }

  const weekday = (date) => Data.WEEKDAY_LABELS[new Date(date + "T00:00:00").getDay()];

  function header() {
    return Components.pageHeader({ title: REBUILT.t("analytics.analytics"), sub: REBUILT.t("analytics.real_numbers_from_your_activity") });
  }

  function statTile(icon, label, value) {
    return `<div class="stat"><span class="stat__icon">${I.svg(icon)}</span><span class="stat__value">${value}</span><span class="stat__label">${label}</span></div>`;
  }

  function render(state) {
    const recorded = Object.keys(state.history).length;
    if (!REBUILT.Helpers.hasEnoughHistoryForAnalytics(state)) {
      return `
        ${header()}
        <section class="card">
          ${Components.emptyState({
            icon: "chart",
            title: REBUILT.t("analytics.we_re_still_collecting_your"),
            text: REBUILT.t("analytics.we_need_at_least_3"),
            actions: [
              { label: REBUILT.t("analytics.habits"), nav: "habits", variant: "primary", icon: "flame" },
              { label: REBUILT.t("analytics.tasks"), nav: "tasks", variant: "secondary", icon: "tasks" },
            ],
          })}
          <div class="data-meter">
            <div class="data-meter__top"><span>${REBUILT.t("analytics.days_logged")}</span><span class="num">${recorded}/${MIN_DAYS}</span></div>
            <div class="progress"><span class="progress__fill" style="width:${Math.min(100, Math.round((recorded / MIN_DAYS) * 100))}%"></span></div>
          </div>
        </section>`;
    }

    const week = lastNDays(7);
    const month = lastNDays(30);

    const weeklyCompletion = week.map((date, i) => {
      const e = entryOf(state, date);
      const pct = e.totalHabits > 0 ? Math.round((e.habitsCompleted / e.totalHabits) * 100) : 0;
      return { label: weekday(date), value: pct, highlight: i === 6 };
    });
    const weeklyXP = week.map((date, i) => ({ label: weekday(date), value: entryOf(state, date).xpEarned, highlight: i === 6 }));

    let totalPossible = 0;
    let totalDone = 0;
    Object.values(state.history).forEach((e) => {
      totalPossible += e.totalHabits || 0;
      totalDone += e.habitsCompleted || 0;
    });
    const overallRate = totalPossible > 0 ? Math.round((totalDone / totalPossible) * 100) : 0;

    const monthCompleted = month.reduce((sum, d) => sum + entryOf(state, d).habitsCompleted, 0);
    const monthXP = month.reduce((sum, d) => sum + entryOf(state, d).xpEarned, 0);
    const weekXP = week.reduce((sum, d) => sum + entryOf(state, d).xpEarned, 0);
    const tasksCompletedTotal = state.tasks.filter((t) => t.completed).length;
    const tasksCompletedWeek = state.tasks.filter((t) => t.completed && week.includes(t.completedAt)).length;

    const topHabits = state.habits
      .map((h) => ({ habit: h, count: (h.completionHistory || []).length }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    const xpByWeekday = [0, 0, 0, 0, 0, 0, 0];
    Object.keys(state.history).forEach((date) => {
      xpByWeekday[new Date(date + "T00:00:00").getDay()] += state.history[date].xpEarned || 0;
    });
    const maxDayXP = Math.max(...xpByWeekday);
    const bestDayLabel = maxDayXP > 0 ? Data.WEEKDAY_LABELS[xpByWeekday.indexOf(maxDayXP)] : "—";

    const goalStats = REBUILT.Goals.stats(state.goals || []);

    return `
      ${header()}

      <section class="stat-grid" aria-label="${REBUILT.t("analytics.summary")}">
        ${statTile("bolt", REBUILT.t("analytics.total_xp"), `<span class="num">${fmt(state.xp.total)}</span>`)}
        ${statTile("flame", REBUILT.t("analytics.longest_streak"), `<span class="num">${state.streak.longest}</span><small> ${REBUILT.t("analytics.days", { n: state.streak.longest })}</small>`)}
        ${statTile("tasks", REBUILT.t("analytics.tasks_completed"), `<span class="num">${fmt(tasksCompletedTotal)}</span>`)}
        ${statTile("calendar", REBUILT.t("analytics.most_active_day"), bestDayLabel)}
      </section>

      <div class="grid grid--2">
        <section class="card">
          <div class="card__head"><div><h2 class="card__title">${REBUILT.t("analytics.habit_completion")}</h2><p class="card__sub">${REBUILT.t("analytics.last_7_days_percentage_of")}</p></div></div>
          ${Charts.barChart(weeklyCompletion, { suffix: "%", showValues: true, ariaLabel: REBUILT.t("analytics.habit_completion_rate_last_7") })}
        </section>
        <section class="card">
          <div class="card__head"><div><h2 class="card__title">XP</h2><p class="card__sub">${REBUILT.t("analytics.last_7_days")}</p></div><span class="badge badge--brand num" dir="ltr">${fmt(weekXP)} XP</span></div>
          ${Charts.barChart(weeklyXP, { showValues: true, ariaLabel: REBUILT.t("analytics.xp_earned_last_7_days") })}
        </section>
      </div>

      <div class="grid grid--2">
        <section class="card">
          <div class="card__head"><h2 class="card__title">${REBUILT.t("analytics.consistency_rate")}</h2></div>
          <div class="rate">
            <div class="rate__ring">
              ${Charts.radialProgress({ pct: overallRate, size: 144, strokeWidth: 12, ariaLabel: REBUILT.t("analytics.habit_consistency_rate") })}
              <div class="rate__center"><span class="num">${overallRate}<small>%</small></span></div>
            </div>
            <p class="rate__text">${REBUILT.t("analytics.out_of")} <span class="num">${fmt(totalPossible)}</span> ${REBUILT.t("analytics.recorded_opportunities_you_completed")} <span class="num">${fmt(totalDone)}</span>.</p>
          </div>
        </section>

        <section class="card">
          <div class="card__head"><h2 class="card__title">${REBUILT.t("analytics.your_best_habits")}</h2></div>
          ${topHabits.length
            ? `<ol class="ranked">${topHabits.map((t, i) => `
                <li class="ranked__item">
                  <span class="ranked__rank num">${i + 1}</span>
                  <span class="ranked__icon">${I.svg(I.resolve(t.habit.icon, "flame"))}</span>
                  <span class="ranked__name">${esc(t.habit.title)}</span>
                  <span class="ranked__count"><span class="num">${t.count}</span> ${REBUILT.t("analytics.times", { n: t.count })}</span>
                </li>`).join("")}</ol>`
            : Components.emptyState({ compact: true, icon: "flame", text: REBUILT.t("analytics.no_habit_has_repeated_enough") })}
        </section>
      </div>

      <div class="grid grid--2">
        <section class="card">
          <div class="card__head"><h2 class="card__title">${REBUILT.t("analytics.last_30_days")}</h2></div>
          <ul class="facts">
            <li><span>${REBUILT.t("analytics.habits_done", { p1: I.svg("repeat") })}</span><strong class="num">${fmt(monthCompleted)}</strong></li>
            <li><span>${REBUILT.t("analytics.xp_earned", { p1: I.svg("bolt") })}</span><strong class="num" dir="ltr">${fmt(monthXP)}</strong></li>
            <li><span>${REBUILT.t("analytics.tasks_this_week", { p1: I.svg("tasks") })}</span><strong class="num">${fmt(tasksCompletedWeek)}</strong></li>
          </ul>
        </section>
        <section class="card">
          <div class="card__head">
            <h2 class="card__title">${REBUILT.t("analytics.goals")}</h2>
            <button type="button" class="card__link" data-nav="goals">${REBUILT.t("analytics.manage", { p1: I.svg("chevronLeft", { size: 14 }) })}</button>
          </div>
          ${goalStats.total
            ? `<ul class="facts">
                <li><span>${REBUILT.t("analytics.active", { p1: I.svg("target") })}</span><strong class="num">${goalStats.active}</strong></li>
                <li><span>${REBUILT.t("analytics.achieved", { p1: I.svg("trophy") })}</span><strong class="num">${goalStats.done}</strong></li>
                <li><span>${REBUILT.t("analytics.average_progress", { p1: I.svg("trend") })}</span><strong class="num">${goalStats.avgProgress}%</strong></li>
              </ul>`
            : Components.emptyState({ compact: true, icon: "target", text: REBUILT.t("analytics.add_a_goal_to_track"), actions: [{ label: REBUILT.t("analytics.new_goal"), action: "open-add-goal", icon: "plus" }] })}
        </section>
      </div>
    `;
  }

  return { render };
})();
