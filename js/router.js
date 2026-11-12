/* ============================================================
   REBUILT — router.js
   Single-screen app shell: swap the page rendered into #page-content.
   The URL hash mirrors the page ("#goals") so refresh / back-forward /
   deep links work; anything else in the hash (e.g. Supabase's
   "#access_token=…") is ignored.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Router = (function () {
  const PAGES = {
    get dashboard() { return REBUILT.t("common.home"); },
    get habits() { return REBUILT.t("common.habits"); },
    get tasks() { return REBUILT.t("common.tasks"); },
    get goals() { return REBUILT.t("common.goals"); },
    get planner() { return REBUILT.t("common.my_day"); },
    get analytics() { return REBUILT.t("common.analytics"); },
    get achievements() { return REBUILT.t("common.achievements"); },
    ai: "REBUILT AI",
    get profile() { return REBUILT.t("common.profile"); },
    get settings() { return REBUILT.t("common.settings"); },
  };
  const PAGE_ORDER = Object.keys(PAGES);
  let current = "dashboard";

  function pageModule(name) {
    return REBUILT.Pages[name] || REBUILT.Pages.dashboard;
  }

  /** Page named by the URL hash (e.g. "#ai"), or null. */
  function pageFromHash() {
    const name = (window.location.hash || "").replace(/^#\/?/, "");
    return PAGE_ORDER.includes(name) ? name : null;
  }

  /** Keep the address bar in step with the page, without adding history entries. */
  function syncHash(name) {
    try {
      if (window.location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
    } catch (err) {
      // Some sandboxed/embedded contexts refuse this — the URL is a convenience only.
    }
  }

  /** The tab title follows the page and the language. */
  function refreshTitle() {
    document.title = (current === "dashboard" ? "" : PAGES[current] + " — ") + "REBUILT";
  }

  function navigateTo(name) {
    if (!PAGE_ORDER.includes(name)) name = "dashboard";
    const changed = name !== current || !document.getElementById("page-content").firstElementChild;
    current = name;
    syncHash(name);
    renderCurrent({ animate: changed });
    REBUILT.Shell.setActive(name);
    refreshTitle();
    if (changed) {
      window.scrollTo(0, 0);
      const content = document.getElementById("page-content");
      // Move keyboard / screen-reader focus to the new page without scrolling.
      if (content) content.focus({ preventScroll: true });
    }
  }

  /** Re-render the current page after a state change (no entrance animation, scroll stays put). */
  function renderCurrent(opts) {
    const state = REBUILT.App.state;
    const mod = pageModule(current);
    const content = document.getElementById("page-content");
    if (!content) return;
    const y = window.scrollY;
    content.innerHTML = mod.render(state);
    if (opts && opts.animate) {
      content.classList.remove("page-enter");
      void content.offsetWidth; // restart animation
      content.classList.add("page-enter");
    } else {
      window.scrollTo(0, y);
    }
    if (typeof mod.afterRender === "function") mod.afterRender(content, state);
    REBUILT.Shell.update(state);
  }

  function getCurrent() {
    return current;
  }

  // Typing/pasting a route (e.g. ".../#ai") while the app is already open.
  window.addEventListener("hashchange", () => {
    const target = pageFromHash();
    const app = document.getElementById("app");
    const appVisible = app && !app.hidden;
    if (target && target !== current && appVisible && REBUILT.App && REBUILT.App.state) navigateTo(target);
  });

  return { navigateTo, renderCurrent, refreshTitle, getCurrent, pageFromHash, PAGE_ORDER };
})();
