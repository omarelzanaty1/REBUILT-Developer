/* ============================================================
   REBUILT — tests/strict.test.js   (Development repository)
   Dependency-free checks (plain Node, no browser, no network):  node tests/strict.test.js

   Phase 3 of the Development database hook-up. They pin the rule «a failing backend is never hidden»:

     1. STRICT MODE exists on the development / local / unknown channels once a backend is configured, and
        never on the stable channel (Stable's behaviour is pinned here and must not change).
     2. A failed WRITE is reported (never swallowed), a duplicate completion is still a success, and a
        dependent write is not sent after its create failed.
     3. A failed or partial LOAD is an error, never an empty list; the local copy is never the data source.
     4. A configured backend that cannot be reached never turns into the device-only local sign-in.
     5. Big tables are read completely (Supabase cuts one answer at a fixed number of rows).
     6. supabase-js is pinned to one exact version with an integrity hash (a KNOWN GAP while the version
        and its hash cannot be fetched: see scripts/pin-supabase-js.sh).

   Everything runs against stand-ins: what is proved is what the app DOES with an error, not what the real
   service answers. See docs/ENVIRONMENTS.md.
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

let passed = 0;
const failures = [];
const todos = [];
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }
/** A KNOWN GAP: it is run and reported, but does not fail the suite. It prints PASS the day it starts to hold. */
function todo(name, fn) { queue.push({ name, fn, todo: true }); }
async function runAll() {
  for (const t of queue) {
    try { await t.fn(); passed += 1; console.log("PASS " + t.name + (t.todo ? "   (known gap closed: turn this todo() into test())" : "")); }
    catch (err) {
      const why = String(err && err.message).split("\n").join("\n     ");
      if (t.todo) { todos.push(t.name); console.log("TODO " + t.name + "\n     " + why); }
      else { failures.push(t.name); console.log("FAIL " + t.name + "\n     " + why); }
    }
  }
  console.log("\n" + passed + " passed, " + failures.length + " failed, " + todos.length + " known gap(s) (of " + queue.length + ")");
  process.exit(failures.length ? 1 : 0);
}

/* ---------------- stand-ins ---------------- */

const DEV_URL = "https://abcdefghijklmnopqrst.supabase.co";   // a made-up address: nothing real is ever reached
const DEV_KEY = "sb_publishable_UNITTESTUNITTESTUNITTEST";

/** A Postgrest-like client over in-memory tables. errors: { "select:tasks": {code,message}, "*:habits": … }. */
function makeClient(cfg) {
  cfg = cfg || {};
  const calls = [];
  const tables = cfg.tables || {};
  function run(q) {
    calls.push(q.op + ":" + q.table);
    const err = cfg.errors && (cfg.errors[q.op + ":" + q.table] || cfg.errors["*:" + q.table]);
    if (err) return { data: null, error: err, count: null };
    const rows = (tables[q.table] || []).filter((r) => q.filters.every(([c, v]) => r[c] === v));
    if (q.op !== "select") return { data: null, error: null, count: null };
    const max = cfg.maxRows || Infinity;
    let out = rows;
    if (q.range) out = rows.slice(q.range[0], Math.min(q.range[1] + 1, q.range[0] + max));
    else out = rows.slice(0, max);
    return { data: q.single ? out[0] || null : out, error: null, count: q.count ? rows.length : null };
  }
  function builder(table) {
    const q = { table, op: "select", filters: [], range: null, count: null, single: false, payload: null };
    const b = {
      select(cols, o) { q.count = o && o.count; return b; },
      insert(p) { q.op = "insert"; q.payload = p; return b; },
      update(p) { q.op = "update"; q.payload = p; return b; },
      delete() { q.op = "delete"; return b; },
      upsert(p) { q.op = "upsert"; q.payload = p; return b; },
      eq(c, v) { q.filters.push([c, v]); return b; },
      order() { return b; },
      range(a, z) { q.range = [a, z]; return b; },
      maybeSingle() { q.single = true; return b; },
      then(res, rej) { return Promise.resolve(run(q)).then(res, rej); },
    };
    return b;
  }
  const signedOut = { data: { user: null }, error: { name: "AuthSessionMissingError", message: "Auth session missing!" } };
  return {
    calls,
    from: builder,
    auth: {
      getUser: async () => (cfg.userError ? { data: { user: null }, error: cfg.userError } : cfg.signedOut ? signedOut : { data: { user: { id: "u1", email: "a@b.co" } }, error: null }),
      getSession: async () => (cfg.sessionError ? { data: { session: null }, error: cfg.sessionError } : cfg.signedOut ? { data: { session: null }, error: null } : { data: { session: { user: { id: "u1", email: "a@b.co", user_metadata: {} } } }, error: null }),
      signOut: async () => ({ error: null }),
    },
  };
}

