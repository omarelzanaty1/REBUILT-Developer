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
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Theme = (function () {
  const PREFS = ["dark", "light", "system"];
  const DEFAULT_PREF = "dark";
  const CHROME = { dark: "#201F19", light: "#F6F4EC" }; // browser UI colour (mobile address bar)

  let pref = DEFAULT_PREF;
  const listeners = [];
  let media = null;

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

  function setPref(next) {
    if (!PREFS.includes(next) || next === pref) return false;
    pref = next;
    if (REBUILT.Prefs) REBUILT.Prefs.write({ theme: next });
    apply();
    emit();
    return true;
  }

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
      const onSystem = () => { if (pref === "system") { apply(); emit(); } };
      if (media.addEventListener) media.addEventListener("change", onSystem);
      else if (media.addListener) media.addListener(onSystem);
    } catch (err) { /* no matchMedia: "system" then means dark */ }
    return pref;
  }

  init();
  return { PREFS, getPref, getResolved, setPref, onChange, init };
})();
