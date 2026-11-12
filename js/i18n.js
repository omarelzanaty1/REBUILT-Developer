/* ============================================================
   REBUILT — i18n.js
   The one translation system. Everything the app says to a person
   goes through  REBUILT.I18n.t("namespace.key", params).

   - Languages live in LANGS below (code, direction, formats). Adding
     one = add an entry here + a folder js/locales/<code>/ with one file
     per namespace + the <script> lines in index.html. No page changes.
   - Dictionaries are registered per language and namespace:
         REBUILT.I18n.add("en", "tasks", { "empty.title": "No tasks yet" });
     A value is a string with {placeholders}, or a function
     (params, I18n) => string for anything that needs a plural.
   - Arabic is the default and the fallback: a key a language has not
     translated yet shows the Arabic text (and is listed in
     I18n.missing()), never a bare key — except a key that exists in no
     language, which shows the key itself so it is impossible to miss.
   - What the person typed (habit and task titles, goals, notes, their
     name) is data, not interface: it is never translated or altered.
   - Strings are returned as the HTML the templates already build, so
     callers keep escaping user input with Components.esc() exactly as
     before. Translate at render time: never keep a translated string in
     a module-level constant (it would freeze the language it was
     loaded in); use a function, or call t() inside render().
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.I18n = (function () {
  const DEFAULT_LANG = "ar";

  const LANGS = {
    ar: {
      code: "ar", name: "العربية", dir: "rtl", // i18n-ignore: the language's own name
      locale: "ar-EG-u-nu-latn",   // dates: Arabic names, Latin digits (the product's numerals)
      numberLocale: "en-US",       // 1,234 — the same grouping the app always used
      time: (hhmm) => hhmm,        // 24-hour, as the app always showed it
    },
    en: {
      code: "en", name: "English", dir: "ltr",
      locale: "en-GB",             // 10 Nov, Tuesday 10 November
      numberLocale: "en-US",
      time: (hhmm) => {            // 5:00 PM
        const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
        if (!m) return hhmm || "";
        const h = Number(m[1]);
        return (h % 12 || 12) + ":" + m[2] + " " + (h < 12 ? "AM" : "PM");
      },
    },
  };

  const dicts = {};            // lang -> { "ns.key": string | function }
  const listeners = [];
  const missingKeys = {};      // "lang|key" -> true, for the console and the tests
  let current = DEFAULT_LANG;

  /* ---------------- dictionaries ---------------- */

  function add(lang, ns, entries) {
    const store = dicts[lang] || (dicts[lang] = {});
    Object.keys(entries).forEach((k) => { store[ns + "." + k] = entries[k]; });
  }

  const interpolate = (str, params) =>
    params ? str.replace(/\{(\w+)\}/g, (whole, name) => (params[name] === undefined || params[name] === null ? whole : String(params[name]))) : str;

  function lookup(lang, key) {
    const d = dicts[lang];
    return d ? d[key] : undefined;
  }

  function t(key, params) {
    let v = lookup(current, key);
    if (v === undefined && current !== DEFAULT_LANG) {
      v = lookup(DEFAULT_LANG, key);
      if (v !== undefined) missingKeys[current + "|" + key] = true;
    }
    if (v === undefined) {
      missingKeys["*|" + key] = true;
      return key;
    }
    return interpolate(typeof v === "function" ? String(v(params || {}, api)) : v, params);
  }

  const has = (key) => lookup(current, key) !== undefined || lookup(DEFAULT_LANG, key) !== undefined;

  /** The keys looked up that were not translated (for the console and the tests). */
  const missing = () => Object.keys(missingKeys);

  /** Every key registered for a language (used by the coverage test). */
  const keysOf = (lang) => Object.keys(dicts[lang] || {});

  /** The registered value itself (a string or a function) — for the tests. */
  const raw = (lang, key) => lookup(lang, key);

  /** Pick the plural form for n: forms = { zero, one, two, few, many, other } (only "other" is required). */
  function plural(n, forms) {
    let cat = "other";
    try { cat = new Intl.PluralRules(current).select(Number(n)); } catch (err) { /* old engine: "other" */ }
    const v = forms[cat] !== undefined ? forms[cat] : forms.other;
    return typeof v === "string" ? v.replace(/\{n\}/g, number(n)) : v;
  }

  /* ---------------- formats ---------------- */

  const cfg = () => LANGS[current];

  function number(n, opts) {
    try { return new Intl.NumberFormat(cfg().numberLocale, opts).format(Number(n)); } catch (err) { return String(n); }
  }

  /** "YYYY-MM-DD" (a calendar day, read as local), a Date, or a timestamp → localized text. */
  function date(value, opts) {
    const d = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + "T00:00:00") : new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(cfg().locale, opts || { day: "numeric", month: "short" });
  }

  /** "HH:MM" (how times are stored) → how this language shows a time of day. */
  const time = (hhmm) => cfg().time(hhmm);

  /** Names of the seven weekdays, Sunday first, in the active language (short, as the app shows them). */
  const weekdays = () => [0, 1, 2, 3, 4, 5, 6].map((i) => t("data.weekday." + i));

  /* ---------------- language ---------------- */

  function apply() {
    const el = document.documentElement;
    el.setAttribute("lang", cfg().code);
    el.setAttribute("dir", cfg().dir);
    el.setAttribute("data-lang", cfg().code);
  }

  /**
   * Static markup (index.html) can follow the language too:
   *   data-i18n="key"                      → the element's text
   *   data-i18n-attr="aria-label:key;content:key2" → those attributes
   */
  function translateStatic(root) {
    const scope = root || document;
    scope.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.getAttribute("data-i18n")); });
    scope.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      el.getAttribute("data-i18n-attr").split(";").forEach((pair) => {
        const at = pair.indexOf(":");
        if (at > 0) el.setAttribute(pair.slice(0, at).trim(), t(pair.slice(at + 1).trim()));
      });
    });
  }

  const lang = () => current;
  const dir = () => cfg().dir;
  const isRTL = () => cfg().dir === "rtl";
  const languages = () => Object.keys(LANGS).map((c) => ({ code: c, name: LANGS[c].name, dir: LANGS[c].dir }));

  /** Read the saved choice and apply it (called once at start-up; no listeners are told). */
  function init() {
    const saved = REBUILT.Prefs ? REBUILT.Prefs.read().lang : null;
    current = saved && LANGS[saved] ? saved : DEFAULT_LANG;
    apply();
    return current;
  }

  /** Switch language now: apply, remember on this device, tell every listener (they re-render). */
  function setLang(code) {
    if (!LANGS[code] || code === current) return false;
    current = code;
    if (REBUILT.Prefs) REBUILT.Prefs.write({ lang: code });
    apply();
    translateStatic();
    listeners.slice().forEach((fn) => { try { fn(code); } catch (err) { console.warn("REBUILT: a language listener failed", err); } });
    return true;
  }

  function onChange(fn) {
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }

  const api = { DEFAULT_LANG, add, t, has, missing, keysOf, raw, plural, number, date, time, weekdays, lang, dir, isRTL, languages, init, setLang, onChange, apply, translateStatic };
  return api;
})();

/** Short alias for templates: REBUILT.t("tasks.empty.title") */
REBUILT.t = (key, params) => REBUILT.I18n.t(key, params);
REBUILT.I18n.init();
