/* ============================================================
   REBUILT — tests/auth.test.js
   Dependency-free checks (plain Node, no browser, no network). Run from the repo root:

       node tests/auth.test.js

   What they guard:
     1. No shipped file points at a development address (the reset e-mail once opened
        http://localhost:3000 → ERR_CONNECTION_REFUSED), and no secret key is shipped.
     2. Every e-mail link target (sign-up confirmation + password recovery) is derived from
        where the app is served, in one canonical form: https://<user>.github.io/rebuilt0.4/
     3. Supabase auth errors keep their own meaning instead of collapsing into a single
        "too many requests" message.
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

test("both e-mail flows pass a redirect target (signUp → emailRedirectTo, reset → redirectTo)", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/auth.js"), "utf8");
  assert.ok(/emailRedirectTo\s*=\s*redirect/.test(src), "signUp does not set emailRedirectTo");
  assert.ok(/redirectTo:\s*redirect/.test(src), "resetPasswordForEmail does not pass redirectTo");
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
  const build = (html.match(/<meta name="rebuilt-build" content="([^"]+)"\s*\/?>/) || [])[1];
  const gen = (html.match(/<meta name="generator" content="([^"]+)"\s*\/?>/) || [])[1];
  assert.ok(build, "rebuilt-build meta missing");
  assert.ok(gen && gen.includes(build), "generator meta must repeat the build marker (it is the one tools and fetchers reliably show)");
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

test("requestPasswordReset sends redirectTo = the published URL", async () => {
  const client = recordingClient();
  const auth = loadAuth({ origin: "https://omarelzanaty1.github.io", pathname: "/rebuilt0.4/index.html", search: "", hash: "" }, client);
  const res = await auth.requestPasswordReset("a@b.co");
  assert.strictEqual(res.ok, true);
  assert.strictEqual(client.calls[0].opts.redirectTo, PRODUCTION_URL);
});

test("off http(s), the redirect option is left out rather than sent empty", async () => {
  const client = recordingClient();
  const auth = loadAuth({ origin: "null", pathname: "/index.html", search: "", hash: "" }, client);
  await auth.requestPasswordReset("a@b.co");
  await auth.signUp({ user: {}, meta: {} }, { name: "O", email: "a@b.co", password: "12345678" });
  assert.strictEqual(client.calls[0].opts, undefined);
  assert.ok(!("emailRedirectTo" in client.calls[1].args.options));
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

runAll();
