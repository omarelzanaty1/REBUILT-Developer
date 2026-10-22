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
      title: "العادات",
      sub: "حاجات صغيرة بتعملها كل يوم، وبتبني منها نفسك.",
      actions: `<button type="button" class="btn btn--primary" data-action="open-add-habit">${I.svg("plus")}عادة جديدة</button>`,
    });
  }

  function render(state) {
    const habits = state.habits;
    if (!habits.length) {
      return `
        ${header()}
        <section class="card">${Components.emptyState({
          icon: "flame",
          title: "ابدأ أول عادة",
          text: Messages.emptyHabits(),
          actions: [{ label: "إضافة عادة", action: "open-add-habit", icon: "plus" }],
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
            <span class="summary-line__label">النهارده</span>
            <span class="summary-line__value num">${done}<small>/${todayHabits.length}</small></span>
          </div>
          <div class="summary-line__bar">
            <div class="progress progress--lg" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="عادات النهارده">
              <span class="progress__fill" style="width:${pct}%"></span>
            </div>
          </div>
          <div class="summary-line__aside">${I.svg("flame", { size: 16 })}<span class="num">${bestStreak}</span><small>أطول سلسلة حالية</small></div>
        </div>
      </section>

      <section class="card">
        <div class="card__head"><h2 class="card__title">عادات النهارده</h2></div>
        <div class="row-list">
          ${todayHabits.length
            ? todayHabits.map(Components.habitRow).join("")
            : Components.emptyState({ compact: true, icon: "calendar", text: "مفيش عادات متفعّلة النهارده." })}
        </div>
      </section>

      ${otherHabits.length ? `
      <section class="card">
        <div class="card__head">
          <div><h2 class="card__title">عادات تانية</h2><p class="card__sub">مش مجدولة النهارده، بس لسه عاداتك.</p></div>
        </div>
        <div class="row-list">${otherHabits.map(Components.habitRow).join("")}</div>
      </section>` : ""}
    `;
  }

  /* ---------------- Add / Edit form ---------------- */

  const FREQS = [
    { id: "daily", label: "كل يوم" },
    { id: "weekly", label: "أسبوعيًا" },
    { id: "custom", label: "أيام محددة" },
  ];

  function openForm(state, habitId) {
    const editing = habitId ? state.habits.find((h) => h.id === habitId) : null;
    const selectedIcon = I.resolve(editing ? editing.icon : "flame", "flame");
    const targetDays = editing && editing.targetDays ? editing.targetDays.slice() : [];
    const freq = editing ? editing.frequency : "daily";

    const body = `
      <form class="form" id="habit-form" novalidate>
        ${Components.inputField({ name: "title", label: "اسم العادة", value: editing ? editing.title : "", maxlength: 60, placeholder: "مثلاً: شرب المياه", autofocus: !editing })}
        ${Components.inputField({ name: "description", label: "وصف", value: editing ? editing.description || "" : "", optional: true, maxlength: 120 })}

        <div class="field">
          <span class="field__label" id="icon-label">الأيقونة</span>
          <div class="icon-picker" id="icon-picker" role="radiogroup" aria-labelledby="icon-label">
            ${I.HABIT_ICONS.map(([key, label]) => `<button type="button" role="radio" class="icon-picker__btn ${key === selectedIcon ? "is-selected" : ""}" aria-checked="${key === selectedIcon}" aria-label="${label}" title="${label}" data-icon="${key}">${I.svg(key)}</button>`).join("")}
          </div>
        </div>

        <div class="field-row">
          ${Components.inputField({ name: "xp", label: "مكافأة XP", type: "number", value: editing ? editing.xp : 20, min: 5, max: 100, step: 5, inputmode: "numeric" })}
          ${Components.inputField({ name: "time", label: "وقت مفضّل", type: "time", value: editing && editing.time ? editing.time : "", optional: true })}
        </div>

        <div class="field">
          <span class="field__label" id="freq-label">التكرار</span>
          ${Components.segmented("freq", FREQS, freq)}
          <div class="weekday-picker" id="weekday-picker" ${freq === "custom" ? "" : "hidden"}>
            ${Data.WEEKDAY_LABELS.map((label, idx) => `<button type="button" class="weekday-picker__btn ${targetDays.includes(idx) ? "is-selected" : ""}" aria-pressed="${targetDays.includes(idx)}" data-day="${idx}">${label}</button>`).join("")}
          </div>
          <span class="field__error" role="alert" data-field="days">${I.svg("alert", { size: 14 })}<span data-err-text></span></span>
        </div>

        <div class="modal__footer">
          <button type="submit" class="btn btn--primary">${editing ? "حفظ التعديلات" : "إضافة العادة"}</button>
          ${editing ? `<button type="button" class="btn btn--danger btn-spacer" data-action="delete-habit" data-id="${esc(editing.id)}">${I.svg("trash")}حذف</button>` : ""}
        </div>
      </form>`;

    REBUILT.Modal.open({
      title: editing ? "تعديل العادة" : "عادة جديدة",
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
          if (!title) { Components.setFieldError(modal, "title", "اكتب اسم للعادة."); ok = false; }
          if (freqType === "custom" && days.length === 0) {
            const f = modal.querySelector('[data-field="days"]');
            f.classList.add("is-invalid");
            f.querySelector("[data-err-text]").textContent = "اختار يوم واحد على الأقل.";
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
