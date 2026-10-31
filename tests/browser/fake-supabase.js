/* Test double for @supabase/supabase-js (served in place of the CDN script by the test harness only).
   In-memory tables persisted to localStorage, a request log with start/end phases (to check ordering),
   server-style constraint errors (duplicate key, missing foreign key), and the auth calls REBUILT uses.
   It is NOT part of the shipped app. */
(function () {
  const LS = "__fakesb";
  const TABLES = ["profiles", "user_profiles", "ai_profiles", "habits", "habit_completions", "tasks", "schedule_items", "daily_history", "unlocked_achievements", "ai_conversations"];
  let db;
  try { db = JSON.parse(localStorage.getItem(LS)); } catch (e) { db = null; }
  if (!db) { db = { users: [], sessionUserId: null, tables: {} }; }
  db.otps = db.otps || {}; db.tokens = db.tokens || {}; db.outbox = db.outbox || []; db.mailCount = db.mailCount || 0; db.lastMail = db.lastMail || {};
  TABLES.forEach((t) => { db.tables[t] = db.tables[t] || []; });
  const persist = () => { try { localStorage.setItem(LS, JSON.stringify(db)); } catch (e) {} };

  const sb = (window.__sb = { db, log: [], errors: [], authCalls: [], cfg: Object.assign({
    deleteDelay: 0, latency: 5, confirmRequired: true,
    // --- GoTrue behaviour simulated for the e-mail-link tests (all off by default) ---
    siteUrl: null,            // the project's "Site URL"; with allowList set, a redirect_to outside the list is replaced by it
    allowList: null,          // "Redirect URLs"; null = not simulated (redirect_to is honoured as given)
    emailQuota: null,         // total e-mails the built-in provider will send; then 429 over_email_send_rate_limit
    perAddressCooldown: 0,    // seconds between e-mails to one address ("you can only request this after N seconds")
    recoveryTemplate: 'otp',   // 'otp' = the Reset Password template shows {{ .Token }}; 'link' = the default link template
    teamEmails: null,         // when set, only these addresses can receive e-mail (built-in provider restriction)
    otpTtlSeconds: 3600,      // how long an e-mailed recovery code stays valid
    verifyLimit: null,        // max verifyOtp calls before 429 over_request_rate_limit (null = unlimited)
    google: {                 // Google OAuth as Supabase Auth would answer it (see signInWithOAuth / linkIdentity below)
      enabled: true,          // false → "Unsupported provider: provider is not enabled"
      manualLinking: true,    // false → linkIdentity answers 422 manual_linking_disabled
      accounts: [],           // the Google accounts that exist: { sub, email, name, verified }
      choose: null,           // which one the person picks at Google: a sub, 'cancel', or 'error:<code>'
      manualReturn: false,    // true → don't navigate back automatically; the test calls sb.googleReturnUrl itself
      errorText: 'Identity is already linked to another user',
    },
    inject: {},               // { signUp: [error, ...], resetPasswordForEmail: [...], signIn: [...], updateUser: [...] } consumed one per call
  }, window.__SB_CFG || {}) });
  // The trip to Google reloads the page; keep the record of the OAuth calls made before it (only those: other tests count calls per page load).
  (function () {
    const KEY = "__fakesb_oauth", isO = (c) => c.fn === "signInWithOAuth" || c.fn === "linkIdentity";
    try { (JSON.parse(sessionStorage.getItem(KEY) || "[]")).forEach((c) => sb.authCalls.push(c)); } catch (e) {}
    const push = sb.authCalls.push.bind(sb.authCalls);
    sb.authCalls.push = (c) => { const n = push(c); try { if (isO(c)) sessionStorage.setItem(KEY, JSON.stringify(sb.authCalls.filter(isO))); } catch (e) {} return n; };
  })();
  let seq = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const uuid = () => "u-" + Math.random().toString(16).slice(2, 10) + "-" + Date.now().toString(16);
  const sessionUser = () => db.users.find((u) => u.id === db.sessionUserId) || null;
  const identitiesOf = (u) => u.identities || [{ provider: "email", email: u.email }];
  const publicUser = (u) => (u ? { id: u.id, email: u.email, email_confirmed_at: u.confirmed ? '2026-10-26T00:00:00Z' : null, user_metadata: { name: u.name, full_name: u.name }, identities: identitiesOf(u).map((i) => ({ provider: i.provider, identity_id: i.provider + ":" + u.id, identity_data: { email: i.email } })) } : null);
  const session = () => { const u = sessionUser(); return u ? { access_token: "fake", user: publicUser(u) } : null; };
  const listeners = [];
  const emit = (event) => listeners.forEach((cb) => { try { cb(event, session()); } catch (e) {} });

  const authErr = (status, code, message) => ({ name: "AuthApiError", status, code, message });
  const injected = (fn) => { const q = sb.cfg.inject && sb.cfg.inject[fn]; return q && q.length ? q.shift() : null; };

  /** What GoTrue does when it e-mails a link: apply quotas, then pick the redirect target (redirect_to only if allowed, else Site URL). */
  function sendMail(type, to, redirectTo) {
    const c = sb.cfg;
    if (c.teamEmails && !c.teamEmails.includes(to)) return authErr(400, "email_address_not_authorized", "Email address not authorized");
    if (c.perAddressCooldown && db.lastMail[to] && Date.now() - db.lastMail[to] < c.perAddressCooldown * 1000) {
      return authErr(429, "over_email_send_rate_limit", "For security purposes, you can only request this after " + c.perAddressCooldown + " seconds.");
    }
    if (c.emailQuota != null && db.mailCount >= c.emailQuota) return authErr(429, "over_email_send_rate_limit", "email rate limit exceeded");
    if (type === 'recovery-otp') {
      // the e-mail carries a 6-digit code ({{ .Token }}); a newer code replaces the older one
      const code = String(Math.floor(100000 + Math.random() * 900000));
      db.otps[to] = { code, at: Date.now(), used: false };
      db.outbox.push({ type, to, code, redirectTo: redirectTo || null });
      db.mailCount += 1; db.lastMail[to] = Date.now(); persist();
      return null;
    }
    const allowed = !c.allowList || !redirectTo || redirectTo === c.siteUrl || c.allowList.includes(redirectTo);
    const effective = allowed ? (redirectTo || c.siteUrl) : c.siteUrl;
    const token = "tok-" + Math.random().toString(16).slice(2, 10);
    db.tokens[token] = { to, type, used: false };
    db.outbox.push({ type, to, token, redirectTo: redirectTo || null, effectiveRedirect: effective });
    db.mailCount += 1; db.lastMail[to] = Date.now();
    persist();
    return null;
  }

  /** Clicking the e-mailed link: GoTrue's /verify. One-time tokens; a used token redirects with an otp_expired error. */
  sb.followLink = (index) => {
    const mail = db.outbox[index == null ? db.outbox.length - 1 : index];
    const t = db.tokens[mail.token];
    if (!t || t.used) { return mail.effectiveRedirect + "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"; }
    t.used = true; persist();
    return mail.effectiveRedirect + "#access_token=" + mail.token + "&refresh_token=r&expires_in=3600&token_type=bearer&type=" + mail.type;
  };

  sb.confirm = (email) => { const u = db.users.find((x) => x.email === email); if (u) { u.confirmed = true; persist(); } };

  /* ---------------- query builder ---------------- */
  function builder(table) {
    const q = { table, op: "select", payload: null, filters: [], single: false, opts: null };
    const api = {
      select() { return api; },
      insert(p) { q.op = "insert"; q.payload = p; return api; },
      update(p) { q.op = "update"; q.payload = p; return api; },
      delete() { q.op = "delete"; return api; },
      upsert(p, o) { q.op = "upsert"; q.payload = p; q.opts = o || {}; return api; },
      eq(c, v) { q.filters.push([c, v]); return api; },
      order() { return api; },
      maybeSingle() { q.single = true; return api; },
      single() { q.single = true; return api; },
      then(res, rej) { return run(q).then(res, rej); },
    };
    return api;
  }

  const match = (row, filters) => filters.every(([c, v]) => row[c] === v);
  const fail = (table, op, code, message) => { const err = { code, message }; sb.errors.push({ table, op, code, message }); return { data: null, error: err }; };

  async function run(q) {
    const id = ++seq;
    const entry = { id, op: q.op, table: q.table, filters: q.filters.map((f) => f.join("=")), payload: q.payload };
    sb.log.push(Object.assign({ phase: "start", t: performance.now() }, entry));
    await wait(q.op === "delete" ? sb.cfg.deleteDelay : sb.cfg.latency);
    const out = exec(q);
    sb.log.push(Object.assign({ phase: "end", t: performance.now(), error: out.error ? out.error.code : null }, entry));
    persist();
    return out;
  }

  function exec(q) {
    const rows = db.tables[q.table];
    if (q.table === "user_xp_totals") {
      const uid = (q.filters.find((f) => f[0] === "user_id") || [])[1];
      const sum = (arr, k) => arr.filter((r) => r.user_id === uid).reduce((n, r) => n + (r[k] || 0), 0);
      const total = sum(db.tables.habit_completions, "xp_awarded") + sum(db.tables.tasks.filter((t) => t.completed), "xp_awarded") + sum(db.tables.unlocked_achievements, "xp_awarded");
      return { data: { total_xp: total }, error: null };
    }
    if (!rows) return fail(q.table, q.op, "42P01", "relation does not exist: " + q.table);

    if (q.op === "select") {
      const found = rows.filter((r) => match(r, q.filters)).map((r) => Object.assign({}, r));
      return { data: q.single ? found[0] || null : found, error: null };
    }
    if (q.op === "insert") {
      const list = Array.isArray(q.payload) ? q.payload : [q.payload];
      for (const p of list) {
        if (q.table === "habit_completions") {
          if (!db.tables.habits.some((h) => h.id === p.habit_id)) return fail(q.table, q.op, "23503", "foreign key violation: habit " + p.habit_id);
          if (rows.some((r) => r.habit_id === p.habit_id && r.completed_on === p.completed_on)) return fail(q.table, q.op, "23505", "duplicate completion");
        }
        if (p.id && rows.some((r) => r.id === p.id)) return fail(q.table, q.op, "23505", "duplicate key " + p.id);
        rows.push(Object.assign({ created_at: new Date().toISOString() }, p));
      }
      return { data: null, error: null };
    }
    if (q.op === "update") {
      rows.filter((r) => match(r, q.filters)).forEach((r) => Object.assign(r, q.payload));
      return { data: null, error: null };
    }
    if (q.op === "delete") {
      const keep = rows.filter((r) => !match(r, q.filters));
      const removed = rows.filter((r) => match(r, q.filters));
      db.tables[q.table] = keep;
      // cascade, like the real schema's ON DELETE CASCADE
      if (q.table === "habits") removed.forEach((h) => { db.tables.habit_completions = db.tables.habit_completions.filter((c) => c.habit_id !== h.id); });
      return { data: null, error: null };
    }
    if (q.op === "upsert") {
      const keys = String((q.opts && q.opts.onConflict) || "id").split(",");
      const list = Array.isArray(q.payload) ? q.payload : [q.payload];
      list.forEach((p) => {
        const existing = rows.find((r) => keys.every((k) => r[k] === p[k]));
        if (existing) { if (!q.opts.ignoreDuplicates) Object.assign(existing, p); } else rows.push(Object.assign({}, p));
      });
      return { data: null, error: null };
    }
    return fail(q.table, q.op, "0A000", "unsupported op");
  }

  /* ---------------- Google (what Supabase Auth does around the trip to Google) ---------------- */
  const newOAuthUser = (acct) => {
    const u = { id: uuid(), email: acct.email, password: null, name: acct.name || "", confirmed: true, identities: [{ provider: "google", email: acct.email, sub: acct.sub }] };
    db.users.push(u);
    // the same sign-up trigger as for an e-mail account: ONE row per table, created only when the auth user is created
    db.tables.profiles.push({ id: u.id, name: u.name, email: u.email, avatar: "", settings: {}, is_onboarded: false, created_at: new Date().toISOString() });
    db.tables.user_profiles.push({ user_id: u.id, occupation: "", occupation_custom: "", life_description: "", skills: [], hobbies: [], goals: [], challenges: "" });
    db.tables.ai_profiles.push({ user_id: u.id });
    return u;
  };
  const ownerOfGoogle = (sub) => db.users.find((u) => identitiesOf(u).some((i) => i.provider === "google" && i.sub === sub));

  /** The address the browser is sent back to after Google: tokens for the right user, or an error, as GoTrue would. */
  function googleReturnUrl(mode, redirectTo) {
    const c = sb.cfg, g = c.google;
    const allowed = !c.allowList || !redirectTo || redirectTo === c.siteUrl || c.allowList.includes(redirectTo);
    const base = allowed ? (redirectTo || c.siteUrl || (window.location.origin + window.location.pathname)) : c.siteUrl;
    const choice = g.choose;
    if (choice === "cancel") return base + "#error=access_denied&error_description=The+user+denied+access";
    if (typeof choice === "string" && choice.indexOf("error:") === 0) {
      return base + "#error=server_error&error_code=" + choice.slice(6) + "&error_description=" + encodeURIComponent(g.errorText);
    }
    const acct = g.accounts.find((a) => a.sub === choice);
    if (!acct) return base + "#error=access_denied&error_description=No+account+chosen";
    let user;
    if (mode === "link") {
      const me = sessionUser();
      const owner = ownerOfGoogle(acct.sub);
      if (owner && (!me || owner.id !== me.id)) return base + "#error=server_error&error_code=identity_already_exists&error_description=" + encodeURIComponent("Identity is already linked to another user");
      user = me;
      if (user && !owner) { user.identities = identitiesOf(user).concat({ provider: "google", email: acct.email, sub: acct.sub }); }
    } else {
      user = ownerOfGoogle(acct.sub);
      if (!user) {
        // automatic linking: the same VERIFIED e-mail on a CONFIRMED account → the Google identity joins that account
        const same = acct.verified !== false && db.users.find((u) => u.email === acct.email && u.confirmed);
        if (same) { same.identities = identitiesOf(same).concat({ provider: "google", email: acct.email, sub: acct.sub }); user = same; sb.autoLinked = (sb.autoLinked || 0) + 1; }
        else user = newOAuthUser(acct);
      }
    }
    const token = "oauth-" + Math.random().toString(16).slice(2, 10);
    db.tokens[token] = { oauthUserId: user.id };
    persist();
    return base + "#access_token=" + token + "&token_type=bearer&expires_in=3600&refresh_token=r&provider_token=g";
  }
  function leaveForGoogle(mode, redirectTo) {
    const back = googleReturnUrl(mode, redirectTo);
    sb.googleReturnUrl = back;
    if (!sb.cfg.google.manualReturn) setTimeout(() => { try { window.location.assign(back); window.location.reload(); } catch (e) { /* page is leaving */ } }, 0);
    return back;
  }

  /* ---------------- auth ---------------- */
  const auth = {
    async signInWithOAuth({ provider, options }) {
      sb.authCalls.push({ fn: "signInWithOAuth", provider, redirectTo: options && options.redirectTo, queryParams: options && options.queryParams });
      await wait(sb.cfg.latency);
      const inj = injected("signInWithOAuth"); if (inj) return { data: { provider, url: null }, error: inj };
      if (provider !== "google" || !sb.cfg.google.enabled) return { data: { provider, url: null }, error: authErr(400, "validation_failed", "Unsupported provider: provider is not enabled") };
      return { data: { provider, url: leaveForGoogle("signin", options && options.redirectTo) }, error: null };
    },
    async linkIdentity({ provider, options }) {
      sb.authCalls.push({ fn: "linkIdentity", provider, redirectTo: options && options.redirectTo });
      await wait(sb.cfg.latency);
      const inj = injected("linkIdentity"); if (inj) return { data: { provider, url: null }, error: inj };
      if (!sessionUser()) return { data: { provider, url: null }, error: authErr(403, "session_not_found", "Auth session missing!") };
      if (!sb.cfg.google.manualLinking) return { data: { provider, url: null }, error: authErr(422, "manual_linking_disabled", "Manual linking is disabled") };
      if (provider !== "google" || !sb.cfg.google.enabled) return { data: { provider, url: null }, error: authErr(400, "validation_failed", "Unsupported provider: provider is not enabled") };
      return { data: { provider, url: leaveForGoogle("link", options && options.redirectTo) }, error: null };
    },
    async getUserIdentities() {
      sb.authCalls.push({ fn: "getUserIdentities" });
      await wait(sb.cfg.latency);
      const inj = injected("getUserIdentities"); if (inj) return { data: null, error: inj };
      const u = sessionUser();
      if (!u) return { data: null, error: authErr(403, "session_not_found", "Auth session missing!") };
      return { data: { identities: publicUser(u).identities }, error: null };
    },
    async signUp({ email, password, options }) {
      sb.authCalls.push({ fn: "signUp", email, emailRedirectTo: options && options.emailRedirectTo });
      await wait(sb.cfg.latency);
      const inj = injected("signUp"); if (inj) return { data: { user: null, session: null }, error: inj };
      if (db.users.some((u) => u.email === email)) return { data: { user: null, session: null }, error: { message: "User already registered" } };
      if (sb.cfg.confirmRequired) { const me = sendMail("signup", email, options && options.emailRedirectTo); if (me) return { data: { user: null, session: null }, error: me }; } // a failed send rolls the sign-up back
      const u = { id: uuid(), email, password, name: (options && options.data && options.data.name) || "", confirmed: !sb.cfg.confirmRequired };
      db.users.push(u);
      // what the server-side signup trigger does
      db.tables.profiles.push({ id: u.id, name: u.name, email, avatar: "", settings: {}, is_onboarded: false, created_at: new Date().toISOString() });
      db.tables.user_profiles.push({ user_id: u.id, occupation: "", occupation_custom: "", life_description: "", skills: [], hobbies: [], goals: [], challenges: "" });
      db.tables.ai_profiles.push({ user_id: u.id });
      if (u.confirmed) db.sessionUserId = u.id;
      persist();
      return { data: { user: publicUser(u), session: u.confirmed ? session() : null }, error: null };
    },
    async signInWithPassword({ email, password }) {
      sb.authCalls.push({ fn: "signIn", email });
      await wait(sb.cfg.latency);
      const inj = injected("signIn"); if (inj) return { data: { user: null, session: null }, error: inj };
      const u = db.users.find((x) => x.email === email && x.password === password);
      if (!u) return { data: { user: null, session: null }, error: { message: "Invalid login credentials" } };
      if (!u.confirmed) return { data: { user: null, session: null }, error: { message: "Email not confirmed" } };
      db.sessionUserId = u.id; persist();
      return { data: { user: publicUser(u), session: session() }, error: null };
    },
    async signOut(opts) { sb.authCalls.push({ fn: "signOut", scope: opts && opts.scope }); db.sessionUserId = null; persist(); return { error: null }; },
    async resend({ type, email, options }) {
      sb.authCalls.push({ fn: "resend", type, email, emailRedirectTo: options && options.emailRedirectTo });
      await wait(sb.cfg.latency);
      const inj = injected("resend"); if (inj) return { data: { user: null, session: null }, error: inj };
      // GoTrue answers the same way for every address (nothing to learn about accounts); it only sends when it applies.
      const u = db.users.find((x) => x.email === email);
      if (u && !u.confirmed && type === 'signup') {
        const me = sendMail('signup', email, options && options.emailRedirectTo); if (me) return { data: { user: null, session: null }, error: me };
        // a newer confirmation message replaces the older one's token
        const newest = db.outbox[db.outbox.length - 1];
        Object.keys(db.tokens).forEach((k) => { if (db.tokens[k].to === email && k !== newest.token) db.tokens[k].used = true; });
        persist();
      }
      return { data: { user: null, session: null }, error: null };
    },
    async resetPasswordForEmail(email, opts) {
      sb.authCalls.push({ fn: "resetPasswordForEmail", email, redirectTo: opts && opts.redirectTo });
      await wait(sb.cfg.latency);
      const inj = injected("resetPasswordForEmail"); if (inj) return { data: null, error: inj };
      // like GoTrue, answer success whether or not the address exists; only a real account gets a mail
      const u = db.users.find((x) => x.email === email);
      if (u) { const me = sendMail(sb.cfg.recoveryTemplate === 'link' ? "recovery" : "recovery-otp", email, opts && opts.redirectTo); if (me) return { data: null, error: me }; }
      return { data: {}, error: null };
    },
    async updateUser(attrs) {
      sb.authCalls.push({ fn: "updateUser", hasPassword: !!attrs.password });
      await wait(sb.cfg.latency);
      const inj = injected("updateUser"); if (inj) return { data: null, error: inj };
      const u = sessionUser();
      if (!u) return { data: null, error: { message: "Auth session missing!" } };
      if (attrs.password === u.password) return { data: null, error: { code: "same_password", message: "New password should be different from the old password." } };
      if (attrs.password && attrs.password.length < 8) return { data: null, error: { code: "weak_password", message: "Password should be at least 8 characters." } };
      if (attrs.password) u.password = attrs.password;
      persist();
      return { data: { user: publicUser(u) }, error: null };
    },
    async verifyOtp({ email, token, type, token_hash }) {
      if (token_hash) {
        // the confirmation e-mail's own link:  …/?token_hash=…&type=email  (one-time; checked here, no redirect involved)
        sb.authCalls.push({ fn: "verifyOtp", type, token_hash });
        await wait(sb.cfg.latency);
        const injh = injected("verifyOtp"); if (injh) return { data: { user: null, session: null }, error: injh };
        const t = db.tokens[token_hash];
        if (!t || t.used || t.type !== "signup" || !(type === "email" || type === "signup")) return { data: { user: null, session: null }, error: authErr(403, "otp_expired", "Email link is invalid or has expired") };
        t.used = true;
        const u = db.users.find((x) => x.email === t.to);
        if (!u) return { data: { user: null, session: null }, error: authErr(403, "otp_expired", "Email link is invalid or has expired") };
        if (!sb.cfg.verifyLeavesUnconfirmed) u.confirmed = true;   // test switch: a server that answers without confirming
        db.sessionUserId = u.id; persist();
        emit("SIGNED_IN");
        return { data: { user: publicUser(u), session: session() }, error: null };
      }
      sb.authCalls.push({ fn: "verifyOtp", email, type, token: String(token) });
      await wait(sb.cfg.latency);
      const inj = injected("verifyOtp"); if (inj) return { data: { user: null, session: null }, error: inj };
      sb.verifyCalls = (sb.verifyCalls || 0) + 1;
      if (sb.cfg.verifyLimit != null && sb.verifyCalls > sb.cfg.verifyLimit) return { data: { user: null, session: null }, error: authErr(429, "over_request_rate_limit", "Request rate limit reached") };
      const o = db.otps[email];
      const expired = o && Date.now() - o.at > sb.cfg.otpTtlSeconds * 1000;
      // unknown address, wrong code, used code, replaced code and expired code all answer the same way (nothing to learn about accounts)
      if (type !== "recovery" || !o || o.used || o.code !== String(token) || expired) {
        return { data: { user: null, session: null }, error: authErr(403, "otp_expired", "Token has expired or is invalid") };
      }
      o.used = true;
      const u = db.users.find((x) => x.email === email);
      if (!u) return { data: { user: null, session: null }, error: authErr(403, "otp_expired", "Token has expired or is invalid") };
      db.sessionUserId = u.id; persist();
      const sess = session();
      emit("PASSWORD_RECOVERY");
      return { data: { user: publicUser(u), session: sess }, error: null };
    },
    async getSession() { return { data: { session: session() }, error: null }; },
    async getUser() { sb.authCalls.push({ fn: "getUser" }); const u = sessionUser(); return u ? { data: { user: publicUser(u) }, error: null } : { data: { user: null }, error: { message: "Auth session missing!" } }; },
    onAuthStateChange(cb) {
      listeners.push(cb);
      setTimeout(() => { cb("INITIAL_SESSION", session()); if (sb.recoveryPending) { sb.recoveryPending = false; cb("PASSWORD_RECOVERY", session()); } }, 0);
      return { data: { subscription: { unsubscribe() {} } } };
    },
  };

  window.supabase = {
    createClient(url, key) {
      (sb.created = sb.created || []).push({ url: String(url), key: String(key) });
      // detectSessionInUrl: a recovery link signs the user in and clears the hash, as the real library does.
      const h = window.location.hash || "";
      const tokenOf = (h.match(/access_token=([^&]+)/) || [])[1];
      const issued = tokenOf && db.tokens[tokenOf];
      if (issued && issued.oauthUserId) {
        // back from Google: the library turns the tokens in the address into a session and clears the hash
        db.sessionUserId = issued.oauthUserId; persist();
        history.replaceState(null, "", window.location.pathname + window.location.search);
      } else if (/error_description=|[#&?]error=/.test(h + window.location.search)) {
        // supabase-js: "a sign-in through the URL failed" → it REMOVES the stored session (except for identity_* errors).
        // index.html takes error parameters out of the address first, so this must never be reached in the app.
        sb.libraryErrorReached = true;
        if (!/identity_already_exists|identity_not_found|single_identity_not_deletable/.test(h + window.location.search)) { db.sessionUserId = null; persist(); }
        history.replaceState(null, "", window.location.pathname);
      } else if (issued && /type=signup/.test(h)) {
        // confirmation link: the address is now confirmed and the user is signed in
        const u = db.users.find((x) => x.email === issued.to); if (u) { u.confirmed = true; db.sessionUserId = u.id; persist(); }
        history.replaceState(null, "", window.location.pathname + window.location.search);
      } else if (/type=recovery/.test(h) && /access_token=/.test(h)) {
        const u = (issued && db.users.find((x) => x.email === issued.to)) || db.users.find((x) => x.confirmed) || null;
        if (u) { db.sessionUserId = u.id; persist(); sb.recoveryPending = true; }
        history.replaceState(null, "", window.location.pathname + window.location.search);
      } else if (/error_code=/.test(h)) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      return { auth, from: (t) => builder(t) };
    },
  };
})();