function memStore(initial) {
  const m = new Map(Object.entries(initial || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

/** One page of the real app's data layer: the real supabaseClient / auth / supabaseData / storage files in a bare context. */
function boot(o) {
  o = o || {};
  const loc = o.location || { hostname: "omarelzanaty1.github.io", pathname: "/REBUILT-Developer/", origin: "https://omarelzanaty1.github.io", search: "", hash: "" };
  const sandbox = { console: { warn() {}, log() {}, error() {} }, URL, URLSearchParams, setTimeout, clearTimeout, Promise };
  sandbox.window = sandbox;
  sandbox.location = sandbox.window.location = loc;
  sandbox.history = { replaceState() {} };
  sandbox.sessionStorage = memStore();
  sandbox.localStorage = memStore(o.cache);
  if (o.client !== null) sandbox.supabase = { createClient: () => o.client || makeClient() };
  vm.createContext(sandbox);
  const run = (file, patch) => vm.runInContext(patch ? patch(read(file)) : read(file), sandbox, { filename: file });
  // What the development profile holds in the repository changes over time (empty now, filled when the site is wired to REBUILT-Dev):
  // a test therefore sets it explicitly — filled with made-up values (configured) or blank — by patching the SOURCE it loads.
  const withProfile = (src) => {
    const url = o.configured ? DEV_URL : "";
    const key = o.configured ? DEV_KEY : "";
    const patched = src.replace(/(development:\s*\{\s*url:\s*)"[^"]*"/, "$1" + JSON.stringify(url)).replace(/(anonKey:\s*)"[^"]*",(\s*\/\/[^\n]*\n\s*\},\s*\};)/, "$1" + JSON.stringify(key) + ",$2");
    const m = patched.match(/development:\s*\{\s*url:\s*"([^"]*)"[\s\S]*?anonKey:\s*"([^"]*)"/);
    assert.ok(m && m[1] === url && m[2] === key, "test set-up: could not set the development profile (did supabaseClient.js change shape?)");
    return patched;
  };
  vm.runInContext(
    "window.REBUILT = window.REBUILT || {};" +
      "REBUILT.Data = { STORAGE_KEY: 'rebuilt_state_v1', ACHIEVEMENTS: [], todayISO: () => '2026-11-02', generateId: () => 'id', " +
      "  buildEmptyState: () => ({ meta: {}, user: {}, settings: {}, userProfile: {}, aiProfile: {}, goals: [], habits: [], tasks: [], scheduleItems: [], history: {}, achievements: [], xp: { total: 0 }, aiConversation: [] }) };" +
      "REBUILT.Goals = { decodeAll: (a) => a.map((x) => x), titlesFor: () => [], encodeAll: (g) => g };" +
      "REBUILT.Streak = { computeHabitStreak() {}, recomputeStreak() {} };",
    sandbox
  );
  run("js/supabaseClient.js", withProfile);
  run("js/auth.js");
  run("js/supabaseData.js");
  run("js/storage.js");
  return { R: sandbox.REBUILT, win: sandbox, client: o.client, local: sandbox.localStorage };
}

const STABLE = { hostname: "getrebuilt.online", pathname: "/", origin: "https://getrebuilt.online", search: "", hash: "" };
const DEVLOC = undefined;   // the default location above
/** Arrays made inside the vm sandbox belong to another realm: compare plain copies, not the live objects. */
const plain = (x) => JSON.parse(JSON.stringify(x === undefined ? null : x));
const rejects = async (p, check) => {
  let err = null;
  try { await p; } catch (e) { err = e; }
  assert.ok(err, "expected a rejection, but the call resolved");
  if (check) check(err);
  return err;
};

const POISON = JSON.stringify({ meta: { hasLocalAccount: true }, habits: [{ id: "stale", title: "STALE-LOCAL-COPY" }] });
const seedTables = () => ({
  profiles: [{ id: "u1", name: "Omar", email: "a@b.co", is_onboarded: true, created_at: "2026-10-01T00:00:00Z", settings: {} }],
  user_profiles: [{ user_id: "u1" }],
  ai_profiles: [{ user_id: "u1" }],
  habits: [{ id: "h1", user_id: "u1", title: "Server habit", xp: 20, frequency: "daily", target_days: [], icon: "x" }],
  habit_completions: [], tasks: [{ id: "t1", user_id: "u1", title: "Server task", xp: 10, priority: "high", completed: false }],
  schedule_items: [], daily_history: [], unlocked_achievements: [], user_xp_totals: [{ user_id: "u1", total_xp: 0 }], ai_conversations: [],
});

/* ============================================================
   1. Strict mode: which channels, when
   ============================================================ */

test("strict mode: a configured development backend must be used (mustUseBackend)", () => {
  const { R } = boot({ configured: true });
  assert.strictEqual(typeof R.SupabaseClient.mustUseBackend, "function", "SupabaseClient.mustUseBackend() is missing");
  assert.strictEqual(R.SupabaseClient.mustUseBackend(), true);
});

test("strict mode: the same on localhost and on an unknown address (they use the development profile too)", () => {
  ["localhost", "example.org"].forEach((h) => {
    const { R } = boot({ configured: true, location: { hostname: h, pathname: "/", origin: "https://" + h, search: "", hash: "" } });
    assert.strictEqual(R.SupabaseClient.mustUseBackend && R.SupabaseClient.mustUseBackend(), true, h);
  });
});

test("strict mode is never on for the STABLE channel", () => {
  const { R } = boot({ configured: true, location: STABLE });
  assert.strictEqual(typeof R.SupabaseClient.mustUseBackend, "function", "SupabaseClient.mustUseBackend() is missing");
  assert.strictEqual(R.SupabaseClient.mustUseBackend(), false);
});

test("strict mode is off while the development profile is empty (deliberate local mode, as shipped)", () => {
  const { R } = boot({ configured: false });
  assert.strictEqual(typeof R.SupabaseClient.mustUseBackend, "function", "SupabaseClient.mustUseBackend() is missing");
  assert.strictEqual(R.SupabaseClient.mustUseBackend(), false);
});

test("diagnose() says whether strict mode is on", () => {
  const { R } = boot({ configured: true });
  assert.strictEqual(R.SupabaseClient.diagnose().strict, true);
  assert.strictEqual(boot({ configured: true, location: STABLE }).R.SupabaseClient.diagnose().strict, false);
});

test("if the development profile is filled in, it is a development project: not production, a publishable key, no secret", () => {
  const src = read("js/supabaseClient.js");
  const dev = src.match(/development:\s*\{\s*url:\s*"([^"]*)"[\s\S]*?anonKey:\s*"([^"]*)"/);
  assert.ok(dev, "development profile not found");
  const [, url, key] = dev;
  if (!url && !key) return; // empty = local mode; allowed
  assert.ok(/^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url), "development url must be https://<20-char ref>.supabase.co");
  assert.notStrictEqual(url, "https://jvyhtpfedkypwdzyadba.supabase.co", "the development profile must never be the production project");
  assert.ok(/^sb_publishable_/.test(key), "only a publishable key may be shipped");
});

/* ============================================================
   2. Writes
   ============================================================ */

test("strict: a rejected write (RLS) rejects instead of resolving silently", async () => {
  const client = makeClient({ errors: { "insert:habits": { code: "42501", message: "new row violates row-level security policy" } } });
  const { R } = boot({ configured: true, client });
  const err = await rejects(R.SupabaseData.insertHabit(client, "u1", { id: "h9", title: "x", xp: 20, frequency: "daily", icon: "x" }));
  assert.strictEqual(err.name, "BackendError");
  assert.strictEqual(err.kind, "permission");
  assert.strictEqual(err.table, "habits");
});

test("strict: every write helper reports an error from the server", async () => {
  const client = makeClient({ errors: { "*:habits": { code: "500", message: "boom" }, "*:tasks": { code: "500", message: "boom" }, "*:schedule_items": { code: "500", message: "boom" }, "*:habit_completions": { code: "500", message: "boom" }, "*:daily_history": { code: "500", message: "boom" }, "*:unlocked_achievements": { code: "500", message: "boom" }, "*:profiles": { code: "500", message: "boom" }, "*:user_profiles": { code: "500", message: "boom" }, "*:ai_profiles": { code: "500", message: "boom" } } });
  const { R } = boot({ configured: true, client });
  const D = R.SupabaseData, h = { id: "h", title: "t", xp: 5, frequency: "daily", icon: "x" };
  const calls = {
    insertHabit: () => D.insertHabit(client, "u1", h), updateHabit: () => D.updateHabit(client, "h", { title: "n" }), deleteHabit: () => D.deleteHabit(client, "h"),
    insertHabitCompletion: () => D.insertHabitCompletion(client, "u1", "h", "2026-11-02", 5), deleteHabitCompletion: () => D.deleteHabitCompletion(client, "h", "2026-11-02"),
    insertTask: () => D.insertTask(client, "u1", { id: "t", title: "t", priority: "low", xp: 5 }), updateTask: () => D.updateTask(client, "t", { title: "n" }), deleteTask: () => D.deleteTask(client, "t"),
    setTaskCompletion: () => D.setTaskCompletion(client, "t", true, "2026-11-02", 5),
    insertScheduleItem: () => D.insertScheduleItem(client, "u1", { id: "s", title: "t", date: "2026-11-02", startTime: "09:00" }), updateScheduleItem: () => D.updateScheduleItem(client, "s", { title: "n" }),
    deleteScheduleItem: () => D.deleteScheduleItem(client, "s"), setScheduleItemCompletion: () => D.setScheduleItemCompletion(client, "s", true),
    upsertDailyHistory: () => D.upsertDailyHistory(client, "u1", "2026-11-02", {}), insertUnlockedAchievement: () => D.insertUnlockedAchievement(client, "u1", "a", "2026-11-02", 5),
    updateProfile: () => D.updateProfile(client, "u1", { name: "n" }), updateUserProfile: () => D.updateUserProfile(client, "u1", { goals: [] }), updateAiProfile: () => D.updateAiProfile(client, "u1", { knownChallenges: [] }),
  };
  for (const [name, call] of Object.entries(calls)) {
    const err = await rejects(Promise.resolve().then(call), null).catch((e) => { throw new Error(name + ": " + e.message); });
    assert.strictEqual(err.name, "BackendError", name);
  }
});

test("the stable channel keeps its old behaviour: a write error is handed back, not thrown", async () => {
  const client = makeClient({ errors: { "insert:habits": { code: "42501", message: "rls" } } });
  const { R } = boot({ configured: true, client, location: STABLE });
  const res = await R.SupabaseData.insertHabit(client, "u1", { id: "h9", title: "x", xp: 20, frequency: "daily", icon: "x" });
  assert.ok(res && res.error && res.error.code === "42501", "Stable must still receive {error} unchanged");
});

test("strict: a duplicate completion (same habit, same day) counts as saved, not as a failure", async () => {
  const client = makeClient({ errors: { "insert:habit_completions": { code: "23505", message: "duplicate key value violates unique constraint" } } });
  const { R } = boot({ configured: true, client });
  await R.SupabaseData.insertHabitCompletion(client, "u1", "h1", "2026-11-02", 20);
});

test("strict: a foreign-key failure on a completion IS a failure", async () => {
  const client = makeClient({ errors: { "insert:habit_completions": { code: "23503", message: "foreign key violation" } } });
  const { R } = boot({ configured: true, client });
  await rejects(R.SupabaseData.insertHabitCompletion(client, "u1", "nope", "2026-11-02", 20));
});

test("errors are classified: network, session, permission, missing table, server", () => {
  const { R } = boot({ configured: true });
  const k = (e) => R.SupabaseClient.classify(e).kind;
  assert.strictEqual(k({ message: "TypeError: Failed to fetch", code: "" }), "network");
  assert.strictEqual(k({ message: "NetworkError when attempting to fetch resource." }), "network");
  assert.strictEqual(k({ code: "PGRST301", message: "JWT expired" }), "session");
  assert.strictEqual(k({ status: 401, message: "Invalid JWT" }), "session");
  assert.strictEqual(k({ code: "42501", message: "permission denied for table habits" }), "permission");
  assert.strictEqual(k({ code: "42P01", message: 'relation "public.habits" does not exist' }), "missing_table");
  assert.strictEqual(k({ code: "PGRST205", message: "Could not find the table 'public.habits' in the schema cache" }), "missing_table");
  assert.strictEqual(k({ status: 503, message: "Service Unavailable" }), "server");
  assert.strictEqual(k({ code: "XX000", message: "something else" }), "unknown");
});

test("Storage: a failed write is reported to the handler (strict) with its kind and table", async () => {
  const client = makeClient({ tables: seedTables(), errors: { "insert:habits": { code: "42501", message: "rls" } } });
  const { R } = boot({ configured: true, client });
  const seen = [];
  R.Storage.setSyncErrorHandler((e) => seen.push(e));
  await R.Storage.syncAddHabit("u1", { id: "h9", title: "x", xp: 20, frequency: "daily", icon: "x" });
  assert.strictEqual(seen.length, 1, "the failure must reach the handler exactly once");
  assert.strictEqual(seen[0].kind, "permission");
  assert.strictEqual(seen[0].table, "habits");
});

test("Storage: a thrown (not returned) error is reported too", async () => {
  const client = makeClient({ tables: seedTables() });
  client.from = () => { throw new TypeError("Failed to fetch"); };
  const { R } = boot({ configured: true, client });
  const seen = [];
  R.Storage.setSyncErrorHandler((e) => seen.push(e));
  await R.Storage.syncAddTask("u1", { id: "t9", title: "x", priority: "low", xp: 5 });
  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0].kind, "network");
});

test("Storage: a duplicate completion is not reported", async () => {
  const client = makeClient({ tables: seedTables(), errors: { "insert:habit_completions": { code: "23505", message: "dup" } } });
  const { R } = boot({ configured: true, client });
  const seen = [];
  R.Storage.setSyncErrorHandler((e) => seen.push(e));
  await R.Storage.syncHabitCompletion("u1", "h1", "2026-11-02", 20, true);
  assert.deepStrictEqual(seen.map((e) => e.kind), []);
});

test("Storage: after a create failed, the writes that depend on it are not sent", async () => {
  const client = makeClient({ tables: seedTables(), errors: { "insert:habits": { code: "42501", message: "rls" } } });
  const { R } = boot({ configured: true, client });
  const seen = [];
  R.Storage.setSyncErrorHandler((e) => seen.push(e));
  const create = R.Storage.syncAddHabit("u1", { id: "h9", title: "x", xp: 20, frequency: "daily", icon: "x" });
  const edit = R.Storage.syncUpdateHabit("h9", { title: "renamed" });
  const done = R.Storage.syncHabitCompletion("u1", "h9", "2026-11-02", 20, true);
  await Promise.all([create, edit, done]);
  assert.ok(!client.calls.includes("update:habits"), "an edit must not be sent for a habit that was never created: " + client.calls.join(","));
  assert.ok(!client.calls.includes("insert:habit_completions"), "a completion must not be sent for a habit that was never created");
  assert.ok(seen.length >= 1 && seen[0].kind === "permission", "the first failure is the real cause");
});

test("Storage: a goals write failure does not stop the next one (the queue keeps going)", async () => {
  const client = makeClient({ tables: seedTables(), errors: { "update:user_profiles": { code: "500", message: "boom" } } });
  const { R } = boot({ configured: true, client });
  const seen = [];
  R.Storage.setSyncErrorHandler((e) => seen.push(e));
  await R.Storage.syncGoals("u1", []);
  await R.Storage.syncGoals("u1", []);
  assert.strictEqual(client.calls.filter((c) => c === "update:user_profiles").length, 2, "the second write must still be attempted");
  assert.strictEqual(seen.length, 2);
});

test("Storage on the stable channel: a failing write is still only logged (no handler call)", async () => {
  const client = makeClient({ tables: seedTables(), errors: { "insert:habits": { code: "42501", message: "rls" } } });
  const { R } = boot({ configured: true, client, location: STABLE });
  const seen = [];
  R.Storage.setSyncErrorHandler && R.Storage.setSyncErrorHandler((e) => seen.push(e));
  await R.Storage.syncAddHabit("u1", { id: "h9", title: "x", xp: 20, frequency: "daily", icon: "x" });
  assert.deepStrictEqual(seen, []);
});

/* ============================================================
   3. Loads
   ============================================================ */

test("strict: a failing query is an error — never an empty list", async () => {
  const client = makeClient({ tables: seedTables(), errors: { "select:tasks": { code: "42501", message: "denied" } } });
  const { R } = boot({ configured: true, client });
  const err = await rejects(R.SupabaseData.loadFullState(client, "u1"));
  assert.strictEqual(err.name, "BackendError");
  assert.deepStrictEqual(plain(err.tables), ["tasks"]);
});

test("strict: every failing table is named, not just the first", async () => {
  const client = makeClient({ tables: seedTables(), errors: { "select:tasks": { code: "500", message: "x" }, "select:habit_completions": { code: "500", message: "x" }, "select:ai_conversations": { code: "500", message: "x" } } });
  const { R } = boot({ configured: true, client });
  const err = await rejects(R.SupabaseData.loadFullState(client, "u1"));
  assert.deepStrictEqual(plain(err.tables || []).sort(), ["ai_conversations", "habit_completions", "tasks"]);
});

test("strict: the XP view and the profile row are checked like every other source", async () => {
  const c1 = makeClient({ tables: seedTables(), errors: { "select:user_xp_totals": { code: "500", message: "x" } } });
  await rejects(boot({ configured: true, client: c1 }).R.SupabaseData.loadFullState(c1, "u1"));
  const t = seedTables(); t.profiles = [];
  const c2 = makeClient({ tables: t });
  const err = await rejects(boot({ configured: true, client: c2 }).R.SupabaseData.loadFullState(c2, "u1"));
  assert.strictEqual(err.kind, "profile_missing");
});

test("stable keeps its old load: a failing query still yields an empty list (pinned, not endorsed)", async () => {
  const client = makeClient({ tables: seedTables(), errors: { "select:tasks": { code: "42501", message: "denied" } } });
  const { R } = boot({ configured: true, client, location: STABLE });
  const state = await R.SupabaseData.loadFullState(client, "u1");
  assert.ok(state && Array.isArray(state.tasks) && state.tasks.length === 0);
});

test("strict: a good load returns the server's data", async () => {
  const client = makeClient({ tables: seedTables() });
  const { R } = boot({ configured: true, client });
  const state = await R.SupabaseData.loadFullState(client, "u1");
  assert.deepStrictEqual(plain(state.habits.map((h) => h.title)), ["Server habit"]);
  assert.deepStrictEqual(plain(state.tasks.map((t) => t.title)), ["Server task"]);
});

test("Storage.load (strict): a server failure rejects and the local copy is NOT used", async () => {
  const client = makeClient({ tables: seedTables(), errors: { "select:profiles": { code: "500", message: "down" } } });
  const { R } = boot({ configured: true, client, cache: { rebuilt_state_v1: POISON } });
  const err = await rejects(R.Storage.load());
  assert.strictEqual(err.name, "BackendError");
});

test("Storage.load (strict): the local copy is never read, even when the server answers", async () => {
  const client = makeClient({ tables: seedTables() });
  const { R, local } = boot({ configured: true, client, cache: { rebuilt_state_v1: POISON } });
  let reads = 0; const get = local.getItem;
  local.getItem = (k) => { if (k === "rebuilt_state_v1") reads += 1; return get(k); };
  const state = await R.Storage.load();
  assert.deepStrictEqual(plain(state.habits.map((h) => h.title)), ["Server habit"]);
  assert.strictEqual(reads, 0, "rebuilt_state_v1 must not be read in strict mode");
});

test("Storage.load (strict): signed out → no data (null), and the local copy is not used either", async () => {
  const client = makeClient({ signedOut: true });
  const { R } = boot({ configured: true, client, cache: { rebuilt_state_v1: POISON } });
  assert.strictEqual(await R.Storage.load(), null);
});

test("Storage.load (strict): the account check failing because of the network is an error, not 'signed out'", async () => {
  const client = makeClient({ userError: { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 } });
  const { R } = boot({ configured: true, client, cache: { rebuilt_state_v1: POISON } });
  const err = await rejects(R.Storage.load());
  assert.strictEqual(err.kind, "network");
});

test("Storage.load (strict): an expired / revoked sign-in (401, invalid JWT) means signed out (null), not a database error", async () => {
  for (const userError of [{ name: "AuthApiError", status: 401, message: "invalid JWT: unable to parse or verify signature, token is expired" }, { name: "AuthApiError", status: 403, code: "user_not_found", message: "User from sub claim in JWT does not exist" }]) {
    const client = makeClient({ userError });
    const { R } = boot({ configured: true, client, cache: { rebuilt_state_v1: POISON } });
    assert.strictEqual(await R.Storage.load(), null, userError.message);
  }
});

test("Storage.load on stable: still falls back to the local copy (pinned)", async () => {
  const client = makeClient({ tables: seedTables(), errors: { "select:profiles": { code: "500", message: "down" } } });
  const { R } = boot({ configured: true, client, location: STABLE, cache: { rebuilt_state_v1: POISON } });
  const state = await R.Storage.load();
  assert.ok(state && state.habits && state.habits[0].title === "STALE-LOCAL-COPY");
});

test("Storage.save (strict) writes nothing to the browser; on stable it still mirrors", () => {
  const strict = boot({ configured: true, client: makeClient() });
  strict.R.Storage.save({ habits: [{ title: "x" }] });
  assert.strictEqual(strict.local.getItem("rebuilt_state_v1"), null, "no browser copy of the account's data in strict mode");
  const stable = boot({ configured: true, client: makeClient(), location: STABLE });
  stable.R.Storage.save({ habits: [{ title: "x" }] });
  assert.ok(stable.local.getItem("rebuilt_state_v1"), "stable keeps its mirror");
});

test("Storage.clear still removes a browser copy left by an older version (strict)", () => {
  const { R, local } = boot({ configured: true, client: makeClient(), cache: { rebuilt_state_v1: POISON } });
  R.Storage.clear();
  assert.strictEqual(local.getItem("rebuilt_state_v1"), null);
});

/* ============================================================
   4. Auth provider: no silent local sign-in when a backend is configured
   ============================================================ */

test("strict + the library did not load → the provider is 'unavailable', not the local one", () => {
  const { R } = boot({ configured: true, client: null });
  assert.strictEqual(R.Auth.mode(), "unavailable");
  assert.strictEqual(R.Auth.isRealAuth(), false);
});

test("strict + unavailable: signing in is refused with a clear reason and nothing is marked signed in", async () => {
  const { R } = boot({ configured: true, client: null });
  const state = { user: { email: "a@b.co", name: "A" }, meta: { hasLocalAccount: false } };
  const res = await R.Auth.signIn(state, { email: "a@b.co", password: "secret123" });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.kind, "backend_unavailable");
  assert.strictEqual(state.meta.hasLocalAccount, false, "no local account may be created");
  const up = await R.Auth.signUp(state, { name: "A", email: "a@b.co", password: "secret123" });
  assert.strictEqual(up.ok, false);
  assert.strictEqual(state.meta.hasLocalAccount, false);
});

