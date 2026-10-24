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
   They do NOT talk to Supabase. Whether the dashboard's Site URL / Redirect URLs are set is
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
function loadAuth(location, client) {
  const sandbox = { console: { warn() {}, log() {}, error() {} }, URLSearchParams };
  sandbox.window = sandbox;
  sandbox.window.location = location || { origin: "https://omarelzanaty1.github.io", pathname: "/rebuilt0.4/", search: "", hash: "" };
  sandbox.history = { replaceState() {} };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/auth.js"), "utf8"), sandbox, { filename: "js/auth.js" });
  if (client) sandbox.REBUILT.SupabaseClient = { isAvailable: () => true, get: () => client };
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
  assert.ok(/otp-reset/.test(m[1]), "marker should name the code-based recovery build, got: " + m[1]);
  assert.ok(/<meta name="generator" content="REBUILT [^"]*otp-reset[^"]*"/.test(html), "generator meta should match");
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


runAll();
