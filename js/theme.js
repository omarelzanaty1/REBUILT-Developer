/* ============================================================
   REBUILT — theme.js
   Dark / Light / System. The whole palette lives in css/tokens.css as
   CSS variables; this file only decides WHICH set is active and tells
   the page: <html data-theme="dark|light"> (the colours in use) and
   data-theme-pref="dark|light|system" (what the person chose).

   - "System" follows the device live (prefers-color-scheme).
   - The choice is stored by REBUILT.Prefs; index.html applies it in an
     inline script before the first paint, so there is no flash.
   - Dark is the default: it is the product's identity.

   The CHANGE itself goes through ONE place, setPref() below, so every screen behaves the same (sign-in, sign-up,
   password recovery, onboarding, Settings…). A person who taps a theme button sees a CIRCULAR REVEAL: a circle of the
   new theme grows from the centre of the tapped button until it covers the screen (~700 ms), and the colours change as it
   spreads. Callers only say WHERE they tapped:  REBUILT.Theme.setPref("light", { origin: buttonElement }).
     - Chrome-family / Safari / Firefox with document.startViewTransition(): the old screen is frozen as a picture and the
       new one is revealed through an animated clip-path circle() (css/base.css holds the matching rules).
     - Browsers without it: a short colour fade (the .theme-fade class), then the screen is drawn again.
     - prefers-reduced-motion (or the in-app "reduce motion" setting): the theme changes at once, nothing moves.
     - Only one change runs at a time: a new tap finishes the one in flight (jumps to its end) and starts its own.
     - Nothing animates when the colours would not change (picking "System" on a dark device that already shows dark),
       and the device switching light/dark by itself (System mode) is applied at once — never a surprise animation.
   Nothing here touches the saved data, the language files or the account: only the preference (REBUILT.Prefs) and the
   <html> attributes.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Theme = (function () {
  const PREFS = ["dark", "light", "system"];
  const DEFAULT_PREF = "dark";
  const CHROME = { dark: "#201F19", light: "#F6F4EC" }; // browser UI colour (mobile address bar)
  const REVEAL_MS = 700;                                  // the circle, from the tapped button to the far corner
  const REVEAL_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
  const FADE_MS = 420;                                    // the fallback when the browser cannot do the reveal

  let pref = DEFAULT_PREF;
  const listeners = [];
  let media = null;
  let hooked = false;  // the language hook is added once
  let active = null;   // the change in flight: { kind: "reveal" | "fade", finish() } — never more than one

  const prefersLight = () => {
    try { return !!(window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches); } catch (err) { return false; }
  };
  const resolve = (p) => (p === "system" ? (prefersLight() ? "light" : "dark") : p);

  function apply() {
    const resolved = resolve(pref);
    const el = document.documentElement;
    el.setAttribute("data-theme", resolved);
    el.setAttribute("data-theme-pref", pref);
    const chrome = document.querySelector('meta[name="theme-color"]');
    if (chrome) chrome.setAttribute("content", CHROME[resolved]);
    const scheme = document.querySelector('meta[name="color-scheme"]');
    if (scheme) scheme.setAttribute("content", resolved);
  }

  function emit() {
    listeners.slice().forEach((fn) => { try { fn(getResolved(), pref); } catch (err) { console.warn("REBUILT: a theme listener failed", err); } });
  }

  const getPref = () => pref;
  const getResolved = () => resolve(pref);

  /* ---------- the change, with its motion ---------- */

  const reducedMotion = () => {
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
      return !!(document.body && document.body.classList.contains("reduce-motion")); // the in-app setting
    } catch (err) { return false; }
  };
  const canReveal = () => typeof document.startViewTransition === "function" && document.visibilityState !== "hidden";
  const shown = () => document.documentElement.getAttribute("data-theme");

  /** Viewport coordinates of the centre of what the person tapped (an element), or of the screen when nothing is given. */
  function centreOf(origin) {
    try {
      if (origin && typeof origin.getBoundingClientRect === "function") {
        const r = origin.getBoundingClientRect();
        if (r.width || r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      if (origin && isFinite(origin.x) && isFinite(origin.y)) return { x: Number(origin.x), y: Number(origin.y) };
    } catch (err) { /* fall through */ }
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }

  /** Finish whatever is in flight right now: the screen jumps to its end state. Safe to call at any time. */
  function finishNow() {
    const job = active;
    if (!job) return;
    active = null;
    try { job.finish(); } catch (err) { /* nothing to undo */ }
  }

  /** The circular reveal. `update` redraws the page in the new theme; it runs inside the browser's snapshot window. */
  function reveal(update, from) {
    const root = document.documentElement;
    const x = from.x, y = from.y;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 2; // to the farthest corner
    root.classList.add("theme-reveal");
    let vt;
    try { vt = document.startViewTransition(() => { update(); }); } catch (err) { root.classList.remove("theme-reveal"); update(); return; }
    const job = { kind: "reveal", finish() { try { vt.skipTransition(); } catch (err) { /* already over */ } root.classList.remove("theme-reveal"); } };
    active = job;
    const over = () => { if (active === job) { active = null; root.classList.remove("theme-reveal"); } };
    vt.ready.then(() => {
      if (active !== job) return; // finished or replaced while the browser was taking its snapshot
      root.animate(
        { clipPath: ["circle(0px at " + x + "px " + y + "px)", "circle(" + radius + "px at " + x + "px " + y + "px)"] },
        { duration: REVEAL_MS, easing: REVEAL_EASE, pseudoElement: "::view-transition-new(root)" }
      );
    }).catch(() => { /* skipped: the new screen is already there */ });
    vt.finished.then(over, over);
    vt.updateCallbackDone.catch(() => { /* a redraw that threw is already reported by its own listener */ });
  }

  /** The fallback: the colours cross-fade (existing elements), then the page is drawn again with the matching logos / icons. */
  function fade(applyNow, redraw) {
    const root = document.documentElement;
    root.classList.add("theme-fade");
    void root.offsetWidth; // the class must be in force before the colours change
    applyNow();
    let timer = null, done = false;
    const end = () => { if (done) return; done = true; clearTimeout(timer); root.classList.remove("theme-fade"); if (active === job) active = null; redraw(); };
    const job = { kind: "fade", finish: end };
    active = job;
    timer = setTimeout(end, FADE_MS);
  }

  /** Choose the theme. `opts.origin` (an element, or {x, y}) is where the circle starts; `opts.animate === false` forbids motion. */
  function setPref(next, opts) {
    if (!PREFS.includes(next) || next === pref) return false;
    const o = opts || {};
    const before = shown();
    finishNow();                                   // one change at a time: a new tap ends the one in flight
    const from = centreOf(o.origin);               // measured NOW — the button is drawn again by the change
    pref = next;
    if (REBUILT.Prefs) REBUILT.Prefs.write({ theme: next }); // saved first: a refresh in the middle keeps the choice
    const update = () => { apply(); emit(); };
    const differs = resolve(next) !== before;
    if (!differs || o.animate === false || reducedMotion()) { update(); return true; }
    if (canReveal()) reveal(update, from); else fade(apply, emit);
    return true;
  }

  function isAnimating() { return !!active; }

  function onChange(fn) {
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }

  function init() {
    const saved = REBUILT.Prefs ? REBUILT.Prefs.read().theme : null;
    pref = PREFS.includes(saved) ? saved : DEFAULT_PREF;
    apply();
    try {
      media = window.matchMedia("(prefers-color-scheme: light)");
      const onSystem = () => { if (pref === "system") { finishNow(); apply(); emit(); } }; // the device decided: at once, no motion
      if (media.addEventListener) media.addEventListener("change", onSystem);
      else if (media.addListener) media.addListener(onSystem);
    } catch (err) { /* no matchMedia: "system" then means dark */ }
    // A language change redraws everything: end a reveal in flight first so the two never fight over the same screen.
    if (!hooked && REBUILT.I18n && typeof REBUILT.I18n.onChange === "function") { hooked = true; REBUILT.I18n.onChange(finishNow); }
    return pref;
  }

  init();
  return { PREFS, REVEAL_MS, getPref, getResolved, setPref, onChange, init, isAnimating };
})();
