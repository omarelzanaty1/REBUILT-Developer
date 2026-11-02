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

  /**
   * STRICT MODE — «a configured backend that fails is never hidden behind the local copy».
   * On when this page is NOT the stable channel AND the development project is filled in above:
   * from then on every failure to read or write the server is an error the person sees, the browser copy
   * (rebuilt_state_v1) is neither read nor written, and a missing library never turns into a device-only sign-in.
   * Off on the stable channel (its behaviour is unchanged until the owner approves promoting this), and off while the
   * development profile is empty (the deliberate local mode, used by the local-mode tests).
   * Derived from the address and the profile only — never from a setting that could be copied between repositories.
   */
  function mustUseBackend() {
    return PROFILE === "development" && !!(CONFIG.url && CONFIG.anonKey);
  }

  /* ---------------- Errors from the backend: one shape, one classification ---------------- */

  /**
   * What went wrong, in kinds the screen can speak about:
   *   network        the request never got an answer (offline, DNS, blocked, timeout)
   *   session        the sign-in is not valid any more (expired / revoked / signed out) — means «sign in again», not «database broken»
   *   permission     the server refused: no right on this table (RLS / grants)
   *   missing_table  the table or column does not exist in this project (database not prepared / out of date)
   *   server         the service itself answered with 5xx
   *   unknown        anything else
   * (BackendError also uses: unavailable — the library never loaded; profile_missing — the account has no profile row;
   *  incomplete — a big table came back shorter than the server's own total.)
   */
  function classify(err) {
    const e = err || {};
    const msg = String(e.message || e.msg || e.error_description || "");
    const code = String(e.code == null ? "" : e.code);
    const name = String(e.name || "");
    const status = Number(e.status != null ? e.status : e.statusCode) || 0;
    let kind = "unknown";
    if (name === "AuthRetryableFetchError" || /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|err_network|timed? ?out|econn|enotfound/i.test(msg)) kind = "network";
    else if (/^PGRST30[123]$/.test(code) || /^(user_not_found|session_not_found|session_expired|bad_jwt|refresh_token_not_found|refresh_token_already_used)$/.test(code) || /^(AuthSessionMissingError|AuthInvalidJwtError|AuthInvalidTokenResponseError)$/.test(name) || /jwt (expired|invalid|malformed)|invalid jwt|sub claim in jwt|auth session missing|invalid (refresh )?token|refresh token/i.test(msg)) kind = "session";
    else if (code === "42501" || status === 403 || /permission denied|row-level security|insufficient privilege/i.test(msg)) kind = "permission";
    else if (status === 401) kind = "session";
    else if (/^(42P01|42703|PGRST205|PGRST204)$/.test(code) || /does not exist|could not find the (table|column)|schema cache/i.test(msg)) kind = "missing_table";
    else if (status >= 500 || /^5\d\d$/.test(code)) kind = "server";
    return { kind, code, status, message: msg };
  }

  /** The error every strict-mode failure is thrown as. `.tables` lists the tables of a load that failed. */
  class BackendError extends Error {
    constructor(kind, message, extra) {
      super(message || kind);
      this.name = "BackendError";
      this.kind = kind;
      const x = extra || {};
      this.table = x.table || null;
      this.tables = x.tables || (x.table ? [x.table] : []);
      this.code = x.code || "";
      this.status = x.status || 0;
      this.op = x.op || "";
    }
  }

  /** Any thrown or returned error → a BackendError (an existing one is kept; it only gains the table it was missing). */
  function toBackendError(err, extra) {
    const x = extra || {};
    if (err instanceof BackendError) {
      if (!err.table && x.table) { err.table = x.table; if (!err.tables.length) err.tables = [x.table]; }
      return err;
    }
    const c = classify(err);
    return new BackendError(c.kind, c.message || String(err || "backend error"), { table: x.table, tables: x.tables, op: x.op, code: c.code, status: c.status });
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
      // A page that talks to the development project says so (a small corner tag, css/gate.css or wherever [data-backend] is styled),
      // so a Preview is never mistaken for the real site.
      if (mustUseBackend()) document.documentElement.setAttribute("data-backend", "dev");
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
    const strict = mustUseBackend();
    return {
      build: buildMarker(),
      channel: CHANNEL,
      backend: PROFILE === "stable" ? "production project" : CONFIG.url ? "development project" : "none yet (local mode)",
      host: loc.host,
      strict,
      // «unavailable», not «local»: a configured backend that cannot be used is an error state, never the device-only mode.
      mode: c ? "supabase (REAL AUTH)" : strict ? "unavailable (STRICT: the configured backend is required)" : "local (FALLBACK)",
      supabaseJsLoaded: libLoaded,
      clientCreated: !!c,
      configuredUrl: CONFIG.url,
      keyPresent: !!CONFIG.anonKey,
      keyPrefix: CONFIG.anonKey ? CONFIG.anonKey.slice(0, 18) + "..." : null,
      reasonIfLocal: c ? null : lastError,
    };
  }

  markChannel();

  return { init, isAvailable, get, getError, diagnose, channelFor, buildMarker, markChannel, mustUseBackend, classify, BackendError, toBackendError, CONFIG, PROFILES };
})();

// Console shortcut so it can be checked on the deployed site without digging.
window.REBUILT.diagnose = function () {
  const d = REBUILT.SupabaseClient.diagnose();
  console.table(d);
  return d;
};
