/* ============================================================
   REBUILT — modal.js
   One reusable dialog shell (centered on desktop, bottom sheet
   on phones — see components.css). Handles focus, Esc, focus
   trapping and scroll locking.

     Modal.open({ title, body, size, onMount, onClose })
     Modal.close()
     Modal.confirm({ title, text, confirmLabel, danger }) → Promise<boolean>

   confirm() is reserved for genuinely destructive / irreversible
   actions. Everything that can be undone uses an undo toast instead.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Modal = (function () {
  let root;
  let lastFocus = null;
  let onCloseCb = null;
  let closing = null;

  function ensureRoot() {
    if (!root) root = document.getElementById("modal-root");
    return root;
  }

  function focusables(container) {
    return Array.prototype.slice
      .call(container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
      .filter((el) => el.offsetParent !== null);
  }

  function open(opts) {
    const el = ensureRoot();
    if (!el) return;
    if (closing) { clearTimeout(closing); closing = null; }
    lastFocus = document.activeElement;
    onCloseCb = opts.onClose || null;

    el.innerHTML = `
      <div class="modal-overlay" data-modal-overlay>
        <div class="modal ${opts.size === "sm" ? "modal--sm" : ""}" role="${opts.role || "dialog"}" aria-modal="true" aria-labelledby="modal-title" tabindex="-1">
          <div class="modal__grab" aria-hidden="true"></div>
          <div class="modal__header">
            <h2 class="modal__title" id="modal-title">${opts.title || ""}</h2>
            <button type="button" class="icon-btn" data-modal-close aria-label="إغلاق">${REBUILT.Icons.close}</button>
          </div>
          <div class="modal__body">${opts.body}</div>
        </div>
      </div>
    `;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      const ov = el.querySelector(".modal-overlay");
      if (ov) ov.classList.add("is-visible");
    });

    const overlay = el.querySelector("[data-modal-overlay]");
    overlay.addEventListener("mousedown", (e) => {
      if (e.target === overlay) close();
    });
    el.querySelector("[data-modal-close]").addEventListener("click", () => close());
    document.addEventListener("keydown", keyHandler);

    const modal = el.querySelector(".modal");
    if (typeof opts.onMount === "function") opts.onMount(modal);

    // Initial focus: an explicit [autofocus], else the first field, else the dialog itself.
    const target = modal.querySelector("[autofocus]") || modal.querySelector(".modal__body .field__input, .modal__body input, .modal__body select, .modal__body textarea") || modal;
    setTimeout(() => target.focus({ preventScroll: true }), 30);
  }

  function keyHandler(e) {
    const el = ensureRoot();
    const modal = el && el.querySelector(".modal");
    if (!modal) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === "Tab") {
      const items = focusables(modal);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function isOpen() {
    const el = ensureRoot();
    return !!(el && el.querySelector(".modal-overlay"));
  }

  function close() {
    const el = ensureRoot();
    if (!el) return;
    const overlay = el.querySelector(".modal-overlay");
    if (!overlay) return;
    overlay.classList.remove("is-visible");
    document.removeEventListener("keydown", keyHandler);
    document.body.style.overflow = "";
    const cb = onCloseCb;
    onCloseCb = null;
    closing = setTimeout(() => {
      el.innerHTML = "";
      closing = null;
    }, 220);
    if (lastFocus && typeof lastFocus.focus === "function" && document.contains(lastFocus)) {
      try { lastFocus.focus({ preventScroll: true }); } catch (err) { /* element gone */ }
    }
    if (typeof cb === "function") cb();
  }

  /** Resolves true on confirm, false on cancel / Esc / click-away. Only for destructive actions. */
  function confirm(opts) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v) => {
        if (settled) return;
        settled = true;
        resolve(v);
      };
      open({
        title: opts.title || "متأكد؟",
        size: "sm",
        role: "alertdialog",
        body: `
          ${opts.text ? `<p class="modal__text">${opts.text}</p>` : ""}
          <div class="modal__footer">
            <button type="button" class="btn ${opts.danger ? "btn--danger-solid" : "btn--primary"}" data-confirm-yes>${opts.confirmLabel || "تأكيد"}</button>
            <button type="button" class="btn btn--secondary" data-confirm-no autofocus>${opts.cancelLabel || "إلغاء"}</button>
          </div>`,
        onMount: (modal) => {
          modal.querySelector("[data-confirm-yes]").addEventListener("click", () => { finish(true); close(); });
          modal.querySelector("[data-confirm-no]").addEventListener("click", () => { finish(false); close(); });
        },
        onClose: () => finish(false),
      });
    });
  }

  return { open, close, confirm, isOpen };
})();
