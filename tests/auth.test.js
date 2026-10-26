/* ============================================================
   REBUILT — tests/auth.test.js
   Dependency-free checks (plain Node, no browser, no network). Run from the repo root:

       node tests/auth.test.js

   What they guard:
     1. No shipped file points at a development address (the reset e-mail once opened
        http://localhost:3000 → ERR_CONNECTION_REFUSED), and no secret key is shipped.
     2. The sign-up confirmation link target is derived from where the app is served, in one
        canonical form (https://<host>/<path>/). Password recovery sends NO link target at all:
        it e-mails a code that is typed into the app (resetPasswordForEmail → verifyOtp →
        updateUser), so it can no longer depend on the dashboard's Site URL.
     3. Supabase auth errors keep their own meaning instead of collapsing into a single
        "too many requests" message.
     4. The code step: digits are normalised, only a well-formed code reaches Supabase, the type
        sent is "recovery", wrong tries are counted per code request, and the app's own send /
        cooldown limits hold (and survive a refresh through the injected store).
     5. Google sign-in / linking: signInWithOAuth for signed-out people, linkIdentity (never
        signInWithOAuth) for the signed-in account, how a return from Google is read (success,
        cancel, "already linked to another user"), and that no Google secret ships.
   They do NOT talk to Supabase or Google. Whether the dashboard's Site URL / Redirect URLs are set is
   a project setting that code cannot check — see WEB-DEPLOYMENT.md.
   ============================================================ */

"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const PRODUCTION_URL = "https://omarelzanaty1.github.io/rebuilt0.4/";

let passed = 0;
const failures = [];
const queue = [];
/** Register a test; bodies may be sync or async and run one after another once everything is declared. */
function test(name, fn) {
  queue.push({ name, fn });
}
async function runAll() {
  for (const t of queue) {
    try {
      await t.fn();
      passed += 1;
      console.log("PASS " + t.name);
    } catch (err) {
      failures.push(t.name);
      console.log("FAIL " + t.name + "\n     " + String(err && err.message).split("\n").join("\n     "));
    }
  }
  console.log("\n" + passed + " passed, " + failures.length + " failed (of " + queue.length + ")");
  process.exit(failures.length ? 1 : 0);
}

/* ---------- helpers ---------- */

/** Every file the browser can receive from the site (docs and tests are not part of the running app). */
function shippedFiles(dir, out) {
  out = out || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    if (e.name === ".git" || e.name === "node_modules" || e.name === "tests") return;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) shippedFiles(full, out);
    else if (/\.(html|js|css|webmanifest|json|svg)$/i.test(e.name)) out.push(full);
  });
  return out;
}
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");

/** Load js/auth.js into a bare context with a stubbed Supabase client, as the browser would see it. */
function loadAuth(location, client, extras) {
  const sandbox = { console: { warn() {}, log() {}, error() {} }, URLSearchParams, URL };
  sandbox.window = sandbox;
  if (extras && extras.storage) sandbox.sessionStorage = extras.storage;
  if (extras && extras.boot) sandbox.__REBUILT_BOOT_URL = extras.boot;
  if (extras && extras.fetch) sandbox.fetch = extras.fetch;
  if (extras && extras.abortController) { sandbox.AbortController = extras.abortController; sandbox.setTimeout = extras.setTimeout; sandbox.clearTimeout = () => {}; }
  sandbox.window.location = location || { origin: "https://omarelzanaty1.github.io", pathname: "/rebuilt0.4/", search: "", hash: "" };
  sandbox.history = { replaceState() {} };
  sandbox.location = sandbox.window.location;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/auth.js"), "utf8"), sandbox, { filename: "js/auth.js" });
  if (client) sandbox.REBUILT.SupabaseClient = { isAvailable: () => true, get: () => client, CONFIG: extras && extras.config };
  return sandbox.REBUILT.Auth;
}

/** A recording stand-in for supabase.auth. */
function recordingClient(result) {
  const calls = [];
  const reply = (extra) => Object.assign({ data: { user: { id: "u1" }, session: null }, error: null }, result || {}, extra || {});
  return {
    calls,
    auth: {
      signUp: async (args) => { calls.push({ fn: "signUp", args }); return reply(); },
      signInWithPassword: async (args) => { calls.push({ fn: "signIn", args }); return reply(); },
      resetPasswordForEmail: async (email, opts) => { calls.push({ fn: "resetPasswordForEmail", email, opts }); return reply(); },
      updateUser: async (attrs) => { calls.push({ fn: "updateUser", attrs }); return reply(); },
      verifyOtp: async (args) => { calls.push({ fn: "verifyOtp", args }); return reply(); },
      signInWithOAuth: async (args) => { calls.push({ fn: "signInWithOAuth", args }); return reply({ data: { provider: "google", url: "https://accounts.example/auth" } }); },
      linkIdentity: async (args) => { calls.push({ fn: "linkIdentity", args }); return reply({ data: { provider: "google", url: "https://accounts.example/auth" } }); },
      getSession: async () => ({ data: { session: (result && result.session) === undefined ? { user: { id: "u1", email: "a@b.co", user_metadata: {} } } : result.session }, error: null }),
      getUserIdentities: async () => ({ data: { identities: (result && result.identities) || [] }, error: null }),
    },
  };
}

/* ============================================================
   1. Shipped files
   ============================================================ */

const files = shippedFiles(ROOT);

test("shipped files exist to scan (index.html, js/, css/)", () => {
  const names = files.map(rel);
  assert.ok(names.includes("index.html"), "index.html missing");
  assert.ok(names.some((n) => n.startsWith("js/")), "no js files found");
  assert.ok(names.some((n) => n.startsWith("css/")), "no css files found");
});

test("no shipped file mentions localhost:3000", () => {
  const hits = files.filter((f) => /localhost:3000/i.test(fs.readFileSync(f, "utf8"))).map(rel);
  assert.deepStrictEqual(hits, []);
});

test("no shipped file points at a local address (localhost / 127.0.0.1 / 0.0.0.0 / [::1])", () => {
  const hits = files
    .filter((f) => /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\b|\[::1\]/i.test(fs.readFileSync(f, "utf8")))
    .map(rel);
  assert.deepStrictEqual(hits, []);
});