test("an EMPTY development profile is still the deliberate local mode", () => {
  const { R } = boot({ configured: false, client: null });
  assert.strictEqual(R.Auth.mode(), "local");
});

test("stable with the library missing keeps its old local fallback (pinned)", () => {
  const { R } = boot({ configured: true, client: null, location: STABLE });
  assert.strictEqual(R.Auth.mode(), "local");
});

test("strict: the session check failing because of the network is an error, not 'signed out'", async () => {
  const client = makeClient({ sessionError: { name: "AuthRetryableFetchError", message: "Failed to fetch", status: 0 } });
  const { R } = boot({ configured: true, client });
  await rejects(R.Auth.getSession({ user: {}, meta: {} }));
});

test("strict: an expired sign-in found by the session check means signed out, not an error", async () => {
  const client = makeClient({ sessionError: { name: "AuthApiError", status: 401, message: "invalid JWT" } });
  const { R } = boot({ configured: true, client });
  const res = await R.Auth.getSession({ user: {}, meta: {} });
  assert.strictEqual(res.loggedIn, false);
});

/* ============================================================
   5. Big tables are read completely
   ============================================================ */

function bigTables(n) {
  const t = seedTables();
  for (let i = 0; i < n; i++) t.habit_completions.push({ habit_id: "h1", user_id: "u1", completed_on: "2024-01-01#" + i });
  return t;
}

