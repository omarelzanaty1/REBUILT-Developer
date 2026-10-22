/* ============================================================
   REBUILT — pages/tasks.js
   Tabs (Today / Upcoming / Overdue / Completed) with live counts,
   priority filter, and sort.
   ============================================================ */

window.REBUILT = window.REBUILT || {};
REBUILT.Pages = REBUILT.Pages || {};

REBUILT.Pages.tasks = (function () {
  const { Messages, Components, Data, Icons: I } = REBUILT;
  const esc = Components.esc;
  const ui = { tab: "today", filter: "all", sort: "priority" };

  const TABS = [
    { id: "today", label: "النهارده" },
    { id: "upcoming", label: "قادمة" },
    { id: "overdue", label: "متأخرة" },
    { id: "completed", label: "مكتملة" },
  ];
  const FILTERS = [
    { id: "all", label: "الكل" },
    { id: "urgent", label: "عاجلة" },
    { id: "high", label: "عالية" },
    { id: "medium", label: "متوسطة" },
    { id: "low", label: "منخفضة" },
  ];
  const SORTS = [
    { id: "priority", label: "الأولوية" },
    { id: "time", label: "الوقت" },
    { id: "created", label: "تاريخ الإضافة" },
  ];
  const PRIORITIES = [
    { id: "low", label: "منخفضة" },
    { id: "medium", label: "متوسطة" },
    { id: "high", label: "عالية" },
    { id: "urgent", label: "عاجلة" },
  ];
  const EMPTY = {
    today: { icon: "checkCircle", text: "مفيش مهام مستنياك النهارده. استمتع بالهدوء أو ضيف مهمة." },
    upcoming: { icon: "calendar", text: "مفيش مهام قادمة دلوقتي." },
    overdue: { icon: "checkCircle", text: "مفيش حاجة متأخرة. كده تمام." },
    completed: { icon: "trophy", text: "لسه مخلصتش أي مهمة. أول واحدة أسهل ما تتخيل." },
  };

  function bucket(task, today) {
    if (task.completed) return "completed";
    if (task.date && task.date < today) return "overdue";
    if (task.date === today) return "today";
    return "upcoming";
  }

  function header() {
    return Components.pageHeader({
      title: "المهام",
      sub: "رتّب شغلك بالأولوية والموعد.",
      actions: `<button type="button" class="btn btn--primary" data-action="open-add-task">${I.svg("plus")}مهمة جديدة</button>`,
    });
  }

  function render(state) {
    if (state.tasks.length === 0) {
      return `
        ${header()}
        <section class="card">${Components.emptyState({
          icon: "tasks",
          title: "لسه مفيش مهام",
          text: Messages.emptyTasks(),
          actions: [{ label: "إضافة مهمة", action: "open-add-task", icon: "plus" }],
        })}</section>`;
    }

    const today = Data.todayISO(0);
    const counts = { today: 0, upcoming: 0, overdue: 0, completed: 0 };
    state.tasks.forEach((t) => { counts[bucket(t, today)] += 1; });

    let list = state.tasks.filter((t) => bucket(t, today) === ui.tab);
    if (ui.filter !== "all") list = list.filter((t) => t.priority === ui.filter);
    list = list.slice().sort(sorter(ui.sort));

    return `
      ${header()}

      <div class="tabs" role="tablist" aria-label="تصنيف المهام">
        ${TABS.map((t) => `
          <button type="button" role="tab" class="tab ${ui.tab === t.id ? "is-active" : ""}" aria-selected="${ui.tab === t.id}" data-tab="${t.id}">
            ${t.label}<span class="tab__count num">${counts[t.id]}</span>
          </button>`).join("")}
      </div>

      <div class="filter-bar">
        <div class="chip-row" role="group" aria-label="فلتر الأولوية">
          ${FILTERS.map((f) => `<button type="button" class="chip ${ui.filter === f.id ? "is-selected" : ""}" aria-pressed="${ui.filter === f.id}" data-filter="${f.id}">${f.label}</button>`).join("")}
        </div>
        <label class="filter-bar__sort">
          <span class="visually-hidden">ترتيب المهام</span>
          <select class="field__input" id="task-sort">
            ${SORTS.map((s) => `<option value="${s.id}" ${ui.sort === s.id ? "selected" : ""}>ترتيب: ${s.label}</option>`).join("")}
          </select>
        </label>
      </div>

      <section class="card">
        <div class="row-list">
          ${list.length
            ? list.map(Components.taskRow).join("")
            : Components.emptyState({ compact: true, icon: EMPTY[ui.tab].icon, text: ui.filter !== "all" ? "مفيش مهام بالأولوية دي هنا." : EMPTY[ui.tab].text })}
        </div>
      </section>
    `;
  }

  function sorter(mode) {
    const weight = { urgent: 0, high: 1, medium: 2, low: 3 };
    if (mode === "time") return (a, b) => ((a.date || "9999") + (a.time || "99:99")).localeCompare((b.date || "9999") + (b.time || "99:99"));
    if (mode === "created") return (a, b) => (b.createdAt || "").localeCompare(a.createdAt || "");
    return (a, b) => (weight[a.priority] ?? 2) - (weight[b.priority] ?? 2);
  }

  function afterRender(container) {
    container.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => { ui.tab = btn.dataset.tab; REBUILT.Router.renderCurrent(); });
    });
    container.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.addEventListener("click", () => { ui.filter = btn.dataset.filter; REBUILT.Router.renderCurrent(); });
    });
    const sortSel = container.querySelector("#task-sort");
    if (sortSel) sortSel.addEventListener("change", (e) => { ui.sort = e.target.value; REBUILT.Router.renderCurrent(); });
  }

  /* ---------------- Add / Edit form ---------------- */

  function openForm(state, taskId) {
    const editing = taskId ? state.tasks.find((t) => t.id === taskId) : null;

    const body = `
      <form class="form" id="task-form" novalidate>
        ${Components.inputField({ name: "title", label: "اسم المهمة", value: editing ? editing.title : "", maxlength: 80, placeholder: "مثلاً: تجهيز العرض", autofocus: !editing })}
        ${Components.inputField({ name: "description", label: "وصف", value: editing ? editing.description || "" : "", optional: true, maxlength: 200, placeholder: "تفاصيل إضافية" })}

        <div class="field">
          <span class="field__label">الأولوية</span>
          ${Components.segmented("priority", PRIORITIES, editing ? editing.priority : "medium")}
        </div>

        <div class="field-row">
          ${Components.inputField({ name: "date", label: "التاريخ", type: "date", value: editing ? editing.date || "" : Data.todayISO(0), optional: true })}
          ${Components.inputField({ name: "time", label: "الوقت", type: "time", value: editing && editing.time ? editing.time : "", optional: true })}
        </div>

        ${Components.inputField({ name: "xp", label: "مكافأة XP", type: "number", value: editing ? editing.xp : 25, min: 5, max: 100, step: 5, inputmode: "numeric" })}

        <div class="modal__footer">
          <button type="submit" class="btn btn--primary">${editing ? "حفظ التعديلات" : "إضافة المهمة"}</button>
          ${editing ? `<button type="button" class="btn btn--danger btn-spacer" data-action="delete-task" data-id="${esc(editing.id)}">${I.svg("trash")}حذف</button>` : ""}
        </div>
      </form>`;

    REBUILT.Modal.open({
      title: editing ? "تعديل المهمة" : "مهمة جديدة",
      body,
      onMount: (modal) => {
        const form = modal.querySelector("#task-form");
        Components.clearErrorsOnInput(modal);
        Components.bindSegmented(modal, "priority");

        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const title = (fd.get("title") || "").toString().trim();
          if (!title) return Components.setFieldError(modal, "title", "اكتب اسم للمهمة.");
          if (fd.get("time") && !fd.get("date")) {
            // A time without a day can't be scheduled anywhere — say so instead of silently dropping it.
            return Components.setFieldError(modal, "date", "اختار تاريخ علشان الوقت يتحسب.");
          }
          const payload = {
            title,
            description: (fd.get("description") || "").toString().trim(),
            priority: Components.segmentedValue(modal, "priority") || "medium",
            date: fd.get("date") || null,
            time: fd.get("time") || null,
            xp: Math.min(100, Math.max(5, Number(fd.get("xp")) || 25)),
          };
          REBUILT.Modal.close();
          // Follow the task: if it now belongs to another tab (or is hidden by the priority filter),
          // switch there so it never looks like it vanished.
          ui.tab = bucket({ completed: editing ? editing.completed : false, date: payload.date }, Data.todayISO(0));
          if (ui.filter !== "all" && ui.filter !== payload.priority) ui.filter = "all";
          if (editing) REBUILT.Actions.updateTask(editing.id, payload);
          else REBUILT.Actions.addTask(payload);
        });
      },
    });
  }

  return { render, afterRender, openForm };
})();