test("every redirect target in js/ comes from redirectUrlFor(), never a literal URL", () => {
  const offenders = [];
  files.filter((f) => /\/js\//.test(f.split(path.sep).join("/"))).forEach((f) => {
    fs.readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (/(emailRedirectTo|redirectTo)\s*[:=]/.test(line) && /["'`]https?:/.test(line)) offenders.push(rel(f) + ":" + (i + 1) + "  " + line.trim());
    });
  });
  assert.deepStrictEqual(offenders, []);
});

test("sign-up passes a redirect target; password recovery passes none (it is code-based)", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/auth.js"), "utf8");
  assert.ok(/emailRedirectTo\s*=\s*redirect/.test(src), "signUp does not set emailRedirectTo");
  assert.ok(!/redirectTo:\s*redirect/.test(src), "resetPasswordForEmail must not carry a redirectTo any more");
  assert.ok(/resetPasswordForEmail\(\s*email\.trim\(\)\s*\)/.test(src), "resetPasswordForEmail should be called with the address only");
  assert.ok(/verifyOtp\(\{[^}]*type:\s*"recovery"/.test(src), "verifyOtp must be called with type: \"recovery\"");
});

test("no secret key ships: no sb_secret_ / service_role / long JWT in any shipped file", () => {
  const hits = [];
  files.forEach((f) => {
    const s = fs.readFileSync(f, "utf8");
    if (/sb_secret_/.test(s)) hits.push(rel(f) + " (sb_secret_)");
    if (/service_role/i.test(s)) hits.push(rel(f) + " (service_role)");
    if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/.test(s)) hits.push(rel(f) + " (JWT)");
  });
  assert.deepStrictEqual(hits, []);
});

test("supabaseClient.js uses the REBUILT project URL and only a publishable key", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/supabaseClient.js"), "utf8");
  assert.ok(src.includes('"https://jvyhtpfedkypwdzyadba.supabase.co"'), "unexpected project URL");
  assert.ok(/anonKey:\s*"sb_publishable_[A-Za-z0-9_-]+"/.test(src), "key is not a publishable key");
});

test("index.html carries the build marker (how a host's live version is identified)", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const m = html.match(/<meta name="rebuilt-build" content="([^"]+)"\s*\/?>/);
  assert.ok(m, "rebuilt-build meta missing");
  assert.ok(/google-(auth|preflight)/.test(m[1]), "marker should name the Google sign-in build, got: " + m[1]);
  assert.ok(/<meta name="generator" content="REBUILT [^"]*google-(auth|preflight)[^"]*"/.test(html), "generator meta should match");
});

test("the recovery screens never promise a link (the flow is code-based)", () => {
  const gate = fs.readFileSync(path.join(ROOT, "js/gate.js"), "utf8");
  assert.ok(/autocomplete[^\n]*one-time-code/.test(gate), "code field should offer one-time-code autofill");
  assert.ok(/inputmode[^\n]*numeric/.test(gate), "code field should open the numeric keypad");
  assert.ok(!/forgot-sent/.test(gate), "the old 'link sent' step is gone");
});

test("canonical redirect target for the Vercel host", () => {
  assert.strictEqual(Auth.redirectUrlFor({ origin: "https://rebuilt-jet.vercel.app", pathname: "/" }), "https://rebuilt-jet.vercel.app/");
  assert.strictEqual(Auth.redirectUrlFor({ origin: "https://rebuilt-jet.vercel.app", pathname: "/index.html", search: "?a=1", hash: "#access_token=x" }), "https://rebuilt-jet.vercel.app/");
});

test("supabase-js keeps the implicit flow (recovery links must arrive as #access_token=…)", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/supabaseClient.js"), "utf8");
  assert.ok(/flowType:\s*"implicit"/.test(src));
});

/* ============================================================
   2. Redirect target
   ============================================================ */

const Auth = loadAuth();

test("production page → https://omarelzanaty1.github.io/rebuilt0.4/", () => {
  assert.strictEqual(Auth.redirectUrlFor({ origin: "https://omarelzanaty1.github.io", pathname: "/rebuilt0.4/" }), PRODUCTION_URL);
});

test("without the trailing slash → the same canonical URL", () => {
  assert.strictEqual(Auth.redirectUrlFor({ origin: "https://omarelzanaty1.github.io", pathname: "/rebuilt0.4" }), PRODUCTION_URL);
});

test("opened as …/index.html → the same canonical URL", () => {
  assert.strictEqual(Auth.redirectUrlFor({ origin: "https://omarelzanaty1.github.io", pathname: "/rebuilt0.4/index.html" }), PRODUCTION_URL);
});

test("query string and hash (which can carry tokens) are never part of the target", () => {
  const url = Auth.redirectUrlFor({
    origin: "https://omarelzanaty1.github.io",
    pathname: "/rebuilt0.4/",
    search: "?type=recovery&code=abc",
    hash: "#access_token=SECRET&type=recovery",
  });
  assert.strictEqual(url, PRODUCTION_URL);
  assert.ok(!/SECRET|access_token|code=/.test(url));
});

test("a custom domain at the site root works without any code change", () => {
  assert.strictEqual(Auth.redirectUrlFor({ origin: "https://app.example.com", pathname: "/" }), "https://app.example.com/");
});

test("not served over http(s) (file://, about:blank, missing) → empty, so the option is omitted", () => {
  assert.strictEqual(Auth.redirectUrlFor({ origin: "null", pathname: "/x/index.html" }), "");
  assert.strictEqual(Auth.redirectUrlFor({ origin: "file://", pathname: "/x/index.html" }), "");
  assert.strictEqual(Auth.redirectUrlFor({}), "");
  assert.strictEqual(Auth.redirectUrlFor(null), "");
});

test("signUp sends emailRedirectTo = the published URL", async () => {
  const client = recordingClient();
  const auth = loadAuth(undefined, client);
  const state = { user: {}, meta: {} };
  const res = await auth.signUp(state, { name: "Omar", email: " a@b.co ", password: "12345678" });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.needsEmailConfirmation, true);
  assert.strictEqual(client.calls.length, 1, "exactly one signUp request");
  assert.strictEqual(client.calls[0].args.options.emailRedirectTo, PRODUCTION_URL);
  assert.strictEqual(client.calls[0].args.email, "a@b.co");
  assert.strictEqual(client.calls[0].args.options.data.name, "Omar");
});

