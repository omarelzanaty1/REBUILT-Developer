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

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
  }

  function validateSignUp({ name, email, password, confirmPassword }) {
    const errors = {};
    if (!name || !name.trim()) errors.name = "محتاجين اسمك.";
    if (!validateEmail(email)) errors.email = "الإيميل مش صحيح.";
    if (!password || password.length < 6) errors.password = "الباسورد لازم يكون 6 حروف على الأقل.";
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
    if (!password || password.length < 6) errors.password = "الباسورد لازم يكون 6 حروف على الأقل.";
    if (password !== confirmPassword) errors.confirmPassword = "الباسورد وتأكيده مش متطابقين.";
    return { valid: Object.keys(errors).length === 0, errors };
  }

  /** 0 (empty) … 3 (strong). A hint for the UI only — the server enforces the real rules. */
  function passwordStrength(pw) {
    const p = String(pw || "");
    if (!p) return 0;
    let score = 0;
    if (p.length >= 6) score++;
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

  function resetRedirectUrl() {
    return window.location.origin + window.location.pathname;
  }

  /* ---------------- Provider: Supabase (real auth) ---------------- */

  const SupabaseProvider = {
    id: "supabase",

    async signUp(state, { name, email, password }) {
      const sb = REBUILT.SupabaseClient.get();
      const { data, error } = await sb.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { name: name.trim() } },
      });

      if (error) return { ok: false, error: translateError(error) };

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

      if (error) return { ok: false, error: translateError(error) };

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
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: resetRedirectUrl() });
      if (error) return { ok: false, error: translateError(error), code: error.code || "" };
      return { ok: true };
    },

    async updatePassword(newPassword) {
      const sb = REBUILT.SupabaseClient.get();
      const { error } = await sb.auth.updateUser({ password: newPassword });
      if (error) return { ok: false, error: translateError(error), code: error.code || "" };
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

  /** Turn Supabase's English auth errors into REBUILT's own Egyptian-Arabic voice. */
  function translateError(error) {
    const msg = (error.message || "").toLowerCase();
    const code = (error.code || "").toLowerCase();
    if (code === "over_email_send_rate_limit" || msg.includes("rate limit") || msg.includes("too many") || msg.includes("security purposes")) {
      return "طلبات كتير ورا بعض. استنى دقيقة وجرّب تاني.";
    }
    if (code === "same_password" || msg.includes("different from the old")) return "اختار باسورد مختلف عن القديم.";
    if (code === "weak_password" || (msg.includes("password") && (msg.includes("weak") || msg.includes("at least") || msg.includes("characters")))) {
      return "الباسورد مش قوي كفاية. جرّب باسورد أطول.";
    }
    if (code === "otp_expired" || msg.includes("expired")) return "اللينك ده انتهت صلاحيته. اطلب لينك جديد.";
    if (msg.includes("auth session missing") || code === "session_not_found") return "الجلسة انتهت. اطلب لينك جديد لاستعادة الباسورد.";
    if (msg.includes("invalid login credentials")) return "الإيميل أو الباسورد غلط.";
    if (msg.includes("email not confirmed")) return "لسه مأكدتش الإيميل. بص في بريدك على رسالة التأكيد.";
    if (msg.includes("user already registered") || msg.includes("already been registered")) return "الإيميل ده مسجل قبل كده. جرّب تسجيل الدخول.";
    if (msg.includes("failed to fetch") || msg.includes("network")) return "مفيش اتصال بالنت دلوقتي.";
    return "حصلت مشكلة صغيرة. جرّب تاني.";
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
    validateEmail,
    validateSignUp,
    validateSignIn,
    validateEmailOnly,
    validateNewPassword,
    passwordStrength,
    getRecovery,
    clearRecovery,
    watchAuthEvents,
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
