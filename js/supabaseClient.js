/* ============================================================
   REBUILT — supabaseClient.js
   Creates the single Supabase client used by the whole app.

   NOTE ON KEYS: the URL and the publishable ("anon") key below are
   designed to be public — they ship in every Supabase browser app,
   exactly like a Firebase config. They grant no data access on their
   own: every table has Row Level Security, so a request only ever
   returns rows belonging to the signed-in user. The SERVICE ROLE key
   is the real secret and must NEVER appear in this file or anywhere
   else in frontend code.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.SupabaseClient = (function () {
  /*
   * TWO ENVIRONMENTS, TWO BACKENDS.  Which Supabase project the page talks to is decided here, from the
   * address the page was loaded from (see channelFor):
   *   - "stable" (getrebuilt.online) is the only channel that uses the production project (real users).
   *   - every other address — development, localhost, anything unrecognised — uses the DEVELOPMENT
   *     project, so a development test can never read or write the real users' data by accident.
   * While the development project does not exist yet its entry below is empty, and the app then runs in
   * its browser-only local mode (no request leaves the page for Supabase) — see docs/ENVIRONMENTS.md.
   * Only PUBLISHABLE keys go here (they are public by design, protected by Row Level Security).
   */
  const PROFILES = {
    stable: {
      url: "https://jvyhtpfedkypwdzyadba.supabase.co",
      anonKey: "sb_publishable_TLPC-KjlYAn34x-ry2qI0w_xoPwjIng",
    },
    development: {
      url: "", // <- the development project's URL, once it has been created (never the production one)
      anonKey: "", // <- its publishable key
    },
  };

  const loc = (typeof window !== "undefined" && window.location) || {};
  const CHANNEL = channelFor(loc.hostname, loc.pathname);
  const PROFILE = CHANNEL === "stable" ? "stable" : "development";
  // CONFIG stays {url, anonKey} for its other readers (auth.js); channel/profile are extra, read-only facts.
  const CONFIG = Object.assign({ channel: CHANNEL, profile: PROFILE }, PROFILES[PROFILE]);

  let client = null;
  let lastError = null;

  function init() {
    if (client) return client;

    // Deliberately do NOT cache the failure: if supabase-js arrives late
    // (slow CDN), a later call can still succeed instead of being locked
    // into local mode forever.
    if (typeof window.supabase === "undefined" || !window.supabase.createClient) {
      lastError = "supabase-js library not loaded (CDN blocked, offline, or script tag missing)";
      return null;
    }
    if (!CONFIG.url || !CONFIG.anonKey) {
      lastError = PROFILE === "development"
        ? "no Supabase project is configured for the " + CHANNEL + " channel yet (by design it never uses the production project) - running in local mode"
        : "Supabase config missing (url/anonKey empty)";
      return null;
    }

    try {
      client = window.supabase.createClient(CONFIG.url, CONFIG.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          // E-mail links come back as  …/#access_token=…&type=recovery  (see auth.js → recovery).
          // Stated explicitly so a future library default can't silently switch the links to ?code=.
          flowType: "implicit",
        },
      });
      lastError = null;
      return client;
    } catch (err) {
      lastError = "createClient threw: " + err.message;
      return null;
    }
  }

  /** True when we have a usable Supabase client — callers use this to pick their backend. */
  function isAvailable() {
    return !!init();
  }

  function get() {
    return init();
  }

  function getError() {
    return lastError;
  }

  /**
   * Which deployment is this page running on?  Worked out from the address the page was
   * loaded from — never from a setting that could be copied from one repository to the other.
   *   stable       real users: getrebuilt.online (GitHub Pages of the official repository, which also
   *                answers on omarelzanaty1.github.io/rebuilt0.4/ and redirects to the domain)
   *   development  the private Development repository's site: omarelzanaty1.github.io/REBUILT-Developer/
   *                (and the retired Vercel addresses, *.vercel.app)
   *   local        localhost / a file opened from disk
   *   unknown      any other address - treated like development for the backend (never production);
   *                add a new official address here, and to tests/auth.test.js, when one is introduced
   * (See docs/ENVIRONMENTS.md.)
   */
  function channelFor(hostname, pathname) {
    const h = String(hostname || "").toLowerCase();
    const p = String(pathname || "/").toLowerCase();
    if (!h || h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1" || h.endsWith(".localhost")) return "local";
    if (h === "getrebuilt.online" || h === "www.getrebuilt.online") return "stable";
    if (h === "omarelzanaty1.github.io") {
      if (p === "/rebuilt-developer" || p.indexOf("/rebuilt-developer/") === 0) return "development";
      if (p === "/rebuilt0.4" || p.indexOf("/rebuilt0.4/") === 0) return "stable";
      return "unknown";
    }
    if (h.endsWith(".vercel.app")) return "development";
    return "unknown";
  }

  /** The build marker of the page being served (the <meta name="rebuilt-build"> in index.html). */
  function buildMarker() {
    try {
      const m = document.querySelector('meta[name="rebuilt-build"]');
      return m ? m.getAttribute("content") : null;
    } catch (e) {
      return null;
    }
  }

  /** What a page does on load: say which channel it is on, and keep search engines off development. */
  function markChannel() {
    try {
      document.documentElement.setAttribute("data-channel", CHANNEL);
      if (CHANNEL === "development") {
        const m = document.createElement("meta");
        m.name = "robots";
        m.content = "noindex, nofollow";
        document.head.appendChild(m);
      }
    } catch (e) { /* cosmetic only */ }
  }

  /**
   * Self-service diagnostic. Run `REBUILT.diagnose()` in the browser console
   * on the live site to see exactly why the app is in local vs supabase mode.
   */
  function diagnose() {
    const libLoaded = typeof window.supabase !== "undefined" && !!window.supabase.createClient;
    const c = init();
    return {
      build: buildMarker(),
      channel: CHANNEL,
      backend: PROFILE === "stable" ? "production project" : CONFIG.url ? "development project" : "none yet (local mode)",
      host: loc.host,
      mode: c ? "supabase (REAL AUTH)" : "local (FALLBACK)",
      supabaseJsLoaded: libLoaded,
      clientCreated: !!c,
      configuredUrl: CONFIG.url,
      keyPresent: !!CONFIG.anonKey,
      keyPrefix: CONFIG.anonKey ? CONFIG.anonKey.slice(0, 18) + "..." : null,
      reasonIfLocal: c ? null : lastError,
    };
  }

  markChannel();

  return { init, isAvailable, get, getError, diagnose, channelFor, buildMarker, markChannel, CONFIG, PROFILES };
})();

// Console shortcut so it can be checked on the deployed site without digging.
window.REBUILT.diagnose = function () {
  const d = REBUILT.SupabaseClient.diagnose();
  console.table(d);
  return d;
};