test("requestPasswordReset asks for a code: the address only, NO redirect target", async () => {
  const client = recordingClient();
  const auth = loadAuth({ origin: "https://rebuilt-jet.vercel.app", pathname: "/", search: "", hash: "" }, client);
  const res = await auth.requestPasswordReset("  a@b.co ");
  assert.strictEqual(res.ok, true);
  assert.strictEqual(client.calls.length, 1, "exactly one request");
  assert.strictEqual(client.calls[0].fn, "resetPasswordForEmail");
  assert.strictEqual(client.calls[0].email, "a@b.co");
  assert.strictEqual(client.calls[0].opts, undefined, "no options (no redirectTo) may be sent");
});

test("off http(s), the sign-up redirect option is left out rather than sent empty", async () => {
  const client = recordingClient();
  const auth = loadAuth({ origin: "null", pathname: "/index.html", search: "", hash: "" }, client);
  await auth.signUp({ user: {}, meta: {} }, { name: "O", email: "a@b.co", password: "12345678" });
  assert.ok(!("emailRedirectTo" in client.calls[0].args.options));
});

/* ============================================================
   3. Error reading
   ============================================================ */

const E = (status, code, message, name) => ({ status, code, message, name: name || "AuthApiError" });
const kindOf = (err) => Auth.classifyError(err).kind;

test("429 over_email_send_rate_limit (project e-mail quota) is its own error, not 'too many requests'", () => {
  const c = Auth.classifyError(E(429, "over_email_send_rate_limit", "email rate limit exceeded"));
  assert.strictEqual(c.kind, "email_quota");
  assert.ok(c.limited && c.retryAfter > 0);
  assert.ok(/رسائل الإيميل/.test(c.text), c.text);
  assert.ok(!/طلبات كتير/.test(c.text), "must not reuse the generic rate-limit text");
});

test("'only request this after N seconds' → waits exactly N seconds", () => {
  const c = Auth.classifyError(E(429, "over_email_send_rate_limit", "For security purposes, you can only request this after 48 seconds."));
  assert.strictEqual(c.kind, "email_frequency");
  assert.strictEqual(c.retryAfter, 48);
  assert.ok(c.text.includes("48"));
});

test("429 over_request_rate_limit → the general 'too many requests' message", () => {
  const c = Auth.classifyError(E(429, "over_request_rate_limit", "Request rate limit reached"));
  assert.strictEqual(c.kind, "rate");
  assert.ok(/طلبات كتير ورا بعض/.test(c.text));
  assert.ok(c.limited);
});

