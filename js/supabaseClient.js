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
  const CONFIG = {
    url: "https://jvyhtpfedkypwdzyadba.supabase.co",
    anonKey: "sb_publishable_TLPC-KjlYAn34x-ry2qI0w_xoPwjIng",
  };

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
      lastError = "Supabase config missing (url/anonKey empty)";
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
   * Self-service diagnostic. Run `REBUILT.diagnose()` in the browser console
   * on the live site to see exactly why the app is in local vs supabase mode.
   */
  function diagnose() {
    const libLoaded = typeof window.supabase !== "undefined" && !!window.supabase.createClient;
    const c = init();
    return {
      mode: c ? "supabase (REAL AUTH)" : "local (FALLBACK)",
      supabaseJsLoaded: libLoaded,
      clientCreated: !!c,
      configuredUrl: CONFIG.url,
      keyPresent: !!CONFIG.anonKey,
      keyPrefix: CONFIG.anonKey ? CONFIG.anonKey.slice(0, 18) + "..." : null,
      reasonIfLocal: c ? null : lastError,
    };
  }

  return { init, isAvailable, get, getError, diagnose, CONFIG };
})();

// Console shortcut so it can be checked on the deployed site without digging.
window.REBUILT.diagnose = function () {
  const d = REBUILT.SupabaseClient.diagnose();
  console.table(d);
  return d;
};
