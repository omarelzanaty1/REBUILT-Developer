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
     I18n.missing(), and warned about once in the console). A key that
     exists in no language shows NOTHING — a person never sees a
     programmer's key — and is warned about in the console the same way.
   - The dictionaries are many small files, so they are CHECKED before
     the first screen is drawn (I18n.ready(), called by App.init): every
     namespace of the language in use (and of Arabic, the fallback) must
     be registered and must have the same keys in both languages. What is
     missing or out of step is fetched again (cache-busted, retried); if
     it still is not there the app draws anyway with the fallback, keeps
     retrying in the background, and redraws by itself when it arrives.
     Nothing is ever half-translated "for good".
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

  /** Every dictionary namespace (js/locales/<lang>/<ns>.js). tests/i18n.test.js checks this list against the files on disk
   *  and the <script> lines of index.html, so a new namespace cannot be forgotten here. */
  const NAMESPACES = ["common", "messages", "data", "settings", "gate", "auth", "dashboard", "habits", "tasks", "goals", "planner", "profile", "analytics", "achievements", "ai"];

  const dicts = {};            // lang -> { "ns.key": string | function }
  const nsKeys = {};           // "lang|ns" -> the keys that file registered (for the integrity check)
  const listeners = [];
  const missingKeys = {};      // "lang|key" -> true, for the console and the tests
  const warned = {};           // "lang|key" -> true: each problem is written to the console once
  let current = DEFAULT_LANG;
  let live = false;            // true once the first screen has been drawn: a dictionary arriving after that redraws it
  let notifyTimer = null;

  /* ---------------- dictionaries ---------------- */

  function add(lang, ns, entries) {
    const store = dicts[lang] || (dicts[lang] = {});
    Object.keys(entries).forEach((k) => {
      const full = ns + "." + k;
      store[full] = entries[k];
      delete missingKeys[lang + "|" + full]; delete missingKeys["*|" + full];   // missing() says what is missing NOW
    });
    nsKeys[lang + "|" + ns] = Object.keys(entries);
    if (live && (lang === current || lang === DEFAULT_LANG)) notifySoon();
  }

  /** A dictionary that arrived after the first draw (a retry that finally worked): redraw what is on show, once. */
  function notifySoon() {
    if (notifyTimer) return;
    notifyTimer = setTimeout(() => {
      notifyTimer = null;
      try { translateStatic(); } catch (err) { /* no document (unit tests) */ }
      listeners.slice().forEach((fn) => { try { fn(current); } catch (err) { console.warn("REBUILT: a language listener failed", err); } });
    }, 40);
  }

  const interpolate = (str, params) =>
    params ? str.replace(/\{(\w+)\}/g, (whole, name) => (params[name] === undefined || params[name] === null ? whole : String(params[name]))) : str;

  function lookup(lang, key) {
    const d = dicts[lang];
    return d ? d[key] : undefined;
  }

  /** Say it in the console, once per language + key (never to the person). */
  function warnOnce(tag, key, what) {
    const id = tag + "|" + key;
    if (warned[id]) return;
    warned[id] = true;
    try { console.warn("REBUILT i18n: " + what + " — \"" + key + "\" (" + current + ")"); } catch (err) { /* no console */ }
  }

  function t(key, params) {
    let v = lookup(current, key);
    if (v === undefined && current !== DEFAULT_LANG) {
      v = lookup(DEFAULT_LANG, key);
      if (v !== undefined) { missingKeys[current + "|" + key] = true; warnOnce(current, key, "not translated, showing " + DEFAULT_LANG); }
    }
    if (v === undefined) {
      missingKeys["*|" + key] = true;
      warnOnce("*", key, "unknown key, showing nothing");
      return "";   // never the key itself: a person must not see a programmer's name instead of a word
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

  /* ---------------- integrity: are the dictionaries all here, and from one build? ---------------- */

  // Where the dictionary files live, and which build asked for them: the same folder and the same ?v=<build> as THIS file,
  // so a retry fetches the very build the page was served from (index.html is stamped with the build at publish time).
  let BASE = "js/", QUERY = "";
  try {
    const me = document.currentScript || document.querySelector('script[src*="i18n.js"]');
    if (me && me.src) { const u = new URL(me.src); BASE = new URL(".", u).href; QUERY = u.search; }
  } catch (err) { /* no document (unit tests): relative URLs */ }

  const localeUrl = (lang, ns, attempt) =>
    BASE + "locales/" + lang + "/" + ns + ".js" + QUERY + (attempt ? (QUERY ? "&" : "?") + "r=" + attempt + "-" + Date.now() : "");

  /** Fetch + run one script. Replaceable (tests). Rejects on a network error and after `timeoutMs`. */
  function loadScript(url, timeoutMs) {
    return new Promise((ok, fail) => {
      const el = document.createElement("script");
      const timer = setTimeout(() => { el.remove(); fail(new Error("timed out: " + url)); }, timeoutMs || 5000);
      el.async = true;
      el.onload = () => { clearTimeout(timer); el.remove(); ok(); };
      el.onerror = () => { clearTimeout(timer); el.remove(); fail(new Error("could not load " + url)); };
      el.src = url;
      document.head.appendChild(el);
    });
  }
  const loader = { load: loadScript };

  /** What is wrong with the dictionaries of these languages: a namespace that never registered, or one whose keys differ from its Arabic twin. */
  function problems(langs) {
    const out = [];
    langs.forEach((lang) => {
      NAMESPACES.forEach((ns) => {
        const mine = nsKeys[lang + "|" + ns];
        if (!mine) { out.push({ lang, ns, why: "missing" }); return; }
        if (lang === DEFAULT_LANG) return;
        const base = nsKeys[DEFAULT_LANG + "|" + ns];
        if (!base) return;   // reported as the Arabic file's own problem
        const a = new Set(mine), b = new Set(base);
        if (a.size !== b.size || base.some((k) => !a.has(k)) || mine.some((k) => !b.has(k))) {
          out.push({ lang, ns, why: "out of step with " + DEFAULT_LANG });
          out.push({ lang: DEFAULT_LANG, ns, why: "out of step with " + lang });   // either side may be the stale one: fetch both again
        }
      });
    });
    const seen = {};
    return out.filter((p) => { const id = p.lang + "|" + p.ns; if (seen[id]) return false; seen[id] = true; return true; });
  }

  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  let healing = false;

  /**
   * Make sure the dictionaries of the language in use (and of Arabic, the fallback) are complete and in step, fetching again
   * what is not. Resolves { ok, left } — never rejects. Called by App.init before the first screen is drawn; costs nothing
   * (no request, no timer) when everything is already there, which is the normal case.
   */
  async function ready(opts) {
    const o = Object.assign({ rounds: 3, budgetMs: 8000, loadMs: 4000 }, opts || {});
    const langs = current === DEFAULT_LANG ? [DEFAULT_LANG] : [current, DEFAULT_LANG];
    const t0 = Date.now();
    let todo = problems(langs);
    for (let round = 1; todo.length && round <= o.rounds && Date.now() - t0 < o.budgetMs; round++) {
      await Promise.all(todo.map((p) =>
        Promise.resolve().then(() => loader.load(localeUrl(p.lang, p.ns, round), o.loadMs)).catch((err) => {
          try { console.warn("REBUILT i18n: could not fetch " + p.lang + "/" + p.ns + " (" + p.why + "), try " + round + " — " + (err && err.message)); } catch (e) { /* no console */ }
        })));
      todo = problems(langs);
      if (todo.length) await wait(Math.min(250 * round, o.budgetMs - (Date.now() - t0)));
    }
    live = true;   // from here a dictionary that shows up late redraws the screen
    if (todo.length) {
      try { console.error("REBUILT i18n: the dictionaries are not complete yet (" + todo.map((p) => p.lang + "/" + p.ns).join(", ") + ") — drawing with the fallback and retrying in the background"); } catch (e) { /* no console */ }
      heal(o);
    }
    return { ok: todo.length === 0, left: todo };
  }

  /** Background retries after the first draw gave up: 5 s, 15 s, 45 s. Whatever arrives redraws the screen (see add()). */
  function heal(o) {
    if (healing) return;
    healing = true;
    (async () => {
      for (const ms of [5000, 15000, 45000]) {
        await wait(ms);
        if (!problems(current === DEFAULT_LANG ? [DEFAULT_LANG] : [current, DEFAULT_LANG]).length) break;
        await ready(Object.assign({}, o, { rounds: 1, budgetMs: 6000 }));
      }
      healing = false;
    })();
  }

  /** Is this language's dictionary complete (every namespace registered)? — for the tests and the console. */
  const isComplete = (lang) => NAMESPACES.every((ns) => nsKeys[lang + "|" + ns]);

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
    // Only the language in use was checked at start-up, so the one just chosen may have lost a file back then. Check now:
    // whatever has to be fetched again redraws the screen by itself when it arrives (see add()). A no-op when all is there.
    if (problems(code === DEFAULT_LANG ? [DEFAULT_LANG] : [code, DEFAULT_LANG]).length) ready();
    return true;
  }

  function onChange(fn) {
    listeners.push(fn);
    return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
  }

  const api = { DEFAULT_LANG, NAMESPACES, add, t, has, missing, keysOf, raw, plural, number, date, time, weekdays, lang, dir, isRTL, languages, init, setLang, onChange, apply, translateStatic, ready, problems: () => problems(current === DEFAULT_LANG ? [DEFAULT_LANG] : [current, DEFAULT_LANG]), isComplete, _loader: loader };
  return api;
})();

/** Short alias for templates: REBUILT.t("tasks.empty.title") */
REBUILT.t = (key, params) => REBUILT.I18n.t(key, params);
REBUILT.I18n.init();