test("the generic message is used ONLY for the general rate limit", () => {
  const generic = Auth.classifyError(E(429, "over_request_rate_limit", "x")).text;
  const others = [
    E(429, "over_email_send_rate_limit", "email rate limit exceeded"),
    E(400, "email_address_not_authorized", "Email address not authorized"),
    E(422, "user_already_exists", "User already registered"),
    E(422, "weak_password", "Password should be at least 8 characters"),
    E(400, "email_address_invalid", "Email address \"x\" is invalid"),
    E(422, "signup_disabled", "Signups not allowed for this instance"),
    E(500, "unexpected_failure", "Error sending confirmation email"),
    E(400, "otp_expired", "Email link is invalid or has expired"),
    E(400, "invalid_credentials", "Invalid login credentials"),
    E(400, "email_not_confirmed", "Email not confirmed"),
    { name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" },
  ];
  others.forEach((o) => assert.notStrictEqual(Auth.classifyError(o).text, generic, JSON.stringify(o)));
});

test("each real cause maps to its own kind", () => {
  assert.strictEqual(kindOf(E(400, "email_address_not_authorized", "Email address not authorized")), "email_not_authorized");
  assert.strictEqual(kindOf(E(422, "user_already_exists", "User already registered")), "exists");
  assert.strictEqual(kindOf(E(422, "email_exists", "A user with this email address has already been registered")), "exists");
  assert.strictEqual(kindOf(E(400, "email_address_invalid", 'Email address "a@b" is invalid')), "email_invalid");
  assert.strictEqual(kindOf(E(422, "signup_disabled", "Signups not allowed for this instance")), "signup_disabled");
  assert.strictEqual(kindOf(E(500, "unexpected_failure", "Error sending confirmation email")), "email_send_failed");
  assert.strictEqual(kindOf(E(422, "weak_password", "Password should be at least 8 characters.")), "weak_password");
  assert.strictEqual(kindOf(E(422, "same_password", "New password should be different from the old password.")), "same_password");
  assert.strictEqual(kindOf(E(400, "otp_expired", "Email link is invalid or has expired")), "expired");
  assert.strictEqual(kindOf(E(403, "session_not_found", "Auth session missing!")), "no_session");
  assert.strictEqual(kindOf(E(400, "invalid_credentials", "Invalid login credentials")), "credentials");
  assert.strictEqual(kindOf(E(400, "email_not_confirmed", "Email not confirmed")), "not_confirmed");
  assert.strictEqual(kindOf({ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" }), "network");
});

test("limits are the only errors that ask the UI to pause", () => {
  assert.ok(Auth.classifyError(E(429, "over_request_rate_limit", "x")).limited);
  assert.ok(!Auth.classifyError(E(400, "invalid_credentials", "Invalid login credentials")).limited);
  assert.ok(!Auth.classifyError(E(422, "user_already_exists", "x")).limited);
});

test("an unknown error is reported as unknown and keeps the server's code", () => {
  const c = Auth.classifyError(E(418, "teapot_error", "I am a teapot"));
  assert.strictEqual(c.kind, "unknown");
  assert.ok(c.text.includes("teapot_error"), c.text);
  assert.ok(!/طلبات كتير/.test(c.text));
});

test("the 8-character minimum is quoted from the same constant everywhere", () => {
  assert.strictEqual(Auth.MIN_PASSWORD_LENGTH, 8);
  assert.ok(/8/.test(Auth.classifyError(E(422, "weak_password", "Password should be at least 6 characters.")).text) || /قوي/.test(Auth.classifyError(E(422, "weak_password", "x")).text));
});

test("a failed sign-up returns the machine-readable reason to the screen", async () => {
  const client = recordingClient({ data: { user: null, session: null }, error: E(429, "over_email_send_rate_limit", "email rate limit exceeded") });
  const auth = loadAuth(undefined, client);
  const res = await auth.signUp({ user: {}, meta: {} }, { name: "O", email: "a@b.co", password: "12345678" });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.kind, "email_quota");
  assert.strictEqual(res.code, "over_email_send_rate_limit");
  assert.strictEqual(res.limited, true);
  assert.ok(res.retryAfter > 0);
});

/* ============================================================
   4. Recovery by code
   ============================================================ */

test("normalizeCode: spaces, dashes and Arabic-Indic / Persian digits become plain digits", () => {
  assert.strictEqual(Auth.normalizeCode("483 209"), "483209");
  assert.strictEqual(Auth.normalizeCode("483-209"), "483209");
  assert.strictEqual(Auth.normalizeCode("\u0664\u0668\u0663 \u0662\u0660\u0669"), "483209");
  assert.strictEqual(Auth.normalizeCode("\u06F4\u06F8\u06F3\u06F2\u06F0\u06F9"), "483209");
  assert.strictEqual(Auth.normalizeCode(" 12ab34 "), "1234");
  assert.strictEqual(Auth.normalizeCode(null), "");
});

test("validateOtpCode: 6–10 digits only", () => {
  assert.strictEqual(Auth.validateOtpCode({ code: "" }).valid, false);
  assert.strictEqual(Auth.validateOtpCode({ code: "12345" }).valid, false);
  assert.strictEqual(Auth.validateOtpCode({ code: "abcdef" }).valid, false);
  assert.strictEqual(Auth.validateOtpCode({ code: "12345678901" }).valid, false);
  const ok = Auth.validateOtpCode({ code: "\u0661\u0662\u0663 \u0664\u0665\u0666" });
  assert.strictEqual(ok.valid, true);
  assert.strictEqual(ok.code, "123456");
  assert.ok(Auth.validateOtpCode({ code: "123" }).errors.code);
});

test("verifyRecoveryCode sends { email, token: plain digits, type: 'recovery' } and nothing else", async () => {
  const client = recordingClient({ data: { user: { id: "u1" }, session: { access_token: "t" } } });
  const auth = loadAuth(undefined, client);
  const res = await auth.verifyRecoveryCode(" a@b.co ", "\u0664\u0668\u0663 209");
  assert.strictEqual(res.ok, true);
  assert.strictEqual(client.calls.length, 1);
  assert.strictEqual(JSON.stringify(client.calls[0].args), JSON.stringify({ email: "a@b.co", token: "483209", type: "recovery" }));
});

test("a malformed code never reaches Supabase", async () => {
  const client = recordingClient();
  const auth = loadAuth(undefined, client);
  const res = await auth.verifyRecoveryCode("a@b.co", "123");
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.kind, "invalid_format");
  assert.strictEqual(client.calls.length, 0);
});

test("verifyOtp answering without a session is a failure (never opens the new-password step)", async () => {
  const client = recordingClient({ data: { user: null, session: null } });
  const auth = loadAuth(undefined, client);
  const res = await auth.verifyRecoveryCode("a@b.co", "123456");
  assert.strictEqual(res.ok, false);
});

test("wrong / expired code → one clear message, tries counted, the 5th wrong try locks locally", async () => {
  const client = recordingClient({ data: { user: null, session: null }, error: E(403, "otp_expired", "Token has expired or is invalid") });
  const auth = loadAuth(undefined, client);
  assert.strictEqual(Auth.classifyError(E(403, "otp_expired", "Token has expired or is invalid"), "code").kind, "code_invalid");
  const left = [];
  for (let i = 0; i < 4; i++) {
    const r = await auth.verifyRecoveryCode("a@b.co", "11111" + i);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.kind, "code_invalid");
    assert.ok(/غلط أو انتهت/.test(r.error), r.error);
    left.push(r.attemptsLeft);
  }
  assert.deepStrictEqual(left, [4, 3, 2, 1]);
  const fifth = await auth.verifyRecoveryCode("a@b.co", "111115");
  assert.strictEqual(fifth.exhausted, true);
  assert.strictEqual(client.calls.length, 5);
  const sixth = await auth.verifyRecoveryCode("a@b.co", "123456");
  assert.strictEqual(sixth.ok, false);
  assert.strictEqual(sixth.exhausted, true);
  assert.strictEqual(client.calls.length, 5, "after the lock, even a right-looking code is not sent");
});

test("a verification rate limit (429) is shown as a pause and is not counted as a wrong try", async () => {
  const client = recordingClient({ data: { user: null, session: null }, error: E(429, "over_request_rate_limit", "Request rate limit reached") });
  const auth = loadAuth(undefined, client);
  const r = await auth.verifyRecoveryCode("a@b.co", "123456");
  assert.strictEqual(r.kind, "rate");
  assert.strictEqual(r.limited, true);
  assert.strictEqual(Auth.Recovery.attemptsLeft(), 5);
});

test("a wrong code and an expired code get the same answer; a 429 does not", () => {
  const a = Auth.classifyError(E(403, "otp_expired", "Token has expired or is invalid"), "code");
  const b = Auth.classifyError(E(400, "validation_failed", "Verify requires a verification type"), "code");
  const c = Auth.classifyError(E(403, "otp_expired", "Email link is invalid or has expired"), "code");
  assert.strictEqual(a.text, c.text);
  assert.strictEqual(a.kind, "code_invalid");
  assert.ok(b.kind === "code_invalid" || b.kind === "unknown");
  assert.strictEqual(Auth.classifyError(E(429, "over_request_rate_limit", "x"), "code").kind, "rate");
  assert.strictEqual(Auth.classifyError({ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" }, "code").kind, "network");
});

/** Recovery guard with an injected store and clock, so cooldowns and windows can be walked through. */
function guard(limits) {
  const mem = {};
  const store = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  let t = 1000000;
  const clock = () => t;
  const g = Auth.createRecoveryGuard(store, clock, Object.assign({}, Auth.RECOVERY_LIMITS, limits || {}));
  return { g, store, mem, advance: (sec) => { t += sec * 1000; }, again: () => Auth.createRecoveryGuard(store, clock, Object.assign({}, Auth.RECOVERY_LIMITS, limits || {})) };
}

test("guard: 60 s cooldown per address after a code is sent, and it counts down", () => {
  const { g, advance } = guard();
  assert.strictEqual(g.canSend("a@b.co").ok, true);
  g.noteSent("a@b.co");
  const w = g.canSend("a@b.co");
  assert.strictEqual(w.ok, false);
  assert.strictEqual(w.reason, "cooldown");
  assert.strictEqual(w.waitSeconds, 60);
  advance(45);
  assert.strictEqual(g.canSend("a@b.co").waitSeconds, 15);
  advance(15);
  assert.strictEqual(g.canSend("a@b.co").ok, true);
});

test("guard: the cooldown is per address (case-insensitive), a different address is not held", () => {
  const { g } = guard();
  g.noteSent("a@b.co");
  assert.strictEqual(g.canSend("A@B.CO").ok, false);
  assert.strictEqual(g.canSend("other@b.co").ok, true);
});

test("guard: at most 5 code requests per hour per tab, then the wait shows when the oldest drops out", () => {
  const { g, advance } = guard({ resendCooldownSeconds: 0 });
  for (let i = 0; i < 5; i++) { assert.strictEqual(g.canSend("a@b.co").ok, true, "send " + i); g.noteSent("a@b.co"); advance(10); }
  const w = g.canSend("a@b.co");
  assert.strictEqual(w.ok, false);
  assert.strictEqual(w.reason, "quota");
  assert.strictEqual(w.waitSeconds, 3600 - 50);
  advance(3600 - 50);
  assert.strictEqual(g.canSend("a@b.co").ok, true);
});

test("guard: wrong tries are counted per request and a new code resets them", () => {
  const { g } = guard();
  assert.strictEqual(g.attemptsLeft(), 5);
  assert.strictEqual(g.noteWrong(), 4);
  assert.strictEqual(g.noteWrong(), 3);
  g.noteSent("a@b.co");
  assert.strictEqual(g.attemptsLeft(), 5);
  for (let i = 0; i < 5; i++) g.noteWrong();
  assert.strictEqual(g.attemptsLeft(), 0);
  g.clearWrong();
  assert.strictEqual(g.attemptsLeft(), 5);
});

test("guard: state survives a reload (a second guard over the same store sees it) and keeps no e-mail address", () => {
  const { g, again, mem } = guard();
  g.noteSent("someone@example.com");
  for (let i = 0; i < 5; i++) g.noteWrong();
  const reloaded = again();
  assert.strictEqual(reloaded.attemptsLeft(), 0);
  assert.strictEqual(reloaded.canSend("someone@example.com").ok, false);
  const stored = JSON.stringify(mem);
  assert.ok(!/someone|example\.com|@/.test(stored), "the e-mail address must not be stored: " + stored);
});

test("guard: unreadable stored state starts clean instead of throwing", () => {
  const { g, store } = guard();
  store.setItem("rebuilt.recoveryGuard", "{not json");
  assert.strictEqual(g.attemptsLeft(), 5);
  assert.strictEqual(g.canSend("a@b.co").ok, true);
});

test("requestPasswordReset obeys the guard: second request inside the cooldown is not sent", async () => {
  const client = recordingClient();
  const auth = loadAuth(undefined, client);
  assert.strictEqual((await auth.requestPasswordReset("a@b.co")).ok, true);
  const again = await auth.requestPasswordReset("a@b.co");
  assert.strictEqual(again.ok, false);
  assert.strictEqual(again.limited, true);
  assert.ok(again.retryAfter > 0 && again.retryAfter <= 60);
  assert.strictEqual(client.calls.length, 1, "only one e-mail was requested");
});

test("a failed request for a code does not start the cooldown", async () => {
  const client = recordingClient({ data: { user: null, session: null }, error: E(500, "unexpected_failure", "Error sending recovery email") });
  const auth = loadAuth(undefined, client);
  assert.strictEqual((await auth.requestPasswordReset("a@b.co")).ok, false);
  assert.strictEqual((await auth.requestPasswordReset("a@b.co")).ok, false);
  assert.strictEqual(client.calls.length, 2, "the second try is allowed through");
});

test("the three stages are the official ones, in order: reset → verifyOtp → updateUser", async () => {
  const client = recordingClient({ data: { user: { id: "u1" }, session: { access_token: "t" } } });
  const auth = loadAuth(undefined, client);
  await auth.requestPasswordReset("a@b.co");
  await auth.verifyRecoveryCode("a@b.co", "123456");
  await auth.updatePassword("newpass123");
  assert.deepStrictEqual(client.calls.map((c) => c.fn), ["resetPasswordForEmail", "verifyOtp", "updateUser"]);
  assert.strictEqual(JSON.stringify(client.calls[2].attrs), JSON.stringify({ password: "newpass123" }));  // JSON: objects built inside the vm sandbox have another prototype
});

test("no code is generated, stored or compared in the app (Supabase Auth owns it)", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/auth.js"), "utf8") + fs.readFileSync(path.join(ROOT, "js/gate.js"), "utf8");
  assert.ok(!/Math\.random|crypto\.getRandomValues/.test(src), "the app must not generate codes");
  assert.ok(!/localStorage\.setItem\([^)]*(otp|code)/i.test(src), "no code in localStorage");
});


/* ============================================================
   5. Google sign-in and linking
   ============================================================ */

/** A tiny sessionStorage stand-in (the vm sandbox has none). */
function memStorage() {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; }, _m: m };
}
const PROD_LOC = { origin: "https://rebuilt-jet.vercel.app", pathname: "/", search: "", hash: "" };

test("no Google client secret or client id ships (the secret lives only in the Supabase dashboard)", () => {
  const hits = [];
  files.forEach((f) => {
    const src = fs.readFileSync(f, "utf8");
    if (/GOCSPX-/.test(src)) hits.push(rel(f) + " (GOCSPX-)");
    if (/client_secret/i.test(src)) hits.push(rel(f) + " (client_secret)");
    if (/[0-9]{6,}-[a-z0-9]{10,}\.apps\.googleusercontent\.com/i.test(src)) hits.push(rel(f) + " (OAuth client id)");
  });
  assert.deepStrictEqual(hits, []);
});

test("the Google button uses the official four-colour G and the required wording", () => {
  const icons = fs.readFileSync(path.join(ROOT, "js/icons.js"), "utf8");
  ["#EA4335", "#4285F4", "#FBBC05", "#34A853"].forEach((c) => assert.ok(icons.includes(c), "missing " + c));
  const gate = fs.readFileSync(path.join(ROOT, "js/gate.js"), "utf8");
  assert.ok(gate.includes("المتابعة باستخدام Google"));
});

test("parseAuthReturn: every shape of address is read as what it is", () => {
  const P = (hash, search, marker) => Auth.parseAuthReturn({ hash: hash || "", search: search || "" }, marker || null);
  const link = { mode: "link", uid: "u1" }, signin = { mode: "signin", uid: "" };
  assert.strictEqual(P("#access_token=x&type=recovery").kind, "recovery");
  assert.strictEqual(P("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired").kind, "recovery-error");
  assert.strictEqual(P("#error=access_denied&error_code=otp_expired&error_description=x", "", link).kind, "recovery-error", "an expired e-mail link stays an e-mail-link problem even with a marker around");
  const cancel = P("#error=access_denied&error_description=The+user+denied+access");
  assert.strictEqual(cancel.kind, "oauth-error");
  assert.strictEqual(cancel.mode, "signin");
  assert.strictEqual(P("#error=access_denied&error_description=The+user+denied+access", "", link).mode, "link");
  const taken = P("#error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user", "", link);
  assert.strictEqual(taken.kind, "oauth-error");
  assert.strictEqual(taken.code, "identity_already_exists");
  assert.strictEqual(P("", "?error=access_denied&error_description=denied").kind, "oauth-error", "query-string errors too");
  const ok = P("#access_token=x&refresh_token=y&provider_token=z", "", link);
  assert.strictEqual(ok.kind, "oauth-ok");
  assert.strictEqual(ok.uid, "u1");
  assert.strictEqual(P("#access_token=x", "", signin).mode, "signin");
  assert.strictEqual(P("#access_token=x").kind, "none", "tokens with no marker are left to supabase-js, nothing is claimed");
  assert.strictEqual(P("").kind, "none");
  assert.strictEqual(P("#settings").kind, "none");
});

test("Google errors keep their own meaning (and the sign-in / link wording differs where it should)", () => {
  const K = (err, ctx) => Auth.classifyError(err, ctx);
  assert.strictEqual(K(E(422, "identity_already_exists", "Identity is already linked to another user"), "link").kind, "identity_taken");
  assert.ok(/مش هندمج/.test(K({ code: "identity_already_exists", message: "x" }, "link").text));
  assert.strictEqual(K(E(422, "manual_linking_disabled", "Manual linking is disabled"), "link").kind, "linking_disabled");
  assert.strictEqual(K(E(400, "validation_failed", "Unsupported provider: provider is not enabled"), "oauth").kind, "provider_disabled");
  assert.strictEqual(K(E(400, "oauth_provider_not_supported", "x"), "oauth").kind, "provider_disabled");
  assert.strictEqual(K({ code: "access_denied", message: "The user denied access" }, "oauth").kind, "oauth_cancelled");
  assert.notStrictEqual(K({ code: "access_denied", message: "x" }, "oauth").text, K({ code: "access_denied", message: "x" }, "link").text);
  assert.strictEqual(K(E(400, "provider_email_needs_verification", "Unverified email with google"), "oauth").kind, "provider_email_unverified");
  assert.strictEqual(K(E(500, "unexpected_failure", "boom"), "oauth").kind, "oauth_failed");
  assert.ok(K(E(500, "unexpected_failure", "boom"), "oauth").text.includes("unexpected_failure"), "the server's code is kept for diagnosis");
  assert.strictEqual(K(E(429, "over_request_rate_limit", "x"), "oauth").kind, "rate", "limits still read as limits");
  assert.strictEqual(K({ name: "AuthRetryableFetchError", status: 0, message: "Failed to fetch" }, "oauth").kind, "network");
  // outside the Google context nothing changed
  assert.strictEqual(K({ code: "access_denied", message: "x" }).kind, "unknown");
});

test("signInWithGoogle: provider google, redirect = the published address, a marker for the way back, no secrets", async () => {
  const client = recordingClient();
  const store = memStorage();
  const auth = loadAuth(PROD_LOC, client, { storage: store });
  const res = await auth.signInWithGoogle();
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.redirecting, true);
  assert.strictEqual(client.calls.length, 1);
  assert.strictEqual(client.calls[0].fn, "signInWithOAuth");
  assert.strictEqual(client.calls[0].args.provider, "google");
  assert.strictEqual(client.calls[0].args.options.redirectTo, "https://rebuilt-jet.vercel.app/");
  assert.strictEqual(client.calls[0].args.options.queryParams.prompt, "select_account");
  const marker = JSON.parse(store.getItem("rebuilt.oauth"));
  assert.strictEqual(marker.mode, "signin");
  assert.ok(!/token|secret|@/.test(JSON.stringify(marker)), "the marker holds no token or e-mail");
});

