/* ============================================================
   REBUILT — components.js
   Shared markup builders: rows, cards, badges, empty states.
   Every user-authored string goes through esc() — titles, notes,
   names and goals are never interpolated raw.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Components = (function () {
  const { todayISO } = REBUILT.Data;
  const I = () => REBUILT.Icons;

  /** Escape text for safe use in element content and quoted attributes. */
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function formatDate(iso) {
    if (!iso) return "";
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "short" });
  }

  function frequencyLabel(habit) {
    if (!habit.frequency || habit.frequency === "daily") return "كل يوم";
    if (habit.frequency === "weekly") return "أسبوعيًا";
    if (Array.isArray(habit.targetDays) && habit.targetDays.length) {
      return habit.targetDays.map((d) => REBUILT.Data.WEEKDAY_LABELS[d]).join("، ");
    }
    return "أيام محددة";
  }

  const PRIORITY_LABEL = { urgent: "عاجلة", high: "عالية", medium: "متوسطة", low: "منخفضة" };

  function priorityBadge(priority) {
    return `<span class="badge badge--priority-${esc(priority)}">${PRIORITY_LABEL[priority] || esc(priority)}</span>`;
  }

  const checkBtn = (action, id, done, title) => `
    <button type="button" class="row__check" data-action="${action}" data-id="${esc(id)}" aria-pressed="${done}" aria-label="${done ? "إلغاء إنجاز" : "تحديد كمنجز"}: ${esc(title)}">
      ${done ? I().svg("check", { size: 17, stroke: 2.6 }) : ""}
    </button>`;

  const rowActions = (editAction, deleteAction, id, title) => `
    <div class="row__actions">
      <button type="button" class="icon-btn" data-action="${editAction}" data-id="${esc(id)}" aria-label="تعديل: ${esc(title)}">${I().svg("edit")}</button>
      <button type="button" class="icon-btn icon-btn--danger" data-action="${deleteAction}" data-id="${esc(id)}" aria-label="حذف: ${esc(title)}">${I().svg("trash")}</button>
    </div>`;

  function habitRow(habit) {
    const done = habit.completionHistory.includes(todayISO(0));
    const iconKey = I().resolve(habit.icon, "target");
    return `
      <div class="row row--habit ${done ? "is-done" : ""}" data-habit-id="${esc(habit.id)}">
        ${checkBtn("toggle-habit", habit.id, done, habit.title)}
        <span class="row__icon">${I().svg(iconKey)}</span>
        <button type="button" class="row__body" data-action="edit-habit" data-id="${esc(habit.id)}" aria-label="تعديل: ${esc(habit.title)}">
          <span class="row__title">${esc(habit.title)}</span>
          <span class="row__meta">
            <span>${frequencyLabel(habit)}</span>
            ${habit.time ? `<span class="num">${esc(habit.time)}</span>` : ""}
            ${habit.currentStreak > 0 ? `<span class="row__streak">${I().svg("flame", { size: 14 })}<span class="num">${habit.currentStreak}</span></span>` : ""}
          </span>
        </button>
        <span class="row__xp"><bdi>+${habit.xp} XP</bdi></span>
        ${rowActions("edit-habit", "delete-habit", habit.id, habit.title)}
      </div>`;
  }

  function taskRow(task) {
    const today = todayISO(0);
    const overdue = !task.completed && task.date && task.date < today;
    return `
      <div class="row row--task ${task.completed ? "is-done" : ""}" data-task-id="${esc(task.id)}">
        ${checkBtn("toggle-task", task.id, task.completed, task.title)}
        <span class="row__icon">${I().svg("tasks")}</span>
        <button type="button" class="row__body" data-action="edit-task" data-id="${esc(task.id)}" aria-label="تعديل: ${esc(task.title)}">
          <span class="row__title">${esc(task.title)}</span>
          <span class="row__meta ${overdue ? "row__meta--overdue" : ""}">
            ${priorityBadge(task.priority)}
            ${task.date ? `<span class="row__date">${I().svg("calendar")} ${formatDate(task.date)}${task.time ? ` · <span class="num">${esc(task.time)}</span>` : ""}</span>` : ""}
            ${overdue ? `<span class="row__overdue">متأخرة</span>` : ""}
          </span>
        </button>
        <span class="row__xp"><bdi>+${task.xp} XP</bdi></span>
        ${rowActions("edit-task", "delete-task", task.id, task.title)}
      </div>`;
  }

  const SCHEDULE_ICON = { task: "tasks", habit: "flame", event: "calendar", break: "coffee" };

  function scheduleRow(item, opts) {
    opts = opts || {};
    const icon = SCHEDULE_ICON[item.type] || "calendar";
    return `
      <div class="row row--schedule ${item.completed ? "is-done" : ""}" data-schedule-id="${esc(item.id)}">
        ${checkBtn(opts.checkAction || "toggle-schedule-item", item.id, item.completed, item.title)}
        <span class="row__icon">${I().svg(icon)}</span>
        <button type="button" class="row__body" data-action="edit-schedule-item" data-id="${esc(item.id)}" aria-label="تعديل: ${esc(item.title)}">
          <span class="row__title">${esc(item.title)}</span>
          <span class="row__meta"><span class="num">${esc(item.startTime)}${item.endTime ? "–" + esc(item.endTime) : ""}</span>${item.notes ? `<span>${esc(item.notes)}</span>` : ""}</span>
        </button>
        <span></span>
        ${opts.editable !== false ? rowActions("edit-schedule-item", "delete-schedule-item", item.id, item.title) : "<span></span>"}
      </div>`;
  }

  /** Goal card: progress, steps (tick to track), quick add. Used on the Goals page. */
  function goalCard(goal) {
    const G = REBUILT.Goals;
    const p = G.progress(goal);
    const due = G.dueLabel(goal);
    const overdue = G.daysLeft(goal) !== null && G.daysLeft(goal) < 0;
    const done = goal.status === "done";
    const canFinish = !done && (p.total === 0 || p.done === p.total);
    return `
      <article class="goal ${done ? "is-done" : ""}" data-goal-id="${esc(goal.id)}">
        <header class="goal__head">
          <span class="goal__icon">${I().svg(done ? "checkCircle" : "target")}</span>
          <div class="goal__titlewrap">
            <h3 class="goal__title">${esc(goal.title)}</h3>
            ${goal.why ? `<p class="goal__why">${esc(goal.why)}</p>` : ""}
          </div>
          <div class="goal__actions">
            <button type="button" class="icon-btn" data-action="edit-goal" data-id="${esc(goal.id)}" aria-label="تعديل الهدف: ${esc(goal.title)}">${I().svg("edit")}</button>
          </div>
        </header>

        <div class="goal__progress">
          <div class="progress ${done ? "" : "progress--lg"}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p.pct}" aria-label="تقدّم الهدف">
            <span class="progress__fill ${done ? "progress__fill--success" : ""}" style="width:${p.pct}%"></span>
          </div>
          <div class="goal__stats">
            <span class="goal__pct num">${p.pct}%</span>
            ${p.total ? `<span class="goal__count"><span class="num">${p.done}/${p.total}</span> خطوات</span>` : `<span class="goal__count">من غير خطوات لسه</span>`}
            ${due ? `<span class="badge ${overdue ? "badge--priority-urgent" : "badge--priority-medium"}">${I().svg("flag", { size: 12 })}${due}</span>` : ""}
            ${done ? `<span class="badge badge--success">${I().svg("check", { size: 12, stroke: 2.4 })}اتحقق</span>` : ""}
          </div>
        </div>

        ${p.total || !done ? `
        <ul class="steps" aria-label="خطوات الهدف">
          ${goal.steps.map((s) => `
            <li class="step ${s.done ? "is-done" : ""}">
              <button type="button" class="step__check" data-action="toggle-step" data-id="${esc(goal.id)}" data-step="${esc(s.id)}" aria-pressed="${s.done}" aria-label="${esc(s.title)}">${s.done ? I().svg("check", { size: 14, stroke: 2.8 }) : ""}</button>
              <span class="step__title">${esc(s.title)}</span>
              <button type="button" class="icon-btn icon-btn--sm icon-btn--danger step__remove" data-action="delete-step" data-id="${esc(goal.id)}" data-step="${esc(s.id)}" aria-label="حذف الخطوة: ${esc(s.title)}">${I().svg("close")}</button>
            </li>`).join("")}
        </ul>` : ""}

        ${!done ? `
        <form class="step-add" data-goal-step-form data-id="${esc(goal.id)}" autocomplete="off">
          <input class="field__input step-add__input" name="step" type="text" maxlength="120" placeholder="ضيف خطوة صغيرة…" aria-label="خطوة جديدة لهدف: ${esc(goal.title)}" />
          <button type="submit" class="btn btn--secondary btn--sm" aria-label="إضافة الخطوة">${I().svg("plus")}</button>
        </form>` : ""}

        ${canFinish ? `
        <div class="goal__finish">
          <span>${p.total ? "كل الخطوات اتعملت." : "خلّصت الهدف ده؟"}</span>
          <button type="button" class="btn btn--primary btn--sm" data-action="complete-goal" data-id="${esc(goal.id)}">${I().svg("check", { size: 16, stroke: 2.4 })}علّمه كمتحقق</button>
        </div>` : ""}
        ${done ? `
        <div class="goal__finish goal__finish--done">
          <span>اتحقق${goal.completedAt ? " في " + formatDate(goal.completedAt) : ""}.</span>
          <button type="button" class="btn btn--ghost btn--sm" data-action="reopen-goal" data-id="${esc(goal.id)}">${I().svg("undo", { size: 16 })}رجّعه نشط</button>
        </div>` : ""}
      </article>`;
  }

  /** Compact goal line for the Dashboard: title + progress, taps through to Goals. */
  function goalMini(goal) {
    const p = REBUILT.Goals.progress(goal);
    const due = REBUILT.Goals.dueLabel(goal);
    return `
      <button type="button" class="goal-mini" data-nav="goals">
        <span class="goal-mini__top">
          <span class="goal-mini__title">${esc(goal.title)}</span>
          <span class="goal-mini__pct num">${p.pct}%</span>
        </span>
        <span class="progress progress--sm"><span class="progress__fill" style="width:${p.pct}%"></span></span>
        ${due ? `<span class="goal-mini__due">${due}</span>` : ""}
      </button>`;
  }

  function achievementBadge(ach) {
    const unlocked = ach.unlocked;
    return `
      <div class="badge-card ${unlocked ? "is-unlocked" : "is-locked"}" data-achievement-id="${esc(ach.id)}" tabindex="0" role="group" aria-label="${esc(ach.name)} — ${unlocked ? "اتفتح" : "مقفول"}">
        <div class="badge-card__icon">${I().svg(unlocked ? I().resolve(ach.icon, "trophy") : "lock", { size: 28 })}</div>
        <div class="badge-card__name">${esc(ach.name)}</div>
        <div class="badge-card__desc">${unlocked ? ach.description : "لسه مقفول"}</div>
        ${unlocked && ach.unlockedAt ? `<div class="badge-card__date">${formatDate(ach.unlockedAt)}</div>` : ""}
      </div>`;
  }

  /**
   * emptyState({ icon, title, text, actions:[{label, action|nav, variant, icon}], compact })
   * (the old (message, ctaLabel, ctaAction) signature still works)
   */
  function emptyState(a, ctaLabel, ctaAction) {
    const o = typeof a === "string" ? { text: a, actions: ctaLabel ? [{ label: ctaLabel, action: ctaAction }] : [] } : a;
    const actions = (o.actions || [])
      .map((b) => `<button type="button" class="btn btn--${b.variant || "primary"}" ${b.nav ? `data-nav="${b.nav}"` : `data-action="${b.action}"`}>${b.icon ? I().svg(b.icon) : ""}${b.label}</button>`)
      .join("");
    return `
      <div class="empty ${o.compact ? "empty--compact" : ""}">
        <div class="empty__art">${I().svg(o.icon || "sparkles", { size: o.compact ? 24 : 32 })}</div>
        ${o.title ? `<h3 class="empty__title">${o.title}</h3>` : ""}
        ${o.text ? `<p class="empty__text">${String(o.text).replace(/\n/g, "<br/>")}</p>` : ""}
        ${actions ? `<div class="empty__actions">${actions}</div>` : ""}
      </div>`;
  }

  /** Standard page header. */
  function pageHeader(o) {
    return `
      <header class="page-header">
        <div class="page-header__text">
          ${o.eyebrow ? `<div class="eyebrow">${o.eyebrow}</div>` : ""}
          <h1 class="page-header__title">${o.title}</h1>
          ${o.sub ? `<p class="page-header__sub">${o.sub}</p>` : ""}
        </div>
        ${o.actions ? `<div class="page-header__actions">${o.actions}</div>` : ""}
      </header>`;
  }

  /* ---------------- Form helpers (used by every dialog) ---------------- */

  /** Labelled text-like input. Errors are filled in by setFieldError(). */
  function inputField(o) {
    const id = "m-" + o.name;
    const tag = o.textarea ? "textarea" : "input";
    const attrs = [
      `class="field__input${o.ltr ? " field__input--ltr" : ""}"`,
      `id="${id}"`,
      `name="${o.name}"`,
      o.textarea ? `rows="${o.rows || 3}"` : `type="${o.type || "text"}"`,
      o.maxlength ? `maxlength="${o.maxlength}"` : "",
      o.placeholder ? `placeholder="${esc(o.placeholder)}"` : "",
      o.min != null ? `min="${o.min}"` : "",
      o.max != null ? `max="${o.max}"` : "",
      o.step != null ? `step="${o.step}"` : "",
      o.inputmode ? `inputmode="${o.inputmode}"` : "",
      o.required ? "required" : "",
      o.autofocus ? "autofocus" : "",
      `aria-describedby="${id}-err${o.hint ? " " + id + "-hint" : ""}"`,
    ].filter(Boolean).join(" ");
    const control = o.textarea ? `<textarea ${attrs}>${esc(o.value || "")}</textarea>` : `<input ${attrs} value="${esc(o.value == null ? "" : o.value)}" />`;
    return `
      <div class="field" data-field="${o.name}">
        <label class="field__label" for="${id}">${o.label}${o.optional ? `<span class="optional">اختياري</span>` : ""}</label>
        ${control}
        ${o.hint ? `<span class="field__hint" id="${id}-hint">${o.hint}</span>` : ""}
        <span class="field__error" id="${id}-err" role="alert">${I().svg("alert", { size: 14 })}<span data-err-text></span></span>
      </div>`;
  }

  function setFieldError(root, name, message) {
    const f = root.querySelector(`[data-field="${name}"]`);
    if (!f) return;
    f.classList.toggle("is-invalid", !!message);
    const t = f.querySelector("[data-err-text]");
    if (t) t.textContent = message || "";
    const input = f.querySelector("input,textarea,select");
    if (input) input.setAttribute("aria-invalid", message ? "true" : "false");
    if (message && input) input.focus();
  }

  /** Clear a field's error once the user edits it. */
  function clearErrorsOnInput(root) {
    root.querySelectorAll(".field input, .field textarea, .field select").forEach((el) => {
      el.addEventListener("input", () => {
        const f = el.closest(".field");
        if (f && f.classList.contains("is-invalid")) setFieldError(root, f.dataset.field, "");
      });
    });
  }

  /** Single-choice button group. options = [{id,label}] */
  function segmented(name, options, selected) {
    return `<div class="segmented" role="radiogroup" data-segmented="${name}">${options
      .map((o) => `<button type="button" role="radio" class="segmented__btn ${o.id === selected ? "is-selected" : ""}" aria-checked="${o.id === selected}" data-value="${esc(o.id)}">${o.label}</button>`)
      .join("")}</div>`;
  }

  function bindSegmented(root, name, onChange) {
    const group = root.querySelector(`[data-segmented="${name}"]`);
    if (!group) return;
    group.querySelectorAll(".segmented__btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        group.querySelectorAll(".segmented__btn").forEach((b) => {
          const on = b === btn;
          b.classList.toggle("is-selected", on);
          b.setAttribute("aria-checked", String(on));
        });
        if (onChange) onChange(btn.dataset.value);
      });
    });
  }

  function segmentedValue(root, name) {
    const sel = root.querySelector(`[data-segmented="${name}"] .is-selected`);
    return sel ? sel.dataset.value : null;
  }

  return {
    esc, habitRow, taskRow, scheduleRow, goalCard, goalMini, priorityBadge, achievementBadge, emptyState, pageHeader,
    formatDate, frequencyLabel, inputField, setFieldError, clearErrorsOnInput, segmented, bindSegmented, segmentedValue,
  };
})();
