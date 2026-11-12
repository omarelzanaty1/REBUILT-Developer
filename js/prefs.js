/* ============================================================
   REBUILT — prefs.js
   The two choices that belong to this DEVICE, not to a record:
   the interface language and the colour theme. They live in one small
   localStorage key of their own (never in the app's data blob, so
   strict mode's "the browser copy is neither read nor written" is
   untouched) and survive sign-out / sign-in, because the sign-in
   screen itself has to be in the language the person chose.

     { "lang": "ar" | "en", "theme": "dark" | "light" | "system" }

   index.html reads the same key in a tiny inline script before the
   first paint, so the page never flashes in the wrong theme.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Prefs = (function () {
  const KEY = "rebuilt_prefs_v1";

  function read() {
    try {
      const raw = window.localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {}; // private mode / blocked storage / corrupt value: the defaults apply
    }
  }

  /** Merge `patch` into the stored preferences. Returns false when the browser refused to store. */
  function write(patch) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(Object.assign(read(), patch)));
      return true;
    } catch (err) {
      return false; // the choice still applies for this page view
    }
  }

  const has = (name) => Object.prototype.hasOwnProperty.call(read(), name);

  return { KEY, read, write, has };
})();