test("signInWithGoogle: a server refusal clears the marker and explains itself", async () => {
  const client = recordingClient({ data: { provider: "google", url: null }, error: E(400, "validation_failed", "Unsupported provider: provider is not enabled") });
  const store = memStorage();
  const auth = loadAuth(PROD_LOC, client, { storage: store });
  const res = await auth.signInWithGoogle();
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.kind, "provider_disabled");
  assert.strictEqual(store.getItem("rebuilt.oauth"), null);
});

/* ---- the "is Google switched on?" preflight (GET /auth/v1/settings → external.google) ---- */
const SB_CFG = { url: "https://jvyhtpfedkypwdzyadba.supabase.co", anonKey: "sb_publishable_TEST" };
const settingsFetch = (body, opts) => {
  const seen = [];
  const f = async (url, init) => {
    seen.push({ url, init });
    if (opts && opts.throws) throw new Error("Failed to fetch");
    return { ok: !(opts && opts.status && opts.status >= 400), status: (opts && opts.status) || 200, json: async () => { if (opts && opts.badJson) throw new Error("not json"); return body; } };
  };
  f.seen = seen;
  return f;
};

test("preflight: settings say Google is OFF → provider_disabled, nothing sent to Supabase Auth, no marker, never leaves the page", async () => {
  const client = recordingClient();
  const store = memStorage();
  const f = settingsFetch({ external: { email: true, google: false } });
  const auth = loadAuth(PROD_LOC, client, { storage: store, fetch: f, config: SB_CFG });
  const res = await auth.signInWithGoogle();
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.kind, "provider_disabled");
  assert.ok(/لسه مش متفعّل/.test(res.error));
  assert.strictEqual(client.calls.length, 0, "signInWithOAuth is not called, so the browser is never sent to the raw JSON error page");
  assert.strictEqual(store.getItem("rebuilt.oauth"), null);
  assert.strictEqual(f.seen.length, 1);
  assert.strictEqual(f.seen[0].url, "https://jvyhtpfedkypwdzyadba.supabase.co/auth/v1/settings");
  assert.strictEqual(JSON.stringify(f.seen[0].init.headers), JSON.stringify({ apikey: "sb_publishable_TEST" }), "only the publishable key is sent");
});

