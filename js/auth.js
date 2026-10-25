/* ============================================================
   REBUILT — auth.js
   One auth interface, two providers behind it:

   • SupabaseProvider — real authentication (Supabase Auth). Used
     whenever supabase-js is loaded and configured.
   • LocalProvider    — the original device-only fallback. Used when
     Supabase can't be reached (offline / CDN blocked). It is NOT
     real security and says so; it exists so the app still opens.

   Callers only ever touch REBUILT.Auth.* — they never care which
   provider is active. All account operations are async.
   ============================================================ */

window.REBUILT = window.REBUILT || {};

REBUILT.Auth = (function () {

  /* ---------------- Validation (shared, synchronous) ---------------- */

  /** Shortest password accepted. Keep in step with Supabase → Authentication → Password → minimum length. */
  const MIN_PASSWORD_LENGTH = 8;
  const MIN_PASSWORD_MESSAGE = "الباسورد لازم يكون " + MIN_PASSWORD_LENGTH + " حروف على الأقل.";

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  function validateSignUp({ name, email, password, confirmPassword }) {
    const errors = {};
    if (!name || !name.trim()) errors.name = "محتاجين اسمك.";
    if (!validateEmail(email)) errors.email = "الإيميل مش صحيح.";
    if (!password || password.length < MIN_PASSWORD_LENGTH) errors.password = MIN_PASSWORD_MESSAGE;
    if (password !== confirmPassword) errors.confirmPassword = "الباسورد وتأكيده مش متطابقين.";
    return { valid: Object.keys(errors).length === 0, errors };
  }

  function validateSignIn({ email, password }) {
    const errors = {};
    if (!validateEmail(email)) errors.email = "الإيميل مش صحيح.";
    if (!password) errors.password = "اكتب الباسورد.";
    return { valid: Object.keys(errors).length === 0, errors };
  }

  function validateEmailOnly({ email }) {
    const errors = {};
    if (!validateEmail(email)) errors.email = "الإيميل مش صحيح.";
    return { valid: Object.keys(errors).length === 0, errors };
  }

  function validateNewPassword({ password, confirmPassword }) {
    const errors = {};
    if (!password || password.length < MIN_PASSWORD_LENGTH) errors.password = MIN_PASSWORD_MESSAGE;
    if (password !== confirmPassword) errors.confirmPassword = "الباسورد وتأكيده مش متطابقين.";
    return { valid: Object.keys(errors).length === 0, errors };
  }

  /* ---------------- Recovery by e-mailed code (OTP) ----------------
     Password recovery no longer depends on a link. Supabase e-mails a short numeric code
     (its "Reset Password" template shows {{ .Token }}), the user types it here, and
     verifyOtp({ type: "recovery" }) turns it into a session that may change the password.
     The code is created, stored (hashed) and checked by Supabase Auth — never by this app. */

  /** Shortest / longest code accepted. Supabase → Authentication → Email OTP Length (6 by default, up to 10). */
  const CODE_MIN_LENGTH = 6;
  const CODE_MAX_LENGTH = 10;

  /** Digits only: drops spaces and dashes and maps Arabic-Indic digits to 0-9, so "٤٨٣ ٢٠٩" and "483-209" both work. */
  function normalizeCode(raw) {
    return String(raw == null ? "" : raw)
      .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06F0))
      .replace(/\D/g, "");
  }

  function validateOtpCode({ code }) {
    const errors = {};
    const normalized = normalizeCode(code);
    if (normalized.length < CODE_MIN_LENGTH || normalized.length > CODE_MAX_LENGTH) {
      errors.code = "اكتب الكود كامل زي ما وصلك على الإيميل (أرقام بس).";
    }
    return { valid: Object.keys(errors).length === 0, errors, code: normalized };
  }

  /** Arabic count phrase for "attempts" (1 → محاولة واحدة، 2 → محاولتين، 3–10 → N محاولات). */
  function attemptsPhrase(n) {
    if (n === 1) return "محاولة واحدة";
    if (n === 2) return "محاولتين";
    return n + (n >= 3 && n <= 10 ? " محاولات" : " محاولة");
  }

  /** Limits the app itself applies on top of Supabase's own (which stay authoritative). */
  const RECOVERY_LIMITS = {
    resendCooldownSeconds: 60,   // same as Supabase's per-address wait between two e-mails
    sendsPerWindow: 5,           // codes requested from one browser tab …
    windowSeconds: 3600,         // … per hour
    wrongCodesPerRequest: 5,     // wrong tries before the user must ask for a fresh code
  };

  /**
   * Per-tab counters for "ask for a code" and "type a wrong code". They stop a user (or a loop) from
   * hammering the e-mail sender or guessing, and survive a refresh through sessionStorage. They are
   * defence in depth and UX only: the enforcing limits are Supabase's (e-mail send quota, one e-mail per
   * address per minute, verification rate limit, code expiry). Stores no e-mail address, only a short hash.
   */
  function createRecoveryGuard(store, clock, limits) {
    const L = limits || RECOVERY_LIMITS;
    const KEY = "rebuilt.recoveryGuard";
    const now = () => (clock ? clock() : Date.now());
    const tag = (email) => {
      let h = 5381;
      const e = String(email || "").trim().toLowerCase();
      for (let i = 0; i < e.length; i++) h = ((h << 5) + h + e.charCodeAt(i)) | 0;
      return (h >>> 0).toString(36);
    };
    function read() {
      try {
        const v = JSON.parse(store.getItem(KEY) || "null");
        if (v && Array.isArray(v.sends)) return { sends: v.sends.filter((x) => x && Number.isFinite(x.t)), wrong: Number(v.wrong) || 0 };
      } catch (err) { /* unreadable → start clean */ }
      return { sends: [], wrong: 0 };
    }
    function write(state) {
      try { store.setItem(KEY, JSON.stringify(state)); } catch (err) { /* storage unavailable: counters then live only until reload */ }
    }
    const recent = (state, t) => state.sends.filter((x) => t - x.t < L.windowSeconds * 1000);
    return {
      /** May a code be requested for this address now? → { ok, reason?, waitSeconds } */
      canSend(email) {
        const t = now();
        const mine = recent(read(), t);
        const last = mine.filter((x) => x.e === tag(email)).reduce((m, x) => Math.max(m, x.t), 0);
        const cool = last ? Math.ceil((last + L.resendCooldownSeconds * 1000 - t) / 1000) : 0;
        if (cool > 0) return { ok: false, reason: "cooldown", waitSeconds: cool };
        if (mine.length >= L.sendsPerWindow) {
          const oldest = mine.reduce((m, x) => Math.min(m, x.t), Infinity);
          return { ok: false, reason: "quota", waitSeconds: Math.max(1, Math.ceil((oldest + L.windowSeconds * 1000 - t) / 1000)) };
        }
        return { ok: true, waitSeconds: 0 };
      },
      /** A code was sent: start its cooldown and give the new code a fresh set of tries. */
      noteSent(email) {
        const t = now();
        const state = read();
        state.sends = recent(state, t).concat({ t, e: tag(email) });
        state.wrong = 0;
        write(state);
      },
      attemptsLeft() { return Math.max(0, L.wrongCodesPerRequest - read().wrong); },
      /** A wrong/expired code was typed → tries left. */
      noteWrong() {
        const state = read();
        state.wrong += 1;
        write(state);
        return Math.max(0, L.wrongCodesPerRequest - state.wrong);
      },
      /** The code worked: nothing left to count. */
      clearWrong() {
        const state = read();
        state.wrong = 0;
        write(state);
      },
    };
  }

  const memoryStore = (function () {
    const m = {};
    return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } };
  })();
  function tabStore() {
    try { return window.sessionStorage || memoryStore; } catch (err) { return memoryStore; }
  }
  const Recovery = createRecoveryGuard(tabStore());

  /** 0 (empty) … 3 (strong). A hint for the UI only — the server enforces the real rules. */
  function passwordStrength(pw) {
    const p = String(pw || "");
    if (!p) return 0;
    let score = 0;
    if (p.length >= MIN_PASSWORD_LENGTH) score++;
    if (p.length >= 10 && /[a-z]/i.test(p) && /\d/.test(p)) score++;
    if (p.length >= 12 && /[^a-z0-9]/i.test(p) && /[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
    return Math.max(score, 1);
  }

  /* ---------------- Password recovery (link from the reset e-mail) ----------------
     The recovery link opens the app as  …/#access_token=…&type=recovery  (or with
     #error_code=otp_expired when the link is stale). supabase-js consumes and
     clears that hash on start-up, so index.html snapshots it into
     window.__REBUILT_BOOT_URL first — that snapshot is how we know the visit is a
     recovery visit. Tokens are never read, logged or stored here. */

  /** Set once a recovery code has been verified, until a new password is saved: a refresh in between must
      land on "choose a new password" again, not inside the app on a session that never proved a new password. */
  const PENDING_KEY = "rebuilt.resetPending";
  function readPending() {
    try { return window.sessionStorage.getItem(PENDING_KEY) === "1"; } catch (err) { return false; }
  }
  function writePending(on) {
    try {
      if (on) window.sessionStorage.setItem(PENDING_KEY, "1");
      else window.sessionStorage.removeItem(PENDING_KEY);
    } catch (err) { /* storage unavailable: the flag then lives only in memory */ }
  }

  /* ---------------- Coming back from an e-mail link or from Google ----------------
     Every redirect back to the app lands on the same address, so the address alone says little:
       …#access_token=…&type=recovery        an old recovery link              → recovery
       …#error=…&error_code=otp_expired      a stale e-mail link               → recovery-error
       …#access_token=…  (+ our marker)      back from Google (sign-in / link) → oauth-ok
       …#error=access_denied  (or other)     Google cancelled / refused        → oauth-error
     "Our marker" is a short-lived flag in sessionStorage written just before the browser leaves for Google
     (which flow it was, and for a link: whose account). It holds no token and no e-mail address.
     parseAuthReturn is pure (takes the boot snapshot) so each shape can be tested without a browser. */

  const OAUTH_KEY = "rebuilt.oauth";
  const OAUTH_TTL_MS = 15 * 60 * 1000;

  function readOAuthMarker() {
    try {
      const v = JSON.parse(window.sessionStorage.getItem(OAUTH_KEY) || "null");
      if (v && (v.mode === "signin" || v.mode === "link") && Number.isFinite(v.t) && Date.now() - v.t < OAUTH_TTL_MS) return v;
    } catch (err) { /* storage unavailable or unreadable: no marker */ }
    return null;
  }
  function writeOAuthMarker(mode, uid) {
    try { window.sessionStorage.setItem(OAUTH_KEY, JSON.stringify({ mode, uid: uid || "", t: Date.now() })); } catch (err) { /* then the return just carries no marker */ }
  }
  function clearOAuthMarker() {
    try { window.sessionStorage.removeItem(OAUTH_KEY); } catch (err) { /* nothing to clear */ }
  }

  function parseAuthReturn(boot, marker) {
    const b = boot || {};
    const h = new URLSearchParams(String(b.hash || "").replace(/^#/, ""));
    const q = new URLSearchParams(String(b.search || "").replace(/^\?/, ""));
    const get = (k) => h.get(k) || q.get(k) || "";
    const errCode = get("error_code");
    const errName = get("error");
    const desc = get("error_description");
    const isRecoveryType = h.get("type") === "recovery";
    if (errCode || errName) {
      // An e-mail link that is no longer valid keeps its own screen; anything else is a failed sign-in elsewhere (Google).
      const emailLink = isRecoveryType || /^otp_expired$/i.test(errCode) || /email link|recovery/i.test(desc);
      if (emailLink) return { kind: "recovery-error", code: errCode || errName };
      return { kind: "oauth-error", mode: marker ? marker.mode : "signin", uid: marker ? marker.uid : "", code: errCode || errName, description: desc };
    }
    if (isRecoveryType && h.get("access_token")) return { kind: "recovery" };
    if (marker && h.get("access_token")) return { kind: "oauth-ok", mode: marker.mode, uid: marker.uid };
    return { kind: "none" };
  }

  const authReturn = parseAuthReturn(window.__REBUILT_BOOT_URL, readOAuthMarker());

  const recovery = {
    intent: authReturn.kind === "recovery" || readPending(),
    error: authReturn.kind === "recovery-error" ? { code: authReturn.code } : null,
  };

  /** What the gate should do on load: nothing, show "set a new password", or show "link expired". */
  function getRecovery() {
    if (recovery.error) return { status: "error", code: recovery.error.code };
    if (recovery.intent) return { status: "ready" };
    return { status: "none" };
  }

  /** The code was verified: from now on "choose a new password" is the only place this session may go. */
  function markResetPending() {
    recovery.intent = true;
    recovery.error = null;
    writePending(true);
  }

  function clearRecovery() {
    recovery.intent = false;
    recovery.error = null;
    writePending(false);
    try {
      if (window.location.hash && /type=recovery|error_code|access_token|error=/.test(window.location.hash)) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    } catch (err) {
      /* cosmetic only */
    }
  }

  /** Subscribed as early as possible so a PASSWORD_RECOVERY event is never missed. */
  function watchAuthEvents() {
    try {
      const sb = REBUILT.SupabaseClient && REBUILT.SupabaseClient.get();
      if (!sb || watchAuthEvents.done) return;
      watchAuthEvents.done = true;
      sb.auth.onAuthStateChange((event) => {
        if (event === "PASSWORD_RECOVERY") recovery.intent = true;
      });
    } catch (err) {
      console.warn("REBUILT: could not subscribe to auth events", err);
    }
  }

  /* ---------------- Where e-mail links must come back to ----------------
     Every link Supabase e-mails (sign-up confirmation, password recovery) carries a
     redirect target. If that target is not in Supabase → Authentication → URL
     Configuration → Redirect URLs, Supabase silently swaps it for the project's
     Site URL (a new project's default is a local development address) — that is how a reset
     link ended up pointing at a local port nobody was serving. The app therefore always asks for ITS OWN public address, written
     in one canonical form, so the value to allow-list is predictable:
        https://omarelzanaty1.github.io/rebuilt0.4/
     Nothing here hardcodes a host: the address comes from where the app is served, so a
     custom domain keeps working. Pure function (takes a Location-like object) so it can
     be tested without a browser. Returns "" when the page is not served over http(s)
     (file://, about:blank) — callers then omit the option and Supabase uses the Site URL. */
  function redirectUrlFor(loc) {
    const origin = String((loc && loc.origin) || "");
    if (!/^https?:\/\/[^/]+$/i.test(origin)) return "";
    let path = String((loc && loc.pathname) || "/").replace(/\/index\.html?$/i, "/");
    if (!path.startsWith("/")) path = "/" + path;
    if (!path.endsWith("/")) path += "/";
    return origin + path; // never the query string or the hash (they would carry tokens)
  }

  function appRedirectUrl() {
    return redirectUrlFor(window.location);
  }

  /* ---------------- Provider: Supabase (real auth) ---------------- */

  const SupabaseProvider = {
    id: "supabase",

    async signUp(state, { name, email, password }) {
      const sb = REBUILT.SupabaseClient.get();
      const options = { data: { name: name.trim() } };
      const redirect = appRedirectUrl();
      if (redirect) options.emailRedirectTo = redirect; // the confirmation link must return to this app, not the Site URL default
      const { data, error } = await sb.auth.signUp({ email: email.trim(), password, options });

      if (error) return failure(error);

      state.user.name = name.trim();
      state.user.email = email.trim();
      if (data.user) state.user.id = data.user.id;

      // Email confirmation is ON, so signUp gives us a user but no session
      // until they click the link. Don't pretend they're signed in.
      if (!data.session) {
        return { ok: true, needsEmailConfirmation: true, session: null };
      }

      state.meta.hasLocalAccount = true;
      return { ok: true, needsEmailConfirmation: false, session: data.session };
    },

    async signIn(state, { email, password }) {
      const sb = REBUILT.SupabaseClient.get();
      const { data, error } = await sb.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) return failure(error);

      state.user.id = data.user.id;
      state.user.email = data.user.email;
      const metaName = data.user.user_metadata && data.user.user_metadata.name;
      if (metaName && !state.user.name) state.user.name = metaName;
      state.meta.hasLocalAccount = true;

      return { ok: true, session: data.session };
    },

    async signOut(state) {
      const sb = REBUILT.SupabaseClient.get();
      await sb.auth.signOut();
      clearRecovery();
      state.meta.hasLocalAccount = false;
    },

    /**
     * Ask Supabase to e-mail a recovery CODE (its "Reset Password" template must show {{ .Token }}).
     * No redirect target is sent: nothing in this flow opens a link. Reports success for any well-formed
     * address, known or not, so the answer can't be used to discover who has an account.
     */
    async requestPasswordReset(email) {
      const gate = Recovery.canSend(email);
      if (!gate.ok) return clientLimit(gate);
      const sb = REBUILT.SupabaseClient.get();
      const { error } = await sb.auth.resetPasswordForEmail(email.trim());
      if (error) return failure(error);
      Recovery.noteSent(email);
      return { ok: true };
    },

    /**
     * Exchange the e-mailed code for a recovery session. Supabase decides whether the code is right,
     * expired or already used; the app only counts wrong tries (a fresh code is needed after too many).
     */
    async verifyRecoveryCode(email, code) {
      const check = validateOtpCode({ code });
      if (!check.valid) return { ok: false, kind: "invalid_format", error: check.errors.code, code: "invalid_format", limited: false, retryAfter: 0 };
      if (Recovery.attemptsLeft() <= 0) return exhausted();

      const sb = REBUILT.SupabaseClient.get();
      const { data, error } = await sb.auth.verifyOtp({ email: email.trim(), token: check.code, type: "recovery" });

      if (error || !data || !data.session) {
        const res = failure(error || { code: "otp_expired", message: "Token has expired or is invalid" }, "code");
        if (res.kind === "code_invalid") {
          const left = Recovery.noteWrong();
          if (left <= 0) return exhausted();
          res.attemptsLeft = left;
          res.error = res.error + " فاضلك " + attemptsPhrase(left) + ".";
        }
        return res;
      }

      Recovery.clearWrong();
      markResetPending();
      return { ok: true };
    },

    async updatePassword(newPassword) {
      const sb = REBUILT.SupabaseClient.get();
      const { error } = await sb.auth.updateUser({ password: newPassword });
      if (error) return failure(error);
      return { ok: true };
    },

    async getSession(state) {
      const sb = REBUILT.SupabaseClient.get();
      const { data } = await sb.auth.getSession();
      if (!data.session) {
        // No session, so nothing can be "pending": drop a leftover reset marker instead of showing a form that cannot save.
        if (recovery.intent) clearRecovery();
        return { loggedIn: false, localOnly: false };
      }
      const meta = data.session.user.user_metadata || {};
      return {
        loggedIn: true,
        userId: data.session.user.id,
        email: data.session.user.email,
        name: state.user.name || meta.name || meta.full_name || "",   // a Google account brings its own display name
        localOnly: false,
      };
    },

    /* ---------- Google (official Supabase OAuth) ----------
       Sign-in and linking go through Supabase Auth; the Google client secret lives only in the Supabase
       dashboard, never here. Both calls leave the page for Google and come back to the app's own address
       (the same canonical redirect target as the sign-up e-mail, so nothing new has to be allow-listed). */

    /** "Continue with Google" for someone who is signed out: a new account, or the one this Google identity already belongs to. */
    async signInWithGoogle() {
      const sb = REBUILT.SupabaseClient.get();
      const options = { queryParams: { prompt: "select_account" } };
      const redirect = appRedirectUrl();
      if (redirect) options.redirectTo = redirect;
      writeOAuthMarker("signin");
      const { data, error } = await sb.auth.signInWithOAuth({ provider: "google", options });
      if (error) {
        clearOAuthMarker();
        return failure(error, "oauth");
      }
      return { ok: true, redirecting: true, url: data && data.url };
    },

    /**
     * Attach a Google identity to the account that is signed in RIGHT NOW. Uses linkIdentity — never
     * signInWithOAuth — so Supabase can't create a second user; if that Google identity already belongs
     * to someone else it refuses instead of merging.
     */
    async linkGoogle() {
      const sb = REBUILT.SupabaseClient.get();
      const { data: cur } = await sb.auth.getSession();
      if (!cur || !cur.session) {
        return { ok: false, kind: "no_session", code: "no_session", limited: false, retryAfter: 0, error: "سجّل دخولك الأول، وبعدها اربط حساب Google." };
      }
      const options = { queryParams: { prompt: "select_account" } };
      const redirect = appRedirectUrl();
      if (redirect) options.redirectTo = redirect;
      writeOAuthMarker("link", cur.session.user.id);
      const { data, error } = await sb.auth.linkIdentity({ provider: "google", options });
      if (error) {
        clearOAuthMarker();
        return failure(error, "link");
      }
      return { ok: true, redirecting: true, url: data && data.url };
    },

    /** The sign-in methods attached to the signed-in account: [{ provider, email, id }]. */
    async getIdentities() {
      const sb = REBUILT.SupabaseClient.get();
      const { data, error } = await sb.auth.getUserIdentities();
      if (error) return failure(error);
      const list = (data && data.identities) || [];
      return {
        ok: true,
        identities: list.map((i) => ({
          provider: i.provider,
          email: (i.identity_data && i.identity_data.email) || "",
          id: i.identity_id || i.id || "",
        })),
      };
    },
  };

  /* ---------------- What happened on the way back from Google ---------------- */

  /** Take the address back to a clean one once the result has been read (nothing sensitive stays in the bar). */
  function cleanReturnParams() {
    try {
      const u = new URL(window.location.href);
      ["error", "error_code", "error_description"].forEach((k) => u.searchParams.delete(k));
      const hash = /access_token|error/.test(u.hash) ? "" : u.hash;
      history.replaceState(null, "", u.pathname + u.search + hash);
    } catch (err) { /* cosmetic only */ }
  }

  let oauthConsumed = false;

  /**
   * Called once, after the session has been read and before the gate decides what to show.
   * → null (this visit was not a return from Google), or
   *   { ok, mode: "signin" | "link", kind?, error? }
   * A cancelled / failed attempt never touches the session: the address is cleaned before supabase-js
   * starts (index.html), so "the login via URL failed" can't sign anyone out.
   */
  async function consumeOAuthResult() {
    if (oauthConsumed) return null;
    oauthConsumed = true;
    const r = authReturn;
    if (r.kind !== "oauth-ok" && r.kind !== "oauth-error") return null;
    clearOAuthMarker();
    cleanReturnParams();
    const link = r.mode === "link";

    if (r.kind === "oauth-error") {
      const c = classifyError({ code: r.code, message: r.description }, link ? "link" : "oauth");
      return { ok: false, mode: r.mode, kind: c.kind, code: c.code, error: c.text };
    }
    if (!link) return { ok: true, mode: "signin" };

    // Linking: only call it done when it really is — same person still signed in, and Google is among their identities.
    if (!REBUILT.SupabaseClient || !REBUILT.SupabaseClient.isAvailable()) return null;
    const sb = REBUILT.SupabaseClient.get();
    const { data } = await sb.auth.getSession();
    const sess = data && data.session;
    if (!sess) {
      return { ok: false, mode: "link", kind: "no_session", error: "الجلسة انتهت أثناء الربط. سجّل دخولك وجرّب تاني." };
    }
    if (r.uid && sess.user.id !== r.uid) {
      return { ok: false, mode: "link", kind: "session_changed", error: "الحساب اللي رجع بعد Google مختلف عن الحساب اللي بدأت منه، فمش هنعتبر الربط اتم. اتأكد إنك داخل على حسابك وجرّب تاني." };
    }
    const ids = await SupabaseProvider.getIdentities();
    if (!ids.ok || !ids.identities.some((i) => i.provider === "google")) {
      return { ok: false, mode: "link", kind: "link_unconfirmed", error: "مقدرناش نتأكد إن Google اتربط بحسابك. بص في «طرق تسجيل الدخول» في الإعدادات وجرّب تاني لو لسه مش مربوط." };
    }
    return { ok: true, mode: "link" };
  }

  /** Fallback wait (seconds) for a "slow down" answer that does not say how long. */
  const DEFAULT_COOLDOWN_SECONDS = 60;

  /**
   * Read a Supabase auth error by what it actually is. Different limits mean different things and
   * need different words — one catch-all "too many requests" message hid the real cause of a
   * failing sign-up (the project's e-mail quota, not the user's clicking):
   *   email_frequency   same address asked again too soon ("you can only request this after N seconds")
   *   email_quota       the project's own e-mail sending quota is used up (HTTP 429 over_email_send_rate_limit)
   *   rate              general request rate limit (HTTP 429 over_request_rate_limit)
   *   email_not_authorized / email_send_failed   e-mail provider not set up for this recipient / failed
   * Returns { kind, code, status, text, limited?, retryAfter? }. Pure; never touches the DOM.
   */
  function classifyError(error, context) {
    const e = error || {};
    const msg = String(e.message || "").toLowerCase();
    const code = String(e.code || e.error_code || "").toLowerCase();
    const status = Number(e.status) || 0;
    const make = (kind, text, extra) => Object.assign({ kind, code, status, text }, extra || {});

    // ---- limits (HTTP 429) ----
    const waitMatch = msg.match(/after\s+(\d+)\s+seconds?/);
    if (waitMatch && (status === 429 || code.indexOf("over_") === 0 || msg.includes("security purposes"))) {
      const secs = parseInt(waitMatch[1], 10) || DEFAULT_COOLDOWN_SECONDS;
      return make("email_frequency", "استنى " + secs + " ثانية وبعدين اطلب الرسالة تاني.", { limited: true, retryAfter: secs });
    }
    if (code === "over_email_send_rate_limit" || (status === 429 && msg.includes("email"))) {
      return make("email_quota", "السيرفر وصل للحد الأقصى من رسائل الإيميل اللي يقدر يبعتها دلوقتي، وده مش بسببك. جرّب تاني بعد شوية، ولو فضلت كده كلّم صاحب الموقع.", { limited: true, retryAfter: DEFAULT_COOLDOWN_SECONDS });
    }
    if (code === "over_request_rate_limit" || status === 429 || msg.includes("rate limit") || msg.includes("too many") || msg.includes("security purposes")) {
      return make("rate", "طلبات كتير ورا بعض. استنى دقيقة وجرّب تاني.", { limited: true, retryAfter: DEFAULT_COOLDOWN_SECONDS });
    }

    // ---- Google sign-in / linking ("oauth" = signing in, "link" = attaching Google to the signed-in account) ----
    if (context === "oauth" || context === "link") {
      const linking = context === "link";
      if (code === "manual_linking_disabled" || msg.includes("manual linking") || msg.includes("linkuser")) {
        return make("linking_disabled", "ربط Google لسه مش متفعّل في إعدادات السيرفر، فحسابك زي ما هو. كلّم صاحب الموقع.");
      }
      if (code === "identity_already_exists" || /already linked|identity.*already/.test(msg)) {
        return make("identity_taken", "حساب Google ده مرتبط بحساب REBUILT تاني، فمش هنربطه هنا ومش هندمج الحسابين تلقائي. لو ده حسابك التاني: سجّل خروج وادخل بيه من «المتابعة باستخدام Google». أو اختار حساب Google مختلف.");
      }
      if (code === "provider_disabled" || code === "oauth_provider_not_supported" || /provider.*(not enabled|disabled)|unsupported provider/.test(msg)) {
        return make("provider_disabled", "الدخول بـ Google لسه مش متفعّل على السيرفر. كمّل بالإيميل والباسورد دلوقتي، وكلّم صاحب الموقع.");
      }
      if (code === "provider_email_needs_verification" || msg.includes("unverified email")) {
        return make("provider_email_unverified", "إيميل حساب Google ده مش متأكد عند Google، فمقدرناش نكمّل. أكّد الإيميل من Google وجرّب تاني.");
      }
      if (code === "access_denied" || msg.includes("access denied") || msg.includes("denied") || msg.includes("cancel")) {
        return make("oauth_cancelled", linking ? "لغيت ربط Google. حسابك زي ما هو ومفيش حاجة اتغيّرت." : "لغيت الدخول بـ Google. تقدر تجرّب تاني أو تكمّل بالإيميل.");
      }
      if (code === "signup_disabled" || msg.includes("signups not allowed")) {
        return make("signup_disabled", "إنشاء حسابات جديدة مقفول دلوقتي.");
      }
      if (!(msg.includes("failed to fetch") || msg.includes("network") || String(e.name || "") === "AuthRetryableFetchError")) {
        const tagged = code ? " (كود: " + code + ")" : status ? " (" + status + ")" : "";
        return make("oauth_failed", (linking ? "ربط Google ما اكتملش. حسابك زي ما هو، جرّب تاني." : "الدخول بـ Google ما اكتملش. جرّب تاني أو كمّل بالإيميل.") + tagged);
      }
    }

    // ---- a recovery code that was typed (wrong, expired, already used or replaced by a newer one) ----
    if (context === "code" && (code === "otp_expired" || code === "otp_disabled" || msg.includes("expired") || msg.includes("invalid") || status === 403)) {
      return make("code_invalid", "الكود غلط أو انتهت صلاحيته.");
    }

    // ---- e-mail provider problems ----
    if (code === "email_address_not_authorized" || msg.includes("email address not authorized")) {
      return make("email_not_authorized", "الإيميل ده مش مسموح يستلم رسايل من السيرفر دلوقتي (إعدادات الإيميل في المشروع لسه مش مكتملة). كلّم صاحب الموقع.");
    }
    if (msg.includes("error sending") && msg.includes("mail")) {
      return make("email_send_failed", "السيرفر مقدرش يبعت رسالة الإيميل. جرّب تاني بعد شوية، ولو فضلت كده كلّم صاحب الموقع.");
    }

    // ---- account / credentials ----
    if (code === "user_already_exists" || code === "email_exists" || msg.includes("user already registered") || msg.includes("already been registered")) {
      return make("exists", "الإيميل ده مسجل قبل كده. جرّب تسجيل الدخول.");
    }
    if (code === "email_address_invalid" || (msg.includes("email address") && msg.includes("invalid"))) {
      return make("email_invalid", "الإيميل ده مش مقبول. اتأكد منه أو جرّب إيميل تاني.");
    }
    if (code === "signup_disabled" || code === "email_provider_disabled" || msg.includes("signups not allowed") || msg.includes("signup is disabled")) {
      return make("signup_disabled", "التسجيل بالإيميل مقفول دلوقتي.");
    }
    if (code === "same_password" || msg.includes("different from the old")) return make("same_password", "اختار باسورد مختلف عن القديم.");
    if (msg.includes("at least") && msg.includes("characters")) return make("weak_password", MIN_PASSWORD_MESSAGE);
    if (code === "weak_password" || (msg.includes("password") && (msg.includes("weak") || msg.includes("at least") || msg.includes("characters")))) {
      return make("weak_password", "الباسورد مش قوي كفاية. جرّب باسورد أطول.");
    }
    if (code === "otp_expired" || msg.includes("expired")) return make("expired", "اللينك أو الكود انتهت صلاحيته. اطلب واحد جديد.");
    if (msg.includes("auth session missing") || code === "session_not_found") return make("no_session", "الجلسة انتهت. اطلب كود جديد لاستعادة الباسورد.");
    if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return make("credentials", "الإيميل أو الباسورد غلط.");
    if (code === "email_not_confirmed" || msg.includes("email not confirmed")) return make("not_confirmed", "لسه مأكدتش الإيميل. بص في بريدك على رسالة التأكيد.");

    // ---- connection ----
    if (msg.includes("failed to fetch") || msg.includes("network") || String(e.name || "") === "AuthRetryableFetchError") {
      return make("network", "مفيش اتصال بالنت دلوقتي.");
    }

    // ---- unknown: say so, and keep the server's code so the real cause can be found ----
    const tag = code ? " (كود: " + code + ")" : status ? " (" + status + ")" : "";
    return make("unknown", "حصلت مشكلة صغيرة. جرّب تاني." + tag);
  }

  /** The Egyptian-Arabic sentence for an auth error. */
  function translateError(error, context) {
    return classifyError(error, context).text;
  }

  /** The app's own pause (cooldown / hourly cap) in the same shape as a server rate-limit result. */
  function clientLimit(gate) {
    const mins = Math.ceil(gate.waitSeconds / 60);
    const text = gate.reason === "cooldown"
      ? "استنى " + gate.waitSeconds + " ثانية وبعدين اطلب كود تاني."
      : "طلبت أكواد كتير. جرّب تاني بعد حوالي " + mins + " دقيقة.";
    return { ok: false, error: text, kind: "client_" + gate.reason, code: "client_rate_limit", limited: true, retryAfter: gate.waitSeconds };
  }

  function exhausted() {
    return {
      ok: false,
      kind: "attempts_exhausted",
      code: "client_attempts",
      error: "جرّبت كذا مرة والكود غلط. اطلب كود جديد وجرّب بيه.",
      exhausted: true,
      limited: false,
      retryAfter: 0,
    };
  }

  /** Uniform failure result for the gate: message + machine-readable details (never tokens or passwords). */
  function failure(error, context) {
    const c = classifyError(error, context);
    try { console.warn("REBUILT auth:", c.kind, c.code || "-", c.status || "-"); } catch (err) { /* logging only */ }
    return { ok: false, error: c.text, kind: c.kind, code: c.code, limited: !!c.limited, retryAfter: c.retryAfter || 0 };
  }

  /* ---------------- Provider: Local (device-only fallback) ---------------- */

  const LocalProvider = {
    id: "local",

    async signUp(state, { name, email }) {
      state.user.name = name.trim();
      state.user.email = email.trim();
      state.meta.hasLocalAccount = true;
      return { ok: true, needsEmailConfirmation: false, session: { localOnly: true } };
    },

    async signIn(state, { email }) {
      const known = (state.user.email || "").trim().toLowerCase();
      const attempt = (email || "").trim().toLowerCase();
      if (!known || known !== attempt) {
        return { ok: false, error: "مفيش حساب محلي متسجل بالإيميل ده على الجهاز ده." };
      }
      state.meta.hasLocalAccount = true;
      return { ok: true, session: { localOnly: true } };
    },

    async signOut(state) {
      state.meta.hasLocalAccount = false;
    },

    /* No server → no e-mail can be sent and no password exists to change.
       Say so honestly instead of pretending. */
    async requestPasswordReset() {
      return { ok: false, localOnly: true, error: "الوضع المحلي مفيهوش باسورد على سيرفر، فمفيش رسالة هتتبعت." };
    },
    async verifyRecoveryCode() {
      return { ok: false, localOnly: true, error: "الوضع المحلي مفيهوش كود تحقق، لأن مفيش سيرفر يبعته." };
    },
    async updatePassword() {
      return { ok: false, localOnly: true, error: "تغيير الباسورد محتاج حساب متصل بالسيرفر." };
    },
    async signInWithGoogle() {
      return { ok: false, localOnly: true, error: "الدخول بـ Google محتاج اتصال بسيرفر REBUILT، وهو مش متاح دلوقتي." };
    },
    async linkGoogle() {
      return { ok: false, localOnly: true, error: "ربط Google محتاج حساب متصل بالسيرفر." };
    },
    async getIdentities() {
      return { ok: false, localOnly: true, identities: [], error: "طرق تسجيل الدخول محتاجة حساب متصل بالسيرفر." };
    },

    async getSession(state) {
      return {
        loggedIn: !!state.meta.hasLocalAccount,
        name: state.user.name,
        email: state.user.email,
        localOnly: true,
      };
    },
  };

  /* ---------------- Provider selection ---------------- */

  function provider() {
    return REBUILT.SupabaseClient && REBUILT.SupabaseClient.isAvailable()
      ? SupabaseProvider
      : LocalProvider;
  }

  function mode() {
    return provider().id;
  }

  /** True when accounts are backed by a real server rather than this device only. */
  function isRealAuth() {
    return mode() === "supabase";
  }

  return {
    MIN_PASSWORD_LENGTH,
    validateEmail,
    validateSignUp,
    validateSignIn,
    validateEmailOnly,
    validateNewPassword,
    passwordStrength,
    validateOtpCode,
    normalizeCode,
    getRecovery,
    clearRecovery,
    markResetPending,
    Recovery,
    createRecoveryGuard,
    RECOVERY_LIMITS,
    watchAuthEvents,
    redirectUrlFor,
    classifyError,
    translateError,
    DEFAULT_COOLDOWN_SECONDS,
    mode,
    isRealAuth,
    signUp: (state, payload) => provider().signUp(state, payload),
    signIn: (state, payload) => provider().signIn(state, payload),
    signOut: (state) => provider().signOut(state),
    requestPasswordReset: (email) => provider().requestPasswordReset(email),
    verifyRecoveryCode: (email, code) => provider().verifyRecoveryCode(email, code),
    updatePassword: (pw) => provider().updatePassword(pw),
    getSession: (state) => provider().getSession(state),
    signInWithGoogle: () => provider().signInWithGoogle(),
    linkGoogle: () => provider().linkGoogle(),
    getIdentities: () => provider().getIdentities(),
    consumeOAuthResult,
    parseAuthReturn,
  };
})();
