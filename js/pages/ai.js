/* ============================================================
   REBUILT — pages/ai.js
   Shows the real message log (local-only or backend-connected,
   REBUILT.AI.Service.isConnected() decides which) and previews the
   context object the backend actually receives.
   ============================================================ */

window.REBUILT = window.REBUILT || {};
REBUILT.Pages = REBUILT.Pages || {};

REBUILT.Pages.ai = (function () {
  /** Model output and user input both go through here — never raw HTML. */
  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  const I = REBUILT.Icons;

  function render(state) {
    const messages = REBUILT.AI.getMessages(state);
    const ctx = REBUILT.AI.buildContext(state);
    const connected = REBUILT.AI.Service.isConnected();

    return `
      <section class="page-header">
        <h1 class="page-header__title">REBUILT AI</h1>
        <span class="badge ${connected ? "badge--priority-low" : "badge--priority-medium"}">${connected ? REBUILT.t("ai.connected") : REBUILT.t("ai.not_connected_to_a_real")}</span>
      </section>

      ${
        connected
          ? ""
          : `<section class="card ai-notice">
        <p class="card__note">
          ${REBUILT.t("ai.rebuilt_ai_will_be_the")}
        </p>
      </section>`
      }

      <section class="card ai-chat">
        <div class="ai-chat__log" id="ai-chat-log">
          ${messages.length ? messages.map(bubble).join("") : `<p class="card__note">${REBUILT.t("ai.start_typing_and_rebuilt_ai")}</p>`}
        </div>
        <form class="ai-chat__form" id="ai-chat-form">
          <input class="field__input" id="ai-chat-input" type="text" placeholder="${REBUILT.t("ai.tell_me_about_your_day")}" autocomplete="off" />
          <button type="submit" class="btn btn--primary" id="ai-chat-submit">${REBUILT.t("ai.send")}</button>
        </form>
      </section>

      <section class="card">
        <div class="card__head"><h2 class="card__title">${REBUILT.t("ai.what_rebuilt_ai_sees_about")}</h2></div>
        <ul class="ai-context">
          <li>${REBUILT.Icons.svg("user")}${ctx.user.name ? escapeHTML(ctx.user.name) : REBUILT.t("ai.no_name_set_yet")}</li>
          <li>${REBUILT.t("ai.goals", { p1: REBUILT.Icons.svg("target"), p2: ctx.userProfile.goals.length ? escapeHTML(ctx.userProfile.goals.join(REBUILT.t("ai.text"))) : REBUILT.t("ai.nothing_yet") })}</li>
          <li>${REBUILT.t("ai.skills", { p1: REBUILT.Icons.svg("sparkles"), p2: ctx.userProfile.skills.length ? escapeHTML(ctx.userProfile.skills.join(REBUILT.t("ai.text"))) : REBUILT.t("ai.nothing_yet") })}</li>
          <li>${REBUILT.t("ai.active_habits", { p1: REBUILT.Icons.svg("flame"), length: ctx.activeHabits.length })}</li>
          <li>${REBUILT.t("ai.open_tasks", { p1: REBUILT.Icons.svg("tasks"), length: ctx.openTasks.length })}</li>
          <li>${REBUILT.t("ai.today_s_progress", { p1: REBUILT.Icons.svg("trend") })} <bdi>${ctx.today.progress.pct}%</bdi></li>
        </ul>
      </section>
    `;
  }

  function bubble(msg) {
    return `<div class="ai-bubble ai-bubble--${msg.role === "user" ? "user" : "assistant"}">${escapeHTML(msg.text)}</div>`;
  }

  function typingBubble() {
    return `<div class="ai-bubble ai-bubble--assistant ai-bubble--typing" id="ai-typing-bubble">
      <span class="ai-typing-dot"></span><span class="ai-typing-dot"></span><span class="ai-typing-dot"></span>
    </div>`;
  }

  function afterRender(container, state) {
    const form = document.getElementById("ai-chat-form");
    const input = document.getElementById("ai-chat-input");
    const log = document.getElementById("ai-chat-log");
    if (!form) return;
    if (log) log.scrollTop = log.scrollHeight;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      input.disabled = true;
      const submitBtn = document.getElementById("ai-chat-submit");
      if (submitBtn) submitBtn.disabled = true;

      // Show the user's message and a typing indicator right away, without
      // a full re-render (which would rebuild the whole page). The real
      // response — from either mode — replaces this via the full re-render
      // once REBUILT.AI.Service.sendMessage resolves.
      if (log) {
        log.insertAdjacentHTML("beforeend", bubble({ role: "user", text }));
        log.insertAdjacentHTML("beforeend", typingBubble());
        log.scrollTop = log.scrollHeight;
      }

      try {
        await REBUILT.AI.Service.sendMessage(state, text);
      } finally {
        REBUILT.Storage.save(state);
        REBUILT.Router.renderCurrent();
      }
    });
  }

  return { render, afterRender };
})();