test("preflight: settings say Google is ON → the normal OAuth call goes ahead", async () => {
  const client = recordingClient();
  const auth = loadAuth(PROD_LOC, client, { storage: memStorage(), fetch: settingsFetch({ external: { google: true } }), config: SB_CFG });
  const res = await auth.signInWithGoogle();
  assert.strictEqual(res.ok, true);
  assert.strictEqual(client.calls.length, 1);
  assert.strictEqual(client.calls[0].fn, "signInWithOAuth");
});

test("preflight is fail-open: anything but an explicit google:false lets the normal flow decide", async () => {
  const cases = {
    "request throws": settingsFetch({}, { throws: true }),
    "HTTP 500": settingsFetch({ msg: "boom" }, { status: 500 }),
    "body is not JSON": settingsFetch({}, { badJson: true }),
    "no `external` field": settingsFetch({ disable_signup: false }),
    "google missing": settingsFetch({ external: { email: true } }),
    "google is null": settingsFetch({ external: { google: null } }),
  };
  for (const name of Object.keys(cases)) {
    const client = recordingClient();
    const auth = loadAuth(PROD_LOC, client, { storage: memStorage(), fetch: cases[name], config: SB_CFG });
    const res = await auth.signInWithGoogle();
    assert.strictEqual(res.ok, true, name);
    assert.strictEqual(client.calls.length, 1, name);
  }
  // no fetch at all / no config (older browser, local mode stub) → unchanged behaviour
  const c2 = recordingClient();
  assert.strictEqual((await loadAuth(PROD_LOC, c2, { storage: memStorage() }).signInWithGoogle()).ok, true);
  assert.strictEqual(c2.calls.length, 1);
});

