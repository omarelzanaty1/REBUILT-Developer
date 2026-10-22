/* ============================================================
   REBUILT — toast.js
   Small stacked toasts for everyday feedback (optionally with an
   action such as "تراجع"), plus one bigger celebratory overlay
   reserved for level-ups — the single orchestrated moment the
   rest of the UI stays quiet around.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Toast = (function () {
  let container;

  function ensureContainer() {
    if (!container) container = document.getElementById("toast-container");
    return container;
  }

  /** Accepts an icon key (REBUILT.Icons) — never emoji. */
  function iconHTML(icon) {
    return REBUILT.Icons.svg(REBUILT.Icons.has(icon) ? icon : "info");
  }

  /**
   * show({ text, icon, tone, duration, action:{ label, onClick } })
   * tone: 'default' | 'success' | 'xp' | 'achievement' | 'danger'
   * Returns { dismiss() }.
   */
  function show(opts) {
    const el = ensureContainer();
    if (!el) return { dismiss() {} };

    const toast = document.createElement("div");
    toast.className = "toast toast--" + (opts.tone || "default");
    toast.innerHTML = `
      <span class="toast__icon">${iconHTML(opts.icon)}</span>
      <span class="toast__text">${opts.text}</span>
      ${opts.action ? `<button type="button" class="toast__action">${opts.action.label}</button>` : ""}
    `;
    el.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("toast--in"));

    let timer;
    const dismiss = () => {
      clearTimeout(timer);
      if (!toast.isConnected) return;
      toast.classList.remove("toast--in");
      toast.classList.add("toast--out");
      setTimeout(() => toast.remove(), 300);
    };

    if (opts.action) {
      toast.querySelector(".toast__action").addEventListener("click", () => {
        dismiss();
        try { opts.action.onClick(); } catch (err) { console.warn("REBUILT: toast action failed", err); }
      });
    }
    timer = setTimeout(dismiss, opts.duration || (opts.action ? 6500 : 3200));
    return { dismiss };
  }

  function xpGain(amount) {
    show({ icon: "bolt", text: `<bdi class="num">+${amount} XP</bdi>`, tone: "xp", duration: 1800 });
  }

  function achievement(name, icon) {
    show({ icon: icon || "trophy", text: `إنجاز جديد: ${REBUILT.Components.esc(name)}`, tone: "achievement", duration: 4000 });
  }

  /** A brief confetti burst in brand colours — reserved for achievement unlocks. */
  function confetti() {
    const colors = ["#FFE504", "#FD662B", "#FFB500", "#F8F6EC"];
    const layer = document.createElement("div");
    layer.className = "confetti-layer";
    for (let i = 0; i < 20; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.left = 38 + Math.random() * 24 + "%";
      piece.style.background = colors[i % colors.length];
      piece.style.animationDelay = Math.random() * 120 + "ms";
      piece.style.setProperty("--drift", Math.random() * 180 - 90 + "px");
      layer.appendChild(piece);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 1500);
  }

  function error(text) {
    show({ icon: "alert", text, tone: "danger", duration: 3600 });
  }

  /** Full-screen celebratory overlay for level-ups. Removes itself on click or after a few seconds. */
  function levelUp(level, message) {
    const overlay = document.createElement("div");
    overlay.className = "levelup-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "مستوى جديد");
    overlay.innerHTML = `
      <div class="levelup-card">
        <div class="levelup-burst" aria-hidden="true"></div>
        <div class="levelup-label">LEVEL UP</div>
        <div class="levelup-number">${level}</div>
        <p class="levelup-message">${message}</p>
        <button type="button" class="btn btn--primary levelup-dismiss">تمام، يلا نكمل</button>
      </div>
    `;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("is-visible"));

    function close() {
      overlay.classList.remove("is-visible");
      setTimeout(() => overlay.remove(), 300);
    }
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
    overlay.querySelector(".levelup-dismiss").addEventListener("click", close);
    setTimeout(close, 6000);
  }

  return { show, xpGain, achievement, confetti, error, levelUp };
})();
