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
    { id: "today", get label() { return REBUILT.t("tasks.today"); } },
    { id: "upcoming", get label() { return REBUILT.t("tasks.upcoming"); } },
    { id: "overdue", get label() { return REBUILT.t("tasks.overdue"); } },
    { id: "completed", get label() { return REBUILT.t("tasks.completed"); } },
  ];
  const FILTERS = [
    { id: "all", get label() { return REBUILT.t("tasks.all"); } },
    { id: "urgent", get label() { return REBUILT.t("tasks.urgent"); } },
    { id: "high", get label() { return REBUILT.t("tasks.high"); } },
    { id: "medium", get label() { return REBUILT.t("tasks.medium"); } },
    { id: "low", get label() { return REBUILT.t("tasks.low"); } },
  ];
  const SORTS = [
    { id: "priority", get label() { return REBUILT.t("tasks.priority"); } },
    { id: "time", get label() { return REBUILT.t("tasks.time"); } },
    { id: "created", get label() { return REBUILT.t("tasks.date_added"); } },
  ];
  const PRIORITIES = [
    { id: "low", get label() { return REBUILT.t("tasks.low"); } },
    { id: "medium", get label() { return REBUILT.t("tasks.medium"); } },
    { id: "high", get label() { return REBUILT.t("tasks.high"); } },
    { id: "urgent", get label() { return REBUILT.t("tasks.urgent"); } },
  ];
  const EMPTY = {
    today: { icon: "checkCircle", get text() { return REBUILT.t("tasks.no_tasks_waiting_for_you"); } },
    upcoming: { icon: "calendar", get text() { return REBUILT.t("tasks.no_upcoming_tasks_right_now"); } },
    overdue: { icon: "checkCircle", get text() { return REBUILT.t("tasks.nothing_overdue_all_good"); } },
    completed: { icon: "trophy", get text() { return REBUILT.t("tasks.you_haven_t_completed_any"); } },
  };

  function bucket(task, today) {
    if (task.completed) return "completed";
    if (task.date && task.date < today) return "overdue";
    if (task.date === today) return "today";
    return "upcoming";
  }

  function header() {
    return Components.pageHeader({
      title: REBUILT.t("tasks.tasks"),
      sub: REBUILT.t("tasks.organize_your_work_by_priority"),
      actions: `<button type="button" class="btn btn--primary" data-action="open-add-task">${REBUILT.t("tasks.new_task", { p1: I.svg("plus") })}</button>`,
    });
  }

  function render(state) {
    if (state.tasks.length === 0) {
      return `
        ${header()}
        <section class="card">${Components.emptyState({
          icon: "tasks",
          title: REBUILT.t("tasks.no_tasks_yet"),
          text: Messages.emptyTasks(),
          actions: [{ label: REBUILT.t("tasks.add_task"), action: "open-add-task", icon: "plus" }],
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

      <div class="tabs" role="tablist" aria-label="${REBUILT.t("tasks.task_categories")}">
        ${TABS.map((t) => `
          <button type="button" role="tab" class="tab ${ui.tab === t.id ? "is-active" : ""}" aria-selected="${ui.tab === t.id}" data-tab="${t.id}">
            ${t.label}<span class="tab__count num">${counts[t.id]}</span>
          </button>`).join("")}
      </div>

      <div class="filter-bar">
        <div class="chip-row" role="group" aria-label="${REBUILT.t("tasks.priority_filter")}">
          ${FILTERS.map((f) => `<button type="button" class="chip ${ui.filter === f.id ? "is-selected" : ""}" aria-pressed="${ui.filter === f.id}" data-filter="${f.id}">${f.label}</button>`).join("")}
        </div>
        <label class="filter-bar__sort">
          <span class="visually-hidden">${REBUILT.t("tasks.sort_tasks")}</span>
          <select class="field__input" id="task-sort">
            ${SORTS.map((s) => `<option value="${s.id}" ${ui.sort === s.id ? "selected" : ""}>${REBUILT.t("tasks.sorted_by", { label: s.label })}</option>`).join("")}
          </select>
        </label>
      </div>

      <section class="card">
        <div class="row-list">
          ${list.length
            ? list.map(Components.taskRow).join("")
            : Components.emptyState({ compact: true, icon: EMPTY[ui.tab].icon, text: ui.filter !== "all" ? REBUILT.t("tasks.no_tasks_with_this_priority") : EMPTY[ui.tab].text })}
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
        ${Components.inputField({ name: "title", label: REBUILT.t("tasks.task_name"), value: editing ? editing.title : "", maxlength: 80, placeholder: REBUILT.t("tasks.e_g_prepare_the_presentation"), autofocus: !editing })}
        ${Components.inputField({ name: "description", label: REBUILT.t("tasks.description"), value: editing ? editing.description || "" : "", optional: true, maxlength: 200, placeholder: REBUILT.t("tasks.extra_details") })}

        <div class="field">
          <span class="field__label">${REBUILT.t("tasks.priority")}</span>
          ${Components.segmented("priority", PRIORITIES, editing ? editing.priority : "medium")}
        </div>

        <div class="field-row">
          ${Components.inputField({ name: "date", label: REBUILT.t("tasks.date"), type: "date", value: editing ? editing.date || "" : Data.todayISO(0), optional: true })}
          ${Components.inputField({ name: "time", label: REBUILT.t("tasks.time"), type: "time", value: editing && editing.time ? editing.time : "", optional: true })}
        </div>

        ${Components.inputField({ name: "xp", label: REBUILT.t("tasks.xp_reward"), type: "number", value: editing ? editing.xp : 25, min: 5, max: 100, step: 5, inputmode: "numeric" })}

        <div class="modal__footer">
          <button type="submit" class="btn btn--primary">${editing ? REBUILT.t("tasks.save_changes") : REBUILT.t("tasks.add_task_2")}</button>
          ${editing ? `<button type="button" class="btn btn--danger btn-spacer" data-action="delete-task" data-id="${esc(editing.id)}">${REBUILT.t("tasks.delete", { p1: I.svg("trash") })}</button>` : ""}
        </div>
      </form>`;

    REBUILT.Modal.open({
      title: editing ? REBUILT.t("tasks.edit_task") : REBUILT.t("tasks.new_task_2"),
      body,
      onMount: (modal) => {
        const form = modal.querySelector("#task-form");
        Components.clearErrorsOnInput(modal);
        Components.bindSegmented(modal, "priority");

        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const title = (fd.get("title") || "").toString().trim();
          if (!title) return Components.setFieldError(modal, "title", REBUILT.t("tasks.enter_a_name_for_the"));
          if (fd.get("time") && !fd.get("date")) {
            // A time without a day can't be scheduled anywhere — say so instead of silently dropping it.
            return Components.setFieldError(modal, "date", REBUILT.t("tasks.pick_a_date_so_the"));
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
