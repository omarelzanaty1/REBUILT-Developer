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

  const recovery = (function () {
    const boot = window.__REBUILT_BOOT_URL || { hash: "", search: "" };
    const h = new URLSearchParams(String(boot.hash || "").replace(/^#/, ""));
    const q = new URLSearchParams(String(boot.search || "").replace(/^\?/, ""));
    const errCode = h.get("error_code") || q.get("error_code") || "";
    const errName = h.get("error") || q.get("error") || "";
    const hasError = !!(errCode || errName) && (h.get("type") === "recovery" || /otp|expired|access_denied|recovery/i.test(errCode + errName + (h.get("error_description") || "")));
    return {
      intent: h.get("type") === "recovery" && !!h.get("access_token"),
      error: hasError ? { code: errCode || errName } : null,
    };
  })();

  /** What the gate should do on load: nothing, show "set a new password", or show "link expired". */
  function getRecovery() {
    if (recovery.error) return { status: "error", code: recovery.error.code };
    if (recovery.intent) return { status: "ready" };
    return { status: "none" };
  }

  function clearRecovery() {
    recovery.intent = false;
    recovery.error = null;
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
      state.meta.hasLocalAccount = false;
    },

    /** Always reports success for a well-formed address, so it can't be used to discover who has an account. */
    async requestPasswordReset(email) {
      const sb = REBUILT.SupabaseClient.get();
      const redirect = appRedirectUrl();
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), redirect ? { redirectTo: redirect } : undefined);
      if (error) return failure(error);
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
      if (!data.session) return { loggedIn: false, localOnly: false };
      return {
        loggedIn: true,
        userId: data.session.user.id,
        email: data.session.user.email,
        name: state.user.name,
        localOnly: false,
      };
    },
  };

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
  function classifyError(error) {
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
    if (code === "otp_expired" || msg.includes("expired")) return make("expired", "اللينك ده انتهت صلاحيته. اطلب لينك جديد.");
    if (msg.includes("auth session missing") || code === "session_not_found") return make("no_session", "الجلسة انتهت. اطلب لينك جديد لاستعادة الباسورد.");
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
  function translateError(error) {
    return classifyError(error).text;
  }

  /** Uniform failure result for the gate: message + machine-readable details (never tokens or passwords). */
  function failure(error) {
    const c = classifyError(error);
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
    async updatePassword() {
      return { ok: false, localOnly: true, error: "تغيير الباسورد محتاج حساب متصل بالسيرفر." };
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
    getRecovery,
    clearRecovery,
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
    updatePassword: (pw) => provider().updatePassword(pw),
    getSession: (state) => provider().getSession(state),
  };
})();
