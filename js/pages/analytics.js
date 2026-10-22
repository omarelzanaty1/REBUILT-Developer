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
  const fmt = (n) => Number(n).toLocaleString("en-US");
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
    return Components.pageHeader({ title: "الإحصائيات", sub: "أرقام حقيقية من نشاطك، مش تقديرات." });
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
            title: "لسه بنجمّع بياناتك",
            text: "محتاجين على الأقل 3 أيام نشاط علشان نطلعلك تحليل محترم.\nكمّل عاداتك ومهامك وارجع تاني.",
            actions: [
              { label: "العادات", nav: "habits", variant: "primary", icon: "flame" },
              { label: "المهام", nav: "tasks", variant: "secondary", icon: "tasks" },
            ],
          })}
          <div class="data-meter">
            <div class="data-meter__top"><span>الأيام المسجّلة</span><span class="num">${recorded}/${MIN_DAYS}</span></div>
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

      <section class="stat-grid" aria-label="ملخص">
        ${statTile("bolt", "XP الكلي", `<span class="num">${fmt(state.xp.total)}</span>`)}
        ${statTile("flame", "أطول سلسلة", `<span class="num">${state.streak.longest}</span><small> يوم</small>`)}
        ${statTile("tasks", "مهام مكتملة", `<span class="num">${fmt(tasksCompletedTotal)}</span>`)}
        ${statTile("calendar", "أنشط يوم", bestDayLabel)}
      </section>

      <div class="grid grid--2">
        <section class="card">
          <div class="card__head"><div><h2 class="card__title">إنجاز العادات</h2><p class="card__sub">آخر 7 أيام (نسبة من العادات المجدولة)</p></div></div>
          ${Charts.barChart(weeklyCompletion, { suffix: "%", showValues: true, ariaLabel: "نسبة إنجاز العادات آخر 7 أيام" })}
        </section>
        <section class="card">
          <div class="card__head"><div><h2 class="card__title">XP</h2><p class="card__sub">آخر 7 أيام</p></div><span class="badge badge--brand num" dir="ltr">${fmt(weekXP)} XP</span></div>
          ${Charts.barChart(weeklyXP, { showValues: true, ariaLabel: "الـXP المكتسب آخر 7 أيام" })}
        </section>
      </div>

      <div class="grid grid--2">
        <section class="card">
          <div class="card__head"><h2 class="card__title">نسبة الالتزام</h2></div>
          <div class="rate">
            <div class="rate__ring">
              ${Charts.radialProgress({ pct: overallRate, size: 144, strokeWidth: 12, ariaLabel: "نسبة الالتزام بالعادات" })}
              <div class="rate__center"><span class="num">${overallRate}<small>%</small></span></div>
            </div>
            <p class="rate__text">من <span class="num">${fmt(totalPossible)}</span> فرصة إنجاز مسجّلة، اتعمل منها <span class="num">${fmt(totalDone)}</span>.</p>
          </div>
        </section>

        <section class="card">
          <div class="card__head"><h2 class="card__title">أفضل عاداتك</h2></div>
          ${topHabits.length
            ? `<ol class="ranked">${topHabits.map((t, i) => `
                <li class="ranked__item">
                  <span class="ranked__rank num">${i + 1}</span>
                  <span class="ranked__icon">${I.svg(I.resolve(t.habit.icon, "flame"))}</span>
                  <span class="ranked__name">${esc(t.habit.title)}</span>
                  <span class="ranked__count"><span class="num">${t.count}</span> مرة</span>
                </li>`).join("")}</ol>`
            : Components.emptyState({ compact: true, icon: "flame", text: "لسه مفيش عادة اتكررت كفاية." })}
        </section>
      </div>

      <div class="grid grid--2">
        <section class="card">
          <div class="card__head"><h2 class="card__title">آخر 30 يوم</h2></div>
          <ul class="facts">
            <li><span>${I.svg("repeat")}عادات اتعملت</span><strong class="num">${fmt(monthCompleted)}</strong></li>
            <li><span>${I.svg("bolt")}XP اتكسب</span><strong class="num" dir="ltr">${fmt(monthXP)}</strong></li>
            <li><span>${I.svg("tasks")}مهام الأسبوع ده</span><strong class="num">${fmt(tasksCompletedWeek)}</strong></li>
          </ul>
        </section>
        <section class="card">
          <div class="card__head">
            <h2 class="card__title">الأهداف</h2>
            <button type="button" class="card__link" data-nav="goals">إدارة ${I.svg("chevronLeft", { size: 14 })}</button>
          </div>
          ${goalStats.total
            ? `<ul class="facts">
                <li><span>${I.svg("target")}شغّالة</span><strong class="num">${goalStats.active}</strong></li>
                <li><span>${I.svg("trophy")}اتحققت</span><strong class="num">${goalStats.done}</strong></li>
                <li><span>${I.svg("trend")}متوسط التقدّم</span><strong class="num">${goalStats.avgProgress}%</strong></li>
              </ul>`
            : Components.emptyState({ compact: true, icon: "target", text: "ضيف هدف علشان تتابع تقدّمه هنا.", actions: [{ label: "هدف جديد", action: "open-add-goal", icon: "plus" }] })}
        </section>
      </div>
    `;
  }

  return { render };
})();
