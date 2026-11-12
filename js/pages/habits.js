/* ============================================================
   REBUILT — pages/habits.js
   ============================================================ */

window.REBUILT = window.REBUILT || {};
REBUILT.Pages = REBUILT.Pages || {};

REBUILT.Pages.habits = (function () {
  const { Messages, Components, Data, Helpers, Icons: I } = REBUILT;
  const esc = Components.esc;

  function header() {
    return Components.pageHeader({
      title: REBUILT.t("habits.habits"),
      sub: REBUILT.t("habits.small_things_you_do_every"),
      actions: `<button type="button" class="btn btn--primary" data-action="open-add-habit">${REBUILT.t("habits.new_habit", { p1: I.svg("plus") })}</button>`,
    });
  }

  function render(state) {
    const habits = state.habits;
    if (!habits.length) {
      return `
        ${header()}
        <section class="card">${Components.emptyState({
          icon: "flame",
          title: REBUILT.t("habits.start_your_first_habit"),
          text: Messages.emptyHabits(),
          actions: [{ label: REBUILT.t("habits.add_habit"), action: "open-add-habit", icon: "plus" }],
        })}</section>`;
    }

    const todayHabits = Helpers.getTodayHabits(state);
    const todayIds = new Set(todayHabits.map((h) => h.id));
    const otherHabits = habits.filter((h) => !todayIds.has(h.id));
    const today = Data.todayISO(0);
    const done = todayHabits.filter((h) => h.completionHistory.includes(today)).length;
    const pct = todayHabits.length ? Math.round((done / todayHabits.length) * 100) : 0;
    const bestStreak = habits.reduce((m, h) => Math.max(m, h.currentStreak || 0), 0);

    return `
      ${header()}

      <section class="card card--summary">
        <div class="summary-line">
          <div class="summary-line__main">
            <span class="summary-line__label">${REBUILT.t("habits.today")}</span>
            <span class="summary-line__value num">${done}<small>/${todayHabits.length}</small></span>
          </div>
          <div class="summary-line__bar">
            <div class="progress progress--lg" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${REBUILT.t("habits.today_s_habits")}">
              <span class="progress__fill" style="width:${pct}%"></span>
            </div>
          </div>
          <div class="summary-line__aside">${I.svg("flame", { size: 16 })}<span class="num">${bestStreak}</span><small>${REBUILT.t("habits.longest_current_streak")}</small></div>
        </div>
      </section>

      <section class="card">
        <div class="card__head"><h2 class="card__title">${REBUILT.t("habits.today_s_habits")}</h2></div>
        <div class="row-list">
          ${todayHabits.length
            ? todayHabits.map(Components.habitRow).join("")
            : Components.emptyState({ compact: true, icon: "calendar", text: REBUILT.t("habits.no_habits_scheduled_for_today") })}
        </div>
      </section>

      ${otherHabits.length ? `
      <section class="card">
        <div class="card__head">
          <div><h2 class="card__title">${REBUILT.t("habits.other_habits")}</h2><p class="card__sub">${REBUILT.t("habits.not_scheduled_today_but_still")}</p></div>
        </div>
        <div class="row-list">${otherHabits.map(Components.habitRow).join("")}</div>
      </section>` : ""}
    `;
  }

  /* ---------------- Add / Edit form ---------------- */

  const FREQS = [
    { id: "daily", get label() { return REBUILT.t("habits.every_day"); } },
    { id: "weekly", get label() { return REBUILT.t("habits.weekly"); } },
    { id: "custom", get label() { return REBUILT.t("habits.specific_days"); } },
  ];

  function openForm(state, habitId) {
    const editing = habitId ? state.habits.find((h) => h.id === habitId) : null;
    const selectedIcon = I.resolve(editing ? editing.icon : "flame", "flame");
    const targetDays = editing && editing.targetDays ? editing.targetDays.slice() : [];
    const freq = editing ? editing.frequency : "daily";

    const body = `
      <form class="form" id="habit-form" novalidate>
        ${Components.inputField({ name: "title", label: REBUILT.t("habits.habit_name"), value: editing ? editing.title : "", maxlength: 60, placeholder: REBUILT.t("habits.e_g_drink_water"), autofocus: !editing })}
        ${Components.inputField({ name: "description", label: REBUILT.t("habits.description"), value: editing ? editing.description || "" : "", optional: true, maxlength: 120 })}

        <div class="field">
          <span class="field__label" id="icon-label">${REBUILT.t("habits.icon")}</span>
          <div class="icon-picker" id="icon-picker" role="radiogroup" aria-labelledby="icon-label">
            ${I.HABIT_ICONS.map(([key, label]) => `<button type="button" role="radio" class="icon-picker__btn ${key === selectedIcon ? "is-selected" : ""}" aria-checked="${key === selectedIcon}" aria-label="${label}" title="${label}" data-icon="${key}">${I.svg(key)}</button>`).join("")}
          </div>
        </div>

        <div class="field-row">
          ${Components.inputField({ name: "xp", label: REBUILT.t("habits.xp_reward"), type: "number", value: editing ? editing.xp : 20, min: 5, max: 100, step: 5, inputmode: "numeric" })}
          ${Components.inputField({ name: "time", label: REBUILT.t("habits.preferred_time"), type: "time", value: editing && editing.time ? editing.time : "", optional: true })}
        </div>

        <div class="field">
          <span class="field__label" id="freq-label">${REBUILT.t("habits.repeat")}</span>
          ${Components.segmented("freq", FREQS, freq)}
          <div class="weekday-picker" id="weekday-picker" ${freq === "custom" ? "" : "hidden"}>
            ${Data.WEEKDAY_LABELS.map((label, idx) => `<button type="button" class="weekday-picker__btn ${targetDays.includes(idx) ? "is-selected" : ""}" aria-pressed="${targetDays.includes(idx)}" data-day="${idx}">${label}</button>`).join("")}
          </div>
          <span class="field__error" role="alert" data-field="days">${I.svg("alert", { size: 14 })}<span data-err-text></span></span>
        </div>

        <div class="modal__footer">
          <button type="submit" class="btn btn--primary">${editing ? REBUILT.t("habits.save_changes") : REBUILT.t("habits.add_habit_2")}</button>
          ${editing ? `<button type="button" class="btn btn--danger btn-spacer" data-action="delete-habit" data-id="${esc(editing.id)}">${REBUILT.t("habits.delete", { p1: I.svg("trash") })}</button>` : ""}
        </div>
      </form>`;

    REBUILT.Modal.open({
      title: editing ? REBUILT.t("habits.edit_habit") : REBUILT.t("habits.new_habit_2"),
      body,
      onMount: (modal) => {
        let icon = selectedIcon;
        let days = targetDays.slice();
        const form = modal.querySelector("#habit-form");
        Components.clearErrorsOnInput(modal);

        modal.querySelectorAll("#icon-picker .icon-picker__btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            icon = btn.dataset.icon;
            modal.querySelectorAll("#icon-picker .icon-picker__btn").forEach((b) => {
              const on = b === btn;
              b.classList.toggle("is-selected", on);
              b.setAttribute("aria-checked", String(on));
            });
          });
        });

        const picker = modal.querySelector("#weekday-picker");
        Components.bindSegmented(modal, "freq", (v) => { picker.hidden = v !== "custom"; });

        modal.querySelectorAll(".weekday-picker__btn").forEach((btn) => {
          btn.addEventListener("click", () => {
            const day = Number(btn.dataset.day);
            const on = !days.includes(day);
            days = on ? days.concat(day) : days.filter((d) => d !== day);
            btn.classList.toggle("is-selected", on);
            btn.setAttribute("aria-pressed", String(on));
            const f = modal.querySelector('[data-field="days"]');
            if (f) f.classList.remove("is-invalid");
          });
        });

        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const title = (fd.get("title") || "").toString().trim();
          const freqType = Components.segmentedValue(modal, "freq") || "daily";
          let ok = true;
          if (!title) { Components.setFieldError(modal, "title", REBUILT.t("habits.enter_a_name_for_the")); ok = false; }
          if (freqType === "custom" && days.length === 0) {
            const f = modal.querySelector('[data-field="days"]');
            f.classList.add("is-invalid");
            f.querySelector("[data-err-text]").textContent = REBUILT.t("habits.pick_at_least_one_day");
            ok = false;
          }
          if (!ok) return;
          const payload = {
            title,
            description: (fd.get("description") || "").toString().trim(),
            icon,
            xp: Math.min(100, Math.max(5, Number(fd.get("xp")) || 20)),
            time: fd.get("time") || null,
            frequency: freqType,
            targetDays: freqType === "custom" ? days.slice().sort() : [],
          };
          REBUILT.Modal.close();
          if (editing) REBUILT.Actions.updateHabit(editing.id, payload);
          else REBUILT.Actions.addHabit(payload);
        });
      },
    });
  }

  return { render, openForm };
})();
