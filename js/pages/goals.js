/* ============================================================
   REBUILT — pages/goals.js
   Manage goals and track progress. A goal is a titled outcome with
   optional steps; its progress is derived from the steps ticked
   (see goals.js). Goals persist in user_profiles.goals — no schema
   change — and have no XP of their own, so they can never skew the
   XP ledger.
   ============================================================ */

window.REBUILT = window.REBUILT || {};
REBUILT.Pages = REBUILT.Pages || {};

REBUILT.Pages.goals = (function () {
  const { Components, Data, Goals, Icons: I } = REBUILT;
  const esc = Components.esc;
  const ui = { tab: "active" };

  function header() {
    return Components.pageHeader({
      title: "الأهداف",
      sub: "حدّد اللي عايز توصله، وقسّمه لخطوات صغيرة تتابعها.",
      actions: `<button type="button" class="btn btn--primary" data-action="open-add-goal">${I.svg("plus")}هدف جديد</button>`,
    });
  }

  function render(state) {
    const goals = state.goals || [];

    if (!goals.length) {
      const suggestions = Data.PRESET_GOALS;
      return `
        ${header()}
        <section class="card">
          ${Components.emptyState({
            icon: "target",
            title: "لسه مفيش أهداف",
            text: "الهدف الكبير بيبقى سهل لما تقسّمه لخطوات. ابدأ بهدف واحد.",
            actions: [{ label: "هدف جديد", action: "open-add-goal", icon: "plus" }],
          })}
          <div class="suggest">
            <p class="suggest__label">أو ابدأ بفكرة جاهزة:</p>
            <div class="chip-row">
              ${suggestions.map((t) => `<button type="button" class="chip" data-quick-goal="${esc(t)}">${I.svg("plus")}${esc(t)}</button>`).join("")}
            </div>
          </div>
        </section>`;
    }

    const stats = Goals.stats(goals);
    const sorted = Goals.sorted(goals);
    const list = sorted.filter((g) => g.status === ui.tab);

    return `
      ${header()}

      <section class="stat-grid stat-grid--3" aria-label="ملخص الأهداف">
        <div class="stat"><span class="stat__icon">${I.svg("target")}</span><span class="stat__value num">${stats.active}</span><span class="stat__label">أهداف شغّالة</span></div>
        <div class="stat"><span class="stat__icon">${I.svg("trophy")}</span><span class="stat__value num">${stats.done}</span><span class="stat__label">أهداف اتحققت</span></div>
        <div class="stat"><span class="stat__icon">${I.svg("trend")}</span><span class="stat__value num">${stats.avgProgress}<small>%</small></span><span class="stat__label">متوسط التقدّم</span></div>
      </section>

      <div class="tabs" role="tablist" aria-label="حالة الأهداف">
        <button type="button" role="tab" class="tab ${ui.tab === "active" ? "is-active" : ""}" aria-selected="${ui.tab === "active"}" data-tab="active">شغّالة<span class="tab__count num">${stats.active}</span></button>
        <button type="button" role="tab" class="tab ${ui.tab === "done" ? "is-active" : ""}" aria-selected="${ui.tab === "done"}" data-tab="done">اتحققت<span class="tab__count num">${stats.done}</span></button>
      </div>

      ${list.length
        ? `<div class="goal-grid">${list.map(Components.goalCard).join("")}</div>`
        : `<section class="card">${Components.emptyState({
            compact: true,
            icon: ui.tab === "active" ? "target" : "trophy",
            text: ui.tab === "active" ? "مفيش أهداف شغّالة دلوقتي." : "لسه مفيش هدف اتحقق. كمّل وهتوصل.",
            actions: ui.tab === "active" ? [{ label: "هدف جديد", action: "open-add-goal", icon: "plus" }] : [],
          })}</section>`}
    `;
  }

  function afterRender(container) {
    container.querySelectorAll("[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => { ui.tab = btn.dataset.tab; REBUILT.Router.renderCurrent(); });
    });

    container.querySelectorAll("[data-quick-goal]").forEach((btn) => {
      btn.addEventListener("click", () => REBUILT.Actions.addGoal({ title: btn.dataset.quickGoal }));
    });

    // "Add a step" — Enter or the + button. Keeps focus in the field for rapid entry.
    container.querySelectorAll("[data-goal-step-form]").forEach((form) => {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = form.querySelector("input[name=step]");
        const goalId = form.dataset.id;
        const added = REBUILT.Actions.addStep(goalId, input.value);
        if (added) {
          const next = document.querySelector(`[data-goal-id="${CSS.escape(goalId)}"] input[name=step]`);
          if (next) next.focus();
        }
      });
    });
  }

  /* ---------------- Add / Edit form ---------------- */

  function openForm(state, goalId) {
    const editing = goalId ? state.goals.find((g) => g.id === goalId) : null;
    // Steps are edited as a working copy and written back on save; ids and ticked state are preserved.
    let steps = editing ? editing.steps.map((s) => ({ id: s.id, title: s.title, done: s.done })) : [];

    const body = `
      <form class="form" id="goal-form" novalidate>
        ${Components.inputField({ name: "title", label: "الهدف", value: editing ? editing.title : "", maxlength: 80, placeholder: "مثلاً: أقرأ 12 كتاب السنة دي", autofocus: !editing })}
        ${Components.inputField({ name: "why", label: "ليه ده مهم؟", value: editing ? editing.why : "", optional: true, maxlength: 160, placeholder: "الدافع بيفرّق وقت التعب" })}
        ${Components.inputField({ name: "targetDate", label: "موعد تحقيقه", type: "date", value: editing && editing.targetDate ? editing.targetDate : "", optional: true })}

        <div class="field">
          <span class="field__label" id="steps-label">الخطوات<span class="optional">اختياري</span></span>
          <ul class="step-editor" id="step-editor" aria-labelledby="steps-label"></ul>
          <button type="button" class="btn btn--secondary btn--sm step-editor__add" id="step-add">${I.svg("plus")}ضيف خطوة</button>
          <span class="field__hint">التقدّم بيتحسب من الخطوات اللي بتعلّم عليها.</span>
        </div>

        <div class="modal__footer">
          <button type="submit" class="btn btn--primary">${editing ? "حفظ التعديلات" : "إضافة الهدف"}</button>
          ${editing ? `<button type="button" class="btn btn--danger btn-spacer" data-action="delete-goal" data-id="${esc(editing.id)}">${I.svg("trash")}حذف</button>` : ""}
        </div>
      </form>`;

    REBUILT.Modal.open({
      title: editing ? "تعديل الهدف" : "هدف جديد",
      body,
      onMount: (modal) => {
        const form = modal.querySelector("#goal-form");
        const list = modal.querySelector("#step-editor");
        Components.clearErrorsOnInput(modal);

        function renderSteps(focusIndex) {
          list.innerHTML = steps
            .map((s, i) => `
              <li class="step-editor__row">
                <input class="field__input" type="text" maxlength="120" value="${esc(s.title)}" data-step-index="${i}" aria-label="الخطوة ${i + 1}" placeholder="الخطوة ${i + 1}" />
                <button type="button" class="icon-btn icon-btn--danger" data-step-remove="${i}" aria-label="حذف الخطوة ${i + 1}">${I.svg("close")}</button>
              </li>`)
            .join("");
          list.querySelectorAll("[data-step-index]").forEach((input) => {
            input.addEventListener("input", () => { steps[Number(input.dataset.stepIndex)].title = input.value; });
            input.addEventListener("keydown", (e) => {
              if (e.key === "Enter") { e.preventDefault(); addStep(); }
            });
          });
          list.querySelectorAll("[data-step-remove]").forEach((btn) => {
            btn.addEventListener("click", () => {
              steps.splice(Number(btn.dataset.stepRemove), 1);
              renderSteps();
            });
          });
          if (focusIndex != null) {
            const el = list.querySelector(`[data-step-index="${focusIndex}"]`);
            if (el) el.focus();
          }
        }

        function addStep() {
          steps.push({ id: Data.generateId("step"), title: "", done: false });
          renderSteps(steps.length - 1);
        }

        modal.querySelector("#step-add").addEventListener("click", addStep);
        renderSteps();

        form.addEventListener("submit", (e) => {
          e.preventDefault();
          const fd = new FormData(form);
          const title = (fd.get("title") || "").toString().trim();
          if (!title) return Components.setFieldError(modal, "title", "اكتب الهدف.");
          const payload = {
            title,
            why: (fd.get("why") || "").toString().trim(),
            targetDate: fd.get("targetDate") || null,
            steps: steps.filter((s) => s.title.trim()).map((s) => ({ id: s.id, title: s.title.trim(), done: s.done })),
          };
          REBUILT.Modal.close();
          if (editing) {
            REBUILT.Actions.updateGoal(editing.id, payload);
          } else {
            REBUILT.Actions.addGoal(payload);
          }
        });
      },
    });
  }

  return { render, afterRender, openForm };
})();
