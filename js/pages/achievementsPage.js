/* ============================================================
   REBUILT — pages/achievementsPage.js
   ============================================================ */

window.REBUILT = window.REBUILT || {};
REBUILT.Pages = REBUILT.Pages || {};

REBUILT.Pages.achievements = (function () {
  const { Components, Icons: I } = REBUILT;

  function render(state) {
    const list = REBUILT.Achievements.getEnriched(state);
    const unlocked = list.filter((a) => a.unlocked);
    const pct = list.length ? Math.round((unlocked.length / list.length) * 100) : 0;

    return `
      ${Components.pageHeader({ title: REBUILT.t("achievements.achievements"), sub: REBUILT.t("achievements.every_achievement_you_unlock_is") })}

      <section class="card card--summary">
        <div class="summary-line">
          <div class="summary-line__main">
            <span class="summary-line__label">${REBUILT.t("achievements.unlocked")}</span>
            <span class="summary-line__value num">${unlocked.length}<small>/${list.length}</small></span>
          </div>
          <div class="summary-line__bar">
            <div class="progress progress--lg" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${REBUILT.t("achievements.unlocked_achievements")}">
              <span class="progress__fill" style="width:${pct}%"></span>
            </div>
          </div>
          <div class="summary-line__aside">${I.svg("trophy", { size: 16 })}<small>${unlocked.length ? REBUILT.t("achievements.keep_going_a_little_more") : Components.esc(REBUILT.t("achievements.your_first_achievement_is_close"))}</small></div>
        </div>
      </section>

      <section class="badge-grid">${list.map(Components.achievementBadge).join("")}</section>
    `;
  }

  return { render };
})();
