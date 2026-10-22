/* ============================================================
   REBUILT — pages/planner.js
   "يومي" — a timeline view of one day. Native scheduleItems are
   fully editable here; tasks/habits with a time are shown too, so
   Planner stays a second lens on the same data, never a parallel
   list — completing them here just calls the same toggleTask /
   toggleHabit actions.
   ============================================================ */

window.REBUILT = window.REBUILT || {};
REBUILT.Pages = REBUILT.Pages || {};

REBUILT.Pages.planner = (function () {
  const { Data, Components, Icons: I } = REBUILT;
  const esc = Components.esc;
  let selectedDate = Data.todayISO(0);

  const TYPES = [
    { id: "event", label: "حدث" },
    { id: "break", label: "راحة" },
    { id: "task", label: "مهمة" },
    { id: "habit", label: "عادة" },
  ];

  /** Date arithmetic on LOCAL calendar days (toISOString() would shift the day by the UTC offset). */
  function shift(dateStr, offset) {
    const d = new Date(dateStr + "T00:00:00");
    d.setDate(d.getDate() + offset);
    return Data.formatLocalDate(d);
  }

  function weekAround(dateStr) {
    // Sunday-start week containing the selected date, matching WEEKDAY_LABELS.
    const d = new Date(dateStr + "T00:00:00");
    const start = shift(dateStr, -d.getDay());
    return Array.from({ length: 7 }, (_, i) => shift(start, i));
  }

  function render(state) {
    const items = buildTimeline(state, selectedDate);
    const today = Data.todayISO(0);
    const isToday = selectedDate === today;
    const dateObj = new Date(selectedDate + "T00:00:00");
    const dayLabel = dateObj.toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long" });

    const days = weekAround(selectedDate).map((d) => {
      const obj = new Date(d + "T00:00:00");
      const count = countFor(state, d);
      return `
        <button type="button" class="day-chip ${d === selectedDate ? "is-selected" : ""} ${d === today ? "is-today" : ""}" data-day="${d}" aria-pressed="${d === selectedDate}" aria-label="${obj.toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long" })}">
          <small>${Data.WEEKDAY_LABELS[obj.getDay()]}</small>
          <strong class="num">${obj.getDate()}</strong>
          <i class="${count ? "has-items" : ""}" aria-hidden="true"></i>
        </button>`;
    }).join("");

    return `
      ${Components.pageHeader({
        title: "يومي",
        sub: "خطّة يومك ساعة بساعة.",
        actions: `<button type="button" class="btn btn--primary" data-action="open-add-schedule-item">${I.svg("plus")}إضافة لليوم</button>`,
      })}

      <section class="daybar card card--tight">
        <div class="daybar__top">
          <button type="button" class="icon-btn" id="planner-prev" aria-label="الأسبوع السابق">${I.svg("chevronRight")}</button>
          <div class="daybar__label">
            <strong>${dayLabel}</strong>
            ${!isToday ? `<button type="button" class="btn-link" id="planner-today">رجوع لليوم</button>` : `<span class="badge badge--brand">النهارده</span>`}
          </div>
          <button type="button" class="icon-btn" id="planner-next" aria-label="الأسبوع التالي">${I.svg("chevronLeft")}</button>
        </div>
        <div class="daybar__days" role="group" aria-label="أيام الأسبوع">${days}</div>
      </section>

      <section class="card">
        ${items.length
          ? `<ol class="timeline">${items.map(timelineRow).join("")}</ol>`
          : Components.emptyState({
              icon: "calendar",
              title: "اليوم فاضي",
              text: "لسه مفيش حاجة متخططة لليوم ده.\nضيف عنصر أو حدّد وقت لمهمة أو عادة.",
              actions: [{ label: "إضافة لليوم", action: "open-add-schedule-item", icon: "plus" }],
            })}
      </section>
    `;
  }

  function countFor(state, date) {
    const dateObj = new Date(date + "T00:00:00");
    return (
      state.scheduleItems.filter((s) => s.date === date).length +
      state.tasks.filter((t) => t.date === date && t.time).length +
      state.habits.filter((h) => h.time && Data.isHabitActiveOn(h, dateObj)).length
    );
  }

  function buildTimeline(state, date) {
    const items = [];
    state.scheduleItems.filter((s) => s.date === date).forEach((s) => items.push({ kind: "schedule", time: s.startTime, data: s }));
    state.tasks.filter((t) => t.date === date && t.time).forEach((t) => items.push({ kind: "task", time: t.time, data: t }));
    const dateObj = new Date(date + "T00:00:00");
    state.habits.filter((h) => h.time && Data.isHabitActiveOn(h, dateObj)).forEach((h) => items.push({ kind: "habit", time: h.time, data: h }));
    return items.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  }

  function slot(time, inner) {
    return `<li class="timeline__item"><span class="timeline__time num">${esc(time)}</span><div class="timeline__body">${inner}</div></li>`;
  }

  function timelineRow(entry) {
    if (entry.kind === "schedule") return slot(entry.time, Components.scheduleRow(entry.data));

    if (entry.kind === "task") {
      const t = entry.data;
      return slot(entry.time, `
        <div class="row row--schedule ${t.completed ? "is-done" : ""}">
          <button type="button" class="row__check" data-action="toggle-task" data-id="${esc(t.id)}" aria-pressed="${t.completed}" aria-label="${t.completed ? "إلغاء إنجاز" : "تحديد كمنجز"}: ${esc(t.title)}">${t.completed ? I.svg("check", { size: 17, stroke: 2.6 }) : ""}</button>
          <span class="row__icon">${I.svg("tasks")}</span>
          <button type="button" class="row__body" data-action="edit-task" data-id="${esc(t.id)}" aria-label="تعديل: ${esc(t.title)}">
            <span class="row__title">${esc(t.title)}</span>
            <span class="row__meta"><span>مهمة</span>${Components.priorityBadge(t.priority)}</span>
          </button>
          <span class="row__xp"><bdi>+${t.xp} XP</bdi></span>
          <span></span>
        </div>`);
    }

    const h = entry.data;
    const done = h.completionHistory.includes(selectedDate);
    const isToday = selectedDate === Data.todayISO(0);
    return slot(entry.time, `
      <div class="row row--schedule ${done ? "is-done" : ""}">
        ${isToday
          ? `<button type="button" class="row__check" data-action="toggle-habit" data-id="${esc(h.id)}" aria-pressed="${done}" aria-label="${done ? "إلغاء إنجاز" : "تحديد كمنجز"}: ${esc(h.title)}">${done ? I.svg("check", { size: 17, stroke: 2.6 }) : ""}</button>`
          : `<span class="row__check row__check--static ${done ? "is-on" : ""}" aria-hidden="true">${done ? I.svg("check", { size: 17, stroke: 2.6 }) : ""}</span>`}
        <span class="row__icon">${I.svg(I.resolve(h.icon, "flame"))}</span>
        <button type="button" class="row__body" data-action="edit-habit" data-id="${esc(h.id)}" aria-label="تعديل: ${esc(h.title)}">
          <span class="row__title">${esc(h.title)}</span>
          <span class="row__meta"><span>عادة</span></span>
        </button>
        <span class="row__xp"><bdi>+${h.xp} XP</bdi></span>
        <span></span>
      </div>`);
  }

  function afterRender(container) {
    const go = (offset) => { selectedDate = shift(selectedDate, offset); REBUILT.Router.renderCurrent(); };
    const prev = container.querySelector("#planner-prev");
    const next = container.querySelector("#planner-next");
    const todayBtn = container.querySelector("#planner-today");
    if (prev) prev.addEventListener("click", () => go(-7));
    if (next) next.addEventListener("click", () => go(7));
    if (todayBtn) todayBtn.addEventListener("click", () => { selectedDate = Data.todayISO(0); REBUILT.Router.renderCurrent(); });
    container.querySelectorAll("[data-day]").forEach((btn) => {
      btn.addEventListener("click", () => { selectedDate = btn.dataset.day; REBUILT.Router.renderCurrent(); });
    });
  }

  /* ---------------- Add / Edit form ---------------- */

  function openForm(state, itemId) {
    const editing = itemId ? state.scheduleItems.find((s) => s.id === itemId) : null;

    const body = `
      <form class="form" id="schedule-form" novalidate>
        ${Components.inputField({ name: "title", label: "العنوان", value: editing ? editing.title : "", maxlength: 80, placeholder: "مثلاً: محاضرة", autofocus: !editing })}
        <div class="field">
          <span class="field__label">النوع</span>
          ${Components.segmented("type", TYPES, editing ? editing.type : "event")}
        </div>
        ${Components.inputField({ name: "date", label: "التاريخ", type: "date", value: editing ? editing.date : selectedDate })}
        <div class="field-row">
          ${Components.inputField({ name: "startTime", label: "وقت البداية", type: "time", value: editing ? editing.startTime : "" })}
          ${Components.inputField({ name: "endTime", label: "وقت النهاية", type: "time", value: editing && editing.endTime ? editing.endTime : "", optional: true })}
        </div>
        ${Components.inputField({ name: "notes", label: "ملاحظات", value: editing ? editing.notes || "" : "", optional: true, maxlength: 160 })}
        <div class="modal__footer">
          <button type="submit" class="btn btn--primary">${editing ? "حفظ التعديلات" : "إضافة"}</button>
          ${editing ? `<button type="button" class="btn btn--danger btn-spacer" data-action="delete-schedule-item" data-id="${esc(editing.id)}">${I.svg("trash")}حذف</button>` : ""}
        </div>
      </form>`;

    REBUILT.Modal.open({
      title: editing ? "تعديل العنصر" : "إضافة لخطة يومك",
      body,
      onMount: (modal) => {
        const form = modal.querySelector("#schedule-form");
        Components.clearErrorsOnInput(modal);
        Components.bindSegmented(modal, "type");

        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const title = (fd.get("title") || "").toString().trim();
          const date = fd.get("date");
          const startTime = fd.get("startTime");
          const endTime = fd.get("endTime");
          // Validate bottom-up so the first (top-most) problem ends up focused.
          let bad = null;
          if (endTime && startTime && endTime <= startTime) bad = ["endTime", "وقت النهاية لازم يكون بعد وقت البداية."];
          if (!startTime) bad = ["startTime", "اختار وقت البداية."];
          if (!date) bad = ["date", "اختار التاريخ."];
          if (!title) bad = ["title", "اكتب عنوان."];
          if (bad) return Components.setFieldError(modal, bad[0], bad[1]);
          const payload = {
            title,
            type: Components.segmentedValue(modal, "type") || "event",
            date,
            startTime,
            endTime: endTime || null,
            notes: (fd.get("notes") || "").toString().trim(),
          };
          REBUILT.Modal.close();
          if (editing) REBUILT.Actions.updateScheduleItem(editing.id, payload);
          else REBUILT.Actions.addScheduleItem(payload);
        });
      },
    });
  }

  return { render, afterRender, openForm };
})();