test("preflight: a request that hangs is cut off by the timeout and does not block the redirect", async () => {
  const client = recordingClient();
  let aborted = false;
  class FakeAbort { constructor() { this.signal = { __fake: true }; } abort() { aborted = true; } }
  const hang = (url, init) => new Promise((resolve, reject) => { if (aborted) reject(new Error("aborted")); else setImmediate(() => (aborted ? reject(new Error("aborted")) : null)); });
  const auth = loadAuth(PROD_LOC, client, { storage: memStorage(), fetch: hang, config: SB_CFG, abortController: FakeAbort, setTimeout: (fn) => { setImmediate(fn); return 1; } });
  const res = await auth.signInWithGoogle();
  assert.strictEqual(res.ok, true);
  assert.strictEqual(aborted, true, "the timer aborted the request");
  assert.strictEqual(client.calls.length, 1);
});

test("preflight: linking while Google is OFF → no linkIdentity, no marker, message in the app", async () => {
  const client = recordingClient();
  const store = memStorage();
  const auth = loadAuth(PROD_LOC, client, { storage: store, fetch: settingsFetch({ external: { google: false } }), config: SB_CFG });
  const res = await auth.linkGoogle();
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.kind, "provider_disabled");
  assert.strictEqual(client.calls.length, 0);
  assert.strictEqual(store.getItem("rebuilt.oauth"), null);
});

test("linkGoogle: needs a signed-in account, uses linkIdentity ONLY, remembers whose account started it", async () => {
  const none = recordingClient({ session: null });
  const storeNone = memStorage();
  const authNone = loadAuth(PROD_LOC, none, { storage: storeNone });
  const r0 = await authNone.linkGoogle();
  assert.strictEqual(r0.ok, false);
  assert.strictEqual(r0.kind, "no_session");
  assert.strictEqual(none.calls.length, 0, "nothing is sent without a session");
  assert.strictEqual(storeNone.getItem("rebuilt.oauth"), null);

  const client = recordingClient();
  const store = memStorage();
  const auth = loadAuth(PROD_LOC, client, { storage: store });
  const r1 = await auth.linkGoogle();
  assert.strictEqual(r1.ok, true);
  assert.deepStrictEqual(client.calls.map((c) => c.fn), ["linkIdentity"], "never signInWithOAuth while linking");
  assert.strictEqual(client.calls[0].args.provider, "google");
  assert.strictEqual(client.calls[0].args.options.redirectTo, "https://rebuilt-jet.vercel.app/");
  const marker = JSON.parse(store.getItem("rebuilt.oauth"));
  assert.strictEqual(marker.mode, "link");
  assert.strictEqual(marker.uid, "u1");
});

test("linkGoogle: manual linking switched off → clear message, marker cleared", async () => {
  const client = recordingClient({ data: { provider: "google", url: null }, error: E(422, "manual_linking_disabled", "Manual linking is disabled") });
  const store = memStorage();
  const auth = loadAuth(PROD_LOC, client, { storage: store });
  const res = await auth.linkGoogle();
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.kind, "linking_disabled");
  assert.strictEqual(store.getItem("rebuilt.oauth"), null);
});

test("getIdentities: provider + e-mail only", async () => {
  const client = recordingClient({ identities: [
    { identity_id: "i1", provider: "email", identity_data: { email: "a@b.co", sub: "secret-sub" } },
    { identity_id: "i2", provider: "google", identity_data: { email: "g@gmail.com" } },
  ] });
  const auth = loadAuth(PROD_LOC, client);
  const res = await auth.getIdentities();
  assert.strictEqual(res.ok, true);
  assert.strictEqual(JSON.stringify(res.identities), JSON.stringify([{ provider: "email", email: "a@b.co", id: "i1" }, { provider: "google", email: "g@gmail.com", id: "i2" }]));
});

/** Run consumeOAuthResult for a given landing address and marker. */
async function comeBackFrom(boot, marker, clientResult) {
  const store = memStorage();
  if (marker) store.setItem("rebuilt.oauth", JSON.stringify(Object.assign({ t: Date.now() }, marker)));
  const client = recordingClient(clientResult);
  const auth = loadAuth(PROD_LOC, client, { storage: store, boot });
  const first = await auth.consumeOAuthResult();
  const second = await auth.consumeOAuthResult();
  return { first, second, store, client };
}

test("coming back from Google, cancelled: a calm message, marker cleared, read only once", async () => {
  const r = await comeBackFrom({ hash: "#error=access_denied&error_description=The+user+denied+access", search: "" }, { mode: "signin", uid: "" });
  assert.strictEqual(r.first.ok, false);
  assert.strictEqual(r.first.mode, "signin");
  assert.strictEqual(r.first.kind, "oauth_cancelled");
  assert.strictEqual(r.second, null);
  assert.strictEqual(r.store.getItem("rebuilt.oauth"), null);
  assert.strictEqual(r.client.calls.length, 0, "a failed return touches nothing on the server");
});

