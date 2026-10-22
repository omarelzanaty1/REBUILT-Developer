/* ============================================================
   REBUILT — pages/aiComingSoon.js
   Temporary "coming soon" screen for the REBUILT AI route.

   While the assistant is still being built, the `ai` route renders
   this static page instead of the chat. It makes NO network requests
   and needs no model API key — it is plain markup.

   The real chat page (pages/ai.js), the AI service layer (ai.js), the
   `ai-chat` Edge Function and the ai_conversations table are all left
   exactly as they were. The chat module is just re-registered as
   REBUILT.Pages.aiChat so nothing in it is lost or unreachable.

   To turn the chat back on later: set AI_CHAT_ENABLED to true (or
   remove this script tag from index.html). Nothing else changes.
   ============================================================ */

window.REBUILT = window.REBUILT || {};
REBUILT.Pages = REBUILT.Pages || {};

(function () {
  const AI_CHAT_ENABLED = false;
  if (AI_CHAT_ENABLED) return;

  // Keep the real chat page around, unrouted, for future activation.
  REBUILT.Pages.aiChat = REBUILT.Pages.ai;

  // Decorative only (aria-hidden): the app's own level-ring motif, nearly
  // full, with the assistant's spark inside it — growth, with help on the way.
  const VISUAL = `
    <svg class="ai-soon__svg" viewBox="0 0 240 240" aria-hidden="true" focusable="false">
      <circle class="ai-soon__ring-track" cx="120" cy="120" r="88" />
      <circle class="ai-soon__ring-arc" cx="120" cy="120" r="88" transform="rotate(-90 120 120)" />
      <circle class="ai-soon__ring-halo" cx="32.2" cy="114.5" r="13" />
      <circle class="ai-soon__ring-node" cx="32.2" cy="114.5" r="6.5" />
      <circle class="ai-soon__disc" cx="120" cy="120" r="62" />
      <g class="ai-soon__spark">
        <path class="ai-soon__spark-main" d="M120 88 C122.5 108 132 117.5 152 120 C132 122.5 122.5 132 120 152 C117.5 132 108 122.5 88 120 C108 117.5 117.5 108 120 88 Z" />
      </g>
      <path class="ai-soon__spark-small" transform="translate(147 90) scale(0.34) translate(-120 -120)" d="M120 88 C122.5 108 132 117.5 152 120 C132 122.5 122.5 132 120 152 C117.5 132 108 122.5 88 120 C108 117.5 117.5 108 120 88 Z" />
      <path class="ai-soon__spark-small" transform="translate(95 153) scale(0.24) translate(-120 -120)" d="M120 88 C122.5 108 132 117.5 152 120 C132 122.5 122.5 132 120 152 C117.5 132 108 122.5 88 120 C108 117.5 117.5 108 120 88 Z" />
    </svg>`;

  REBUILT.Pages.ai = {
    render() {
      return `
        <section class="page-header">
          <h1 class="page-header__title">REBUILT AI</h1>
        </section>

        <section class="card ai-soon">
          <div class="ai-soon__content">
            <span class="ai-soon__badge"><span class="ai-soon__dot"></span>قريبًا</span>
            <h2 class="ai-soon__heading">مساعدك الذكي قريبًا</h2>
            <p class="ai-soon__text">مساعدك الذكي يتم تطويره حاليًا علشان يساعدك في تنظيم يومك، وتتابع أهدافك، وتبني نظام حياة يناسبك.</p>
            <button type="button" class="btn btn--primary ai-soon__cta" data-nav="dashboard">العودة إلى الرئيسية</button>
          </div>
          <div class="ai-soon__visual">${VISUAL}</div>
        </section>
      `;
    },
  };
})();