test("a table bigger than one answer is read completely (2500 rows, 1000 per answer) — strict", async () => {
  const client = makeClient({ tables: bigTables(2500), maxRows: 1000 });
  const { R } = boot({ configured: true, client });
  const state = await R.SupabaseData.loadFullState(client, "u1");
  assert.strictEqual(state.habits[0].completionHistory.length, 2500);
});

test("... and on stable too (a correctness fix, not a strict-mode behaviour)", async () => {
  const client = makeClient({ tables: bigTables(2500), maxRows: 1000 });
  const { R } = boot({ configured: true, client, location: STABLE });
  const state = await R.SupabaseData.loadFullState(client, "u1");
  assert.strictEqual(state.habits[0].completionHistory.length, 2500);
});

test("a server that cuts answers at 500 rows is handled too (the loop trusts the total, not a guessed size)", async () => {
  const client = makeClient({ tables: bigTables(1700), maxRows: 500 });
  const { R } = boot({ configured: true, client });
  const state = await R.SupabaseData.loadFullState(client, "u1");
  assert.strictEqual(state.habits[0].completionHistory.length, 1700);
});

/* ============================================================
   6. The library is pinned
   ============================================================ */

todo("index.html loads ONE exact supabase-js version with an integrity hash (no floating @2)", () => {
  const html = read("index.html");
  const tags = html.match(/<script[^>]*supabase-js[^>]*>/g) || [];
  assert.strictEqual(tags.length, 1, "exactly one supabase-js script tag");
  const tag = tags[0];
  assert.ok(/@supabase\/supabase-js@\d+\.\d+\.\d+\//.test(tag), "pin an exact version (x.y.z) and a file path, got: " + tag);
  assert.ok(/integrity="sha(256|384|512)-[A-Za-z0-9+/=]+"/.test(tag), "an integrity (SRI) hash is required");
  assert.ok(/crossorigin="anonymous"/.test(tag), "crossorigin=anonymous is required for the integrity check");
});

runAll();