test("coming back from linking, Google already belongs to someone else: refused, nothing merged", async () => {
  const r = await comeBackFrom({ hash: "#error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked+to+another+user", search: "" }, { mode: "link", uid: "u1" });
  assert.strictEqual(r.first.ok, false);
  assert.strictEqual(r.first.mode, "link");
  assert.strictEqual(r.first.kind, "identity_taken");
  assert.ok(/مرتبط بحساب REBUILT تاني/.test(r.first.error) && /مش هندمج/.test(r.first.error));
  assert.strictEqual(r.client.calls.length, 0);
});

test("coming back from linking, success is only claimed when it is true", async () => {
  const boot = { hash: "#access_token=x&refresh_token=y", search: "" };
  const google = [{ identity_id: "i2", provider: "google", identity_data: { email: "g@gmail.com" } }];
  const ok = await comeBackFrom(boot, { mode: "link", uid: "u1" }, { identities: google });
  assert.strictEqual(ok.first.ok, true);
  assert.strictEqual(ok.first.mode, "link");

  const other = await comeBackFrom(boot, { mode: "link", uid: "someone-else" }, { identities: google });
  assert.strictEqual(other.first.ok, false);
  assert.strictEqual(other.first.kind, "session_changed");

  const missing = await comeBackFrom(boot, { mode: "link", uid: "u1" }, { identities: [] });
  assert.strictEqual(missing.first.ok, false);
  assert.strictEqual(missing.first.kind, "link_unconfirmed");

  const noSession = await comeBackFrom(boot, { mode: "link", uid: "u1" }, { session: null, identities: google });
  assert.strictEqual(noSession.first.ok, false);
  assert.strictEqual(noSession.first.kind, "no_session");
});

test("coming back from a Google sign-in: success needs no extra calls; not coming back from Google → null", async () => {
  const ok = await comeBackFrom({ hash: "#access_token=x", search: "" }, { mode: "signin", uid: "" });
  assert.strictEqual(ok.first.ok, true);
  assert.strictEqual(ok.first.mode, "signin");
  assert.strictEqual(ok.client.calls.length, 0);
  const none = await comeBackFrom({ hash: "", search: "" }, null);
  assert.strictEqual(none.first, null);
  const tokensOnly = await comeBackFrom({ hash: "#access_token=x", search: "" }, null);
  assert.strictEqual(tokensOnly.first, null, "no marker → nothing is claimed");
  const stale = await comeBackFrom({ hash: "#access_token=x", search: "" }, { mode: "link", uid: "u1", t: Date.now() - 16 * 60 * 1000 });
  assert.strictEqual(stale.first, null, "a marker older than 15 minutes is ignored");
});

test("an e-mail-link error is still the recovery screen's business, not a Google failure", async () => {
  const boot = { hash: "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired", search: "" };
  const r = await comeBackFrom(boot, null);
  assert.strictEqual(r.first, null);
  const auth = loadAuth(PROD_LOC, recordingClient(), { storage: memStorage(), boot });
  assert.strictEqual(auth.getRecovery().status, "error");
});

test("getSession brings the name Google sent when the app has none yet", async () => {
  const client = recordingClient({ session: { user: { id: "u9", email: "n@g.co", user_metadata: { full_name: "نور" } } } });
  const auth = loadAuth(PROD_LOC, client);
  const s1 = await auth.getSession({ user: { name: "" } });
  assert.strictEqual(s1.name, "نور");
  const s2 = await auth.getSession({ user: { name: "عمر" } });
  assert.strictEqual(s2.name, "عمر", "a name the person already chose is never replaced");
});

/** Run index.html's inline boot script against a fake address bar. */
function runBootScript(search, hash) {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const m = html.match(/<script>\s*(\(function \(\) \{[\s\S]*?__REBUILT_BOOT_URL[\s\S]*?\}\)\(\);)\s*<\/script>/);
  assert.ok(m, "boot script not found in index.html");
  const replaced = [];
  const loc = { pathname: "/", search: search, hash: hash };
  const sandbox = { URLSearchParams, location: loc, history: { replaceState: (a, b, url) => replaced.push(url) } };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(m[1], sandbox);
  return { boot: sandbox.__REBUILT_BOOT_URL, replaced };
}

test("boot script: error parameters are kept in the snapshot, then taken out of the address (supabase-js would sign the user out)", () => {
  const a = runBootScript("", "#error=access_denied&error_description=The+user+denied+access");
  assert.strictEqual(a.boot.hash, "#error=access_denied&error_description=The+user+denied+access");
  assert.deepStrictEqual(a.replaced, ["/"]);
  const b = runBootScript("?error=access_denied&error_description=x&keep=1", "");
  assert.strictEqual(b.boot.search, "?error=access_denied&error_description=x&keep=1");
  assert.deepStrictEqual(b.replaced, ["/?keep=1"]);
  const c = runBootScript("", "#error=server_error&error_code=identity_already_exists&error_description=x");
  assert.deepStrictEqual(c.replaced, ["/"]);
});

test("boot script: tokens and ordinary addresses are left alone", () => {
  const ok = runBootScript("", "#access_token=abc&refresh_token=def&type=bearer");
  assert.deepStrictEqual(ok.replaced, [], "supabase-js must still see the tokens");
  assert.strictEqual(ok.boot.hash, "#access_token=abc&refresh_token=def&type=bearer");
  assert.deepStrictEqual(runBootScript("", "#settings").replaced, []);
  assert.deepStrictEqual(runBootScript("", "").replaced, []);
});

test("the settings page offers linking only through Auth.linkGoogle (never signInWithOAuth)", () => {
  const settings = fs.readFileSync(path.join(ROOT, "js/pages/settings.js"), "utf8");
  assert.ok(/Auth\.linkGoogle\(\)/.test(settings));
  assert.ok(!/signInWithOAuth|signInWithGoogle/.test(settings), "linking must never start a plain Google sign-in");
  const gate = fs.readFileSync(path.join(ROOT, "js/gate.js"), "utf8");
  assert.ok(/Auth\.signInWithGoogle\(\)/.test(gate) && !/linkGoogle|linkIdentity/.test(gate), "the sign-in screen only signs in");
});

test("the app never creates profile rows itself (the sign-up trigger does, once per auth user)", () => {
  const data = fs.readFileSync(path.join(ROOT, "js/supabaseData.js"), "utf8");
  assert.ok(!/from\("(profiles|user_profiles|ai_profiles)"\)\s*\.\s*(insert|upsert)/.test(data.replace(/\s+/g, " ")), "no client-side insert/upsert on the profile tables");
});

runAll();
