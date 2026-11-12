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
  const orders = [];    // every ordered select: { table, cols: [...] } — what the app ASKED the server to sort by
  const inserts = [];   // every insert payload, as sent
  const updates = [];   // every update payload, as sent
  const upserts = [];   // every upsert payload, as sent
  const tables = cfg.tables || {};
  // cfg.persist: inserts / deletes really change the tables, like a server (off by default: most tests only read).
  // A column the server fills in (created_at → now()) is filled in here too, from a fake server clock that ticks one second per use;
  // a timestamp comes back the way Postgres prints it (UTC, «+00:00», no trailing zeros), whatever shape it was sent in.
  let serverTick = 0;
  const serverNow = () => new Date(Date.UTC(2026, 10, 3, 12, 0, 0) + 1000 * serverTick++).toISOString();
  const WITH_CREATED_AT = ["habits", "habit_completions", "tasks", "schedule_items", "ai_conversations"];
  function pgTimestamp(s) {
    const iso = new Date(moment(String(s))).toISOString();                 // 2026-11-03T21:38:12.345Z
    const frac = iso.slice(19, 23).replace(/\.?0+$/, "");                 // ".345" → ".345", ".300" → ".3", ".000" → ""
    return iso.slice(0, 19) + frac + "+00:00";
  }
  // order(col) is REAL here (it used to do nothing, which is why an ordering bug went unseen): ascending, NULLs last — like Postgres.
  // A timestamp is compared as a moment in time (a value without a zone is UTC, as on Supabase); a uuid / text / date by its characters
  // (a uuid's byte order is its lowercase hex order).
  const ISO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/;
  const moment = (s) => Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : s + "Z");
  function compare(a, b) {
    const na = a === undefined || a === null, nb = b === undefined || b === null;
    if (na || nb) return na && nb ? 0 : na ? 1 : -1;
    if (typeof a === "string" && typeof b === "string" && ISO.test(a) && ISO.test(b)) return moment(a) - moment(b);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function sortRows(rows, cols) {
    return rows.map((r, i) => [r, i]).sort((x, y) => {
      for (const c of cols) { const d = compare(x[0][c], y[0][c]); if (d) return d; }
      return x[1] - y[1];   // only rows equal on EVERY ordered column keep the order they were stored in
    }).map((p) => p[0]);
  }
  function run(q) {
    calls.push(q.op + ":" + q.table);
    if (q.op === "select" && q.order.length) orders.push({ table: q.table, cols: q.order.slice() });
    if (q.op === "insert") inserts.push({ table: q.table, payload: q.payload });
    if (q.op === "update") updates.push({ table: q.table, payload: q.payload });
    if (q.op === "upsert") upserts.push({ table: q.table, payload: q.payload });
    const err = cfg.errors && (cfg.errors[q.op + ":" + q.table] || cfg.errors["*:" + q.table]);
    if (err) return { data: null, error: err, count: null };
    if (cfg.persist && q.op === "insert") {
      for (const p of Array.isArray(q.payload) ? q.payload : [q.payload]) {
        const row = Object.assign({}, p);
        Object.keys(row).forEach((k) => { if (row[k] === undefined) delete row[k]; });   // an undefined value is never sent, exactly like JSON
        if (row.created_at === undefined && WITH_CREATED_AT.indexOf(q.table) !== -1) row.created_at = serverNow();
        if (row.created_at !== undefined) row.created_at = pgTimestamp(row.created_at);
        (tables[q.table] = tables[q.table] || []).push(row);
      }
      return { data: null, error: null, count: null };
    }
    if (cfg.persist && q.op === "delete") {
      tables[q.table] = (tables[q.table] || []).filter((r) => !q.filters.every(([c, v]) => r[c] === v));
      return { data: null, error: null, count: null };
    }
    let rows = (tables[q.table] || []).filter((r) => q.filters.every(([c, v]) => r[c] === v));
    if (q.op !== "select") return { data: null, error: null, count: null };
    if (q.order.length) rows = sortRows(rows, q.order);
    const max = cfg.maxRows || Infinity;
    let out = rows;
    if (q.range) out = rows.slice(q.range[0], Math.min(q.range[1] + 1, q.range[0] + max));
    else out = rows.slice(0, max);
    return { data: q.single ? out[0] || null : out, error: null, count: q.count ? rows.length : null };
  }
  function builder(table) {
    const q = { table, op: "select", filters: [], range: null, count: null, single: false, payload: null, order: [] };
    const b = {
      select(cols, o) { q.count = o && o.count; return b; },
      insert(p) { q.op = "insert"; q.payload = p; return b; },
      update(p) { q.op = "update"; q.payload = p; return b; },
      delete() { q.op = "delete"; return b; },
      upsert(p) { q.op = "upsert"; q.payload = p; return b; },
      eq(c, v) { q.filters.push([c, v]); return b; },
      order(col, o) { assert.ok(!o || o.ascending !== false, "this stand-in only knows ascending order"); q.order.push(col); return b; },
      range(a, z) { q.range = [a, z]; return b; },
      maybeSingle() { q.single = true; return b; },
      then(res, rej) { return Promise.resolve(run(q)).then(res, rej); },
    };
    return b;
  }
  const signedOut = { data: { user: null }, error: { name: "AuthSessionMissingError", message: "Auth session missing!" } };
  return {
    calls,
    orders,
    inserts,
    updates,
    upserts,
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
  require("./_i18n-env").installI18n(sandbox);
  const run = (file, patch) => vm.runInContext(patch ? patch(read(file)) : read(file), sandbox, { filename: file });
  // What the development profile holds in the repository changes over time (empty now, filled when the site is wired to REBUILT-Dev):
  // a test therefore sets it explicitly — filled with made-up values (configured) or blank — by patching the SOURCE it loads.
  const withProfile = (src) => {
    if (o.shipped) return src;   // the file exactly as shipped: whatever the repository holds is what runs
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

test("strict mode: localhost, a Vercel address and an unknown address have NO backend even when the development profile is filled (only the Developer site uses it)", () => {
  ["localhost", "127.0.0.1", "example.org", "rebuilt-dev.vercel.app"].forEach((h) => {
    const { R, win } = boot({ configured: true, location: { hostname: h, pathname: "/", origin: "https://" + h, search: "", hash: "" } });
    assert.strictEqual(typeof R.SupabaseClient.mustUseBackend, "function", "SupabaseClient.mustUseBackend() is missing");
    assert.strictEqual(R.SupabaseClient.mustUseBackend(), false, h);
    assert.strictEqual(R.SupabaseClient.CONFIG.url, "", h + ": the development project's URL must not be reachable from here");
    assert.strictEqual(R.SupabaseClient.CONFIG.anonKey, "", h);
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
   7. The ORDER rows come back in (found in the final review of 9945f0e)
      Habits / tasks / schedule items / completions were listed by `id` — a random uuid — so a habit created later could be shown
      before one created earlier. The stable order is  created_at, then id  (id only breaks a tie: it is never the main key).
      The stand-in client above now really sorts, so these tests can fail.
   ============================================================ */

/** Rows stored in an order that is neither creation order nor id order, with ids that sort AGAINST creation order, plus a tie. */
function orderedSeed() {
  const t = seedTables();
  const row = (id, title, created_at, extra) => Object.assign({ id, user_id: "u1", title, created_at }, extra);
  const habit = (id, title, at) => row(id, title, at, { xp: 10, frequency: "daily", target_days: [], icon: "x" });
  t.habits = [
    habit("a1000000-0000-4000-8000-000000000000", "third", "2026-11-03T09:00:00Z"),
    habit("f2000000-0000-4000-8000-000000000000", "tie-B", "2026-11-04T00:00:00"),     // same moment as tie-A, larger id, stored first
    habit("c3000000-0000-4000-8000-000000000000", "first", "2026-11-01T09:00:00Z"),
    habit("f1000000-0000-4000-8000-000000000000", "tie-A", "2026-11-04T00:00:00"),
    habit("b2000000-0000-4000-8000-000000000000", "second", "2026-11-02T09:00:00Z"),
  ];
  const task = (id, title, at) => row(id, title, at, { xp: 10, priority: "high", completed: false });
  t.tasks = [
    task("a1000000-0000-4000-8000-000000000001", "third", "2026-11-03T09:00:00Z"),
    task("f2000000-0000-4000-8000-000000000001", "tie-B", "2026-11-04T00:00:00"),
    task("c3000000-0000-4000-8000-000000000001", "first", "2026-11-01T09:00:00Z"),
    task("f1000000-0000-4000-8000-000000000001", "tie-A", "2026-11-04T00:00:00"),
    task("b2000000-0000-4000-8000-000000000001", "second", "2026-11-02T09:00:00Z"),
  ];
  const item = (id, title, at) => row(id, title, at, { type: "event", date: "2026-11-05", start_time: "09:00", completed: false });
  t.schedule_items = [
    item("a1000000-0000-4000-8000-000000000002", "third", "2026-11-03T09:00:00Z"),
    item("f2000000-0000-4000-8000-000000000002", "tie-B", "2026-11-04T00:00:00"),
    item("c3000000-0000-4000-8000-000000000002", "first", "2026-11-01T09:00:00Z"),
    item("f1000000-0000-4000-8000-000000000002", "tie-A", "2026-11-04T00:00:00"),
    item("b2000000-0000-4000-8000-000000000002", "second", "2026-11-02T09:00:00Z"),
  ];
  const done = (id, on, at) => ({ id, user_id: "u1", habit_id: "c3000000-0000-4000-8000-000000000000", completed_on: on, created_at: at });
  t.habit_completions = [
    done("z0000000-0000-4000-8000-000000000003", "2026-11-03", "2026-11-03T08:00:00Z"),
    done("x0000000-0000-4000-8000-000000000003", "2026-11-02", "2026-11-02T08:00:00Z"),
    done("y0000000-0000-4000-8000-000000000003", "2026-11-01", "2026-11-01T08:00:00Z"),
  ];
  return t;
}
const EXPECTED_TITLES = ["first", "second", "third", "tie-A", "tie-B"];
const BOTH = [["strict (development)", { configured: true, location: DEVLOC }], ["stable", { configured: true, location: STABLE }]];

for (const [label, where] of BOTH) {
  test("order [" + label + "]: habits come back in creation order, a tie broken by id", async () => {
    const client = makeClient({ tables: orderedSeed() });
    const { R } = boot(Object.assign({ client }, where));
    const state = await R.SupabaseData.loadFullState(client, "u1");
    assert.deepStrictEqual(plain(state.habits.map((h) => h.title)), EXPECTED_TITLES);
  });

  test("order [" + label + "]: tasks come back in creation order, a tie broken by id", async () => {
    const client = makeClient({ tables: orderedSeed() });
    const { R } = boot(Object.assign({ client }, where));
    const state = await R.SupabaseData.loadFullState(client, "u1");
    assert.deepStrictEqual(plain(state.tasks.map((t) => t.title)), EXPECTED_TITLES);
  });

  test("order [" + label + "]: schedule items come back in creation order, a tie broken by id", async () => {
    const client = makeClient({ tables: orderedSeed() });
    const { R } = boot(Object.assign({ client }, where));
    const state = await R.SupabaseData.loadFullState(client, "u1");
    assert.deepStrictEqual(plain(state.scheduleItems.map((s) => s.title)), EXPECTED_TITLES);
  });

  test("order [" + label + "]: a habit's completions come back in the order they were recorded", async () => {
    const client = makeClient({ tables: orderedSeed() });
    const { R } = boot(Object.assign({ client }, where));
    const state = await R.SupabaseData.loadFullState(client, "u1");
    const first = state.habits.find((h) => h.title === "first");
    assert.deepStrictEqual(plain(first.completionHistory), ["2026-11-01", "2026-11-02", "2026-11-03"]);
  });

  test("order [" + label + "]: the same load twice gives the same order (nothing depends on how the server happens to store rows)", async () => {
    const seed = orderedSeed();
    const reversed = Object.assign({}, seed, { habits: seed.habits.slice().reverse(), tasks: seed.tasks.slice().reverse() });
    const a = makeClient({ tables: seed }), b = makeClient({ tables: reversed });
    const A = boot(Object.assign({ client: a }, where)), B = boot(Object.assign({ client: b }, where));
    const sa = await A.R.SupabaseData.loadFullState(a, "u1");
    const sb = await B.R.SupabaseData.loadFullState(b, "u1");
    assert.deepStrictEqual(plain(sa.habits.map((h) => h.id)), plain(sb.habits.map((h) => h.id)));
    assert.deepStrictEqual(plain(sa.tasks.map((t) => t.id)), plain(sb.tasks.map((t) => t.id)));
  });

  test("order [" + label + "]: the sort the app asks the server for, table by table (pinned)", async () => {
    const client = makeClient({ tables: orderedSeed() });
    const { R } = boot(Object.assign({ client }, where));
    await R.SupabaseData.loadFullState(client, "u1");
    const asked = {};
    for (const o of client.orders) {
      const key = o.cols.join(",");
      assert.ok(!(o.table in asked) || asked[o.table] === key, o.table + " was read with two different orders: " + asked[o.table] + " and " + key);
      asked[o.table] = key;
    }
    assert.deepStrictEqual(asked, {
      habits: "created_at,id",
      habit_completions: "created_at,id",
      tasks: "created_at,id",
      schedule_items: "created_at,id",
      daily_history: "date",
      unlocked_achievements: "unlocked_at,achievement_id",
      ai_conversations: "created_at,id",
    });
  });

  test("order [" + label + "]: paging stays stable — 2500 rows with many equal timestamps, stored shuffled, 1000 per answer: none repeated, none skipped", async () => {
    // A tiny deterministic generator, so a failure can be reproduced.
    let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    const rows = [];
    for (let i = 0; i < 2500; i++) {
      const id = (Math.floor(rnd() * 0xffffffff).toString(16).padStart(8, "0")) + "-0000-4000-8000-" + String(i).padStart(12, "0");
      rows.push({ id, user_id: "u1", title: "t" + i, xp: 1, priority: "low", completed: false, created_at: "2026-10-" + String(1 + (i % 25)).padStart(2, "0") + "T00:00:00" });   // 25 distinct moments → ~100 rows each
    }
    for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
    const tables = Object.assign(seedTables(), { tasks: rows });
    const client = makeClient({ tables, maxRows: 1000 });
    const { R } = boot(Object.assign({ client }, where));
    const state = await R.SupabaseData.loadFullState(client, "u1");
    const ids = plain(state.tasks.map((t) => t.id));
    assert.strictEqual(ids.length, 2500, "every row read");
    assert.strictEqual(new Set(ids).size, 2500, "no row read twice");
    const expected = rows.slice().sort((x, y) => (x.created_at < y.created_at ? -1 : x.created_at > y.created_at ? 1 : x.id < y.id ? -1 : x.id > y.id ? 1 : 0)).map((r) => r.id);
    assert.deepStrictEqual(ids, expected);
  });
}

/* ============================================================
   8. created_at carries the MOMENT of creation (not only the day)
      The app used to write created_at = «the day» + "T00:00:00", so everything made on one day tied and was ordered by its random id.
      Now a habit / task carries `createdStamp` (the local wall-clock moment, made by Data.stampNow) and that is what is written.
      - The stamp is written in the SAME frame the old value was (local time, no zone, read back as if UTC), so the day part —
        which is all the app ever reads back (createdAt = the first 10 characters) — never changes by a day.
      - Old rows (a day only) and old objects (no stamp) keep working exactly as before.
      - Schedule items and completions were never date-only: the server's now() stamps them, and nothing is sent for a new one.
      - The achievements table only has a DATE column (unlocked_at); there is nothing finer to record without a migration.
   ============================================================ */

const asUTC = (s) => Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(s) ? s : s + "Z");   // how the database reads a timestamp: no zone = UTC
const local = (y, mo, d, h, mi, s, ms) => new Date(y, mo - 1, d, h || 0, mi || 0, s || 0, ms || 0).getTime();   // a moment given as wall-clock numbers (any time zone)

/** js/data.js in a bare context of its own, with a clock the test moves. */
function loadData(startMs) {
  let nowMs = startMs;
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(nowMs); }
    static now() { return nowMs; }
  }
  const sandbox = { console, Date: FakeDate };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  require("./_i18n-env").installI18n(sandbox);
  vm.runInContext(read("js/data.js"), sandbox, { filename: "js/data.js" });
  return { Data: sandbox.REBUILT.Data, set(ms) { nowMs = ms; } };
}

test("Data.stampNow(): the local wall-clock moment, to the millisecond, no zone; its day is exactly todayISO()", () => {
  const D = loadData(local(2026, 11, 3, 21, 38, 12, 345));
  assert.strictEqual(typeof D.Data.stampNow, "function", "REBUILT.Data.stampNow() is missing");
  assert.strictEqual(D.Data.stampNow(), "2026-11-03T21:38:12.345");
  D.set(local(2026, 11, 3, 23, 59, 59, 999));
  const late = D.Data.stampNow();
  assert.strictEqual(late, "2026-11-03T23:59:59.999");
  assert.strictEqual(late.slice(0, 10), D.Data.todayISO(), "the stamp's day and the app's «today» must be the same day (createdAt is that day)");
  D.set(local(2026, 11, 4, 0, 0, 0, 1));
  assert.strictEqual(D.Data.stampNow().slice(0, 10), D.Data.todayISO());
  assert.ok(!Number.isNaN(Date.parse(D.Data.stampNow() + "Z")), "must be a timestamp Postgres accepts");
});

test("Data.stampNow(): every call is later than the one before, even inside the same millisecond (rows made in a loop keep their order)", () => {
  const D = loadData(local(2026, 11, 3, 9, 0, 0, 0));
  const got = [];
  for (let i = 0; i < 6; i++) got.push(D.Data.stampNow());                       // the clock never moves
  assert.deepStrictEqual(got.slice().sort(), got, "not increasing: " + got.join(" "));
  assert.strictEqual(new Set(got).size, 6, "two calls gave the same stamp");
  assert.strictEqual(got[0], "2026-11-03T09:00:00.000");
});

test("Data.stampNow(): follows a clock that moves back (summer-time change) without ever repeating — and obeys a clock set back for good", () => {
  const D = loadData(local(2026, 11, 3, 9, 0, 0, 0));
  const a = D.Data.stampNow();
  D.set(local(2026, 11, 3, 8, 0, 0, 0));                                          // the clock went back one hour
  const b = D.Data.stampNow();
  assert.ok(b > a, "a stamp made after another must sort after it: " + a + " then " + b);
  D.set(local(2026, 11, 3, 3, 0, 0, 0));                                          // six hours back: this is not a summer-time change, trust the clock
  assert.strictEqual(D.Data.stampNow(), "2026-11-03T03:00:00.000");
});

/** A habit / task as the app holds it right after creating it. */
const madeHabit = (id, title, stamp) => ({ id, title, icon: "x", xp: 10, frequency: "daily", targetDays: [], createdAt: stamp.slice(0, 10), createdStamp: stamp });
const madeTask = (id, title, stamp) => ({ id, title, priority: "low", xp: 5, completed: false, createdAt: stamp.slice(0, 10), createdStamp: stamp });
const noWrittenTables = () => Object.assign(seedTables(), { habits: [], tasks: [], schedule_items: [], habit_completions: [] });
// ids that sort AGAINST creation order, so «ordered by id» and «ordered by creation» can never agree by luck
const IDS = ["d4000000-0000-4000-8000-0000000000", "c3000000-0000-4000-8000-0000000000", "b2000000-0000-4000-8000-0000000000", "a1000000-0000-4000-8000-0000000000"];

for (const [label, where] of BOTH) {
  test("same day, different times [" + label + "]: habits keep their creation order after a reload — whatever order the writes arrive in, whatever the ids", async () => {
    const D = loadData(local(2026, 11, 3, 9, 30));
    const client = makeClient({ tables: noWrittenTables(), persist: true });
    const { R } = boot(Object.assign({ client }, where));
    const made = [9, 13, 17, 21].map((h, i) => { D.set(local(2026, 11, 3, h, 30)); return madeHabit(IDS[i] + "01", "h" + i, D.Data.stampNow()); });
    for (const i of [2, 0, 3, 1]) await R.SupabaseData.insertHabit(client, "u1", made[i]);      // arrival order ≠ creation order
    const state = await R.SupabaseData.loadFullState(client, "u1");
    assert.deepStrictEqual(plain(state.habits.map((h) => h.title)), ["h0", "h1", "h2", "h3"]);
    assert.deepStrictEqual(plain(state.habits.map((h) => h.createdAt)), ["2026-11-03", "2026-11-03", "2026-11-03", "2026-11-03"], "the DAY must not move");
  });

  test("same day, different times [" + label + "]: tasks keep their creation order after a reload", async () => {
    const D = loadData(local(2026, 11, 3, 9, 30));
    const client = makeClient({ tables: noWrittenTables(), persist: true });
    const { R } = boot(Object.assign({ client }, where));
    const made = [9, 13, 17, 21].map((h, i) => { D.set(local(2026, 11, 3, h, 30)); return madeTask(IDS[i] + "02", "t" + i, D.Data.stampNow()); });
    for (const i of [3, 1, 0, 2]) await R.SupabaseData.insertTask(client, "u1", made[i]);
    const state = await R.SupabaseData.loadFullState(client, "u1");
    assert.deepStrictEqual(plain(state.tasks.map((t) => t.title)), ["t0", "t1", "t2", "t3"]);
    assert.deepStrictEqual(plain(state.tasks.map((t) => t.createdAt)), ["2026-11-03", "2026-11-03", "2026-11-03", "2026-11-03"]);
  });

  test("same moment's millisecond [" + label + "]: habits made in a loop (the clock does not move) keep the order they were made in", async () => {
    const D = loadData(local(2026, 11, 3, 9, 30));
    const client = makeClient({ tables: noWrittenTables(), persist: true });
    const { R } = boot(Object.assign({ client }, where));
    const made = [0, 1, 2, 3].map((i) => madeHabit(IDS[i] + "03", "h" + i, D.Data.stampNow()));
    for (const h of made.slice().reverse()) await R.SupabaseData.insertHabit(client, "u1", h);
    const state = await R.SupabaseData.loadFullState(client, "u1");
    assert.deepStrictEqual(plain(state.habits.map((h) => h.title)), ["h0", "h1", "h2", "h3"]);
  });

  test("the day never moves [" + label + "]: made at 23:59:59.999 or 00:00:00.001 local, createdAt is that local day, not the next or the previous", async () => {
    const D = loadData(local(2026, 11, 3, 23, 59, 59, 999));
    const client = makeClient({ tables: noWrittenTables(), persist: true });
    const { R } = boot(Object.assign({ client }, where));
    const late = madeHabit("a0000000-0000-4000-8000-000000000004", "late", D.Data.stampNow());
    D.set(local(2026, 11, 4, 0, 0, 0, 1));
    const early = madeHabit("a0000000-0000-4000-8000-000000000005", "early", D.Data.stampNow());
    await R.SupabaseData.insertHabit(client, "u1", late);
    await R.SupabaseData.insertHabit(client, "u1", early);
    const state = await R.SupabaseData.loadFullState(client, "u1");
    assert.deepStrictEqual(plain(state.habits.map((h) => [h.title, h.createdAt])), [["late", "2026-11-03"], ["early", "2026-11-04"]]);
  });

  test("undo [" + label + "]: a deleted habit / task that is restored goes back to ITS place, not to the end or the start of its day", async () => {
    const D = loadData(local(2026, 11, 3, 9, 30));
    const client = makeClient({ tables: noWrittenTables(), persist: true });
    const { R } = boot(Object.assign({ client }, where));
    for (const [i, h] of [9, 13, 17, 21].entries()) {
      D.set(local(2026, 11, 3, h, 30));
      const at = D.Data.stampNow();
      await R.SupabaseData.insertHabit(client, "u1", madeHabit(IDS[i] + "06", "h" + i, at));
      await R.SupabaseData.insertTask(client, "u1", madeTask(IDS[i] + "07", "t" + i, at));
    }
    let state = await R.SupabaseData.loadFullState(client, "u1");
    assert.deepStrictEqual(plain(state.habits.map((h) => h.title)), ["h0", "h1", "h2", "h3"]);
    const habit = JSON.parse(JSON.stringify(state.habits[1])), task = JSON.parse(JSON.stringify(state.tasks[1]));   // what the app keeps for «undo»: a clone of the object it showed
    await R.SupabaseData.deleteHabit(client, habit.id);
    await R.SupabaseData.deleteTask(client, task.id);
    state = await R.SupabaseData.loadFullState(client, "u1");
    assert.deepStrictEqual(plain(state.habits.map((h) => h.title)), ["h0", "h2", "h3"]);
    await R.SupabaseData.insertHabit(client, "u1", habit);                                                         // undo = the same insert again
    await R.SupabaseData.insertTask(client, "u1", task);
    state = await R.SupabaseData.loadFullState(client, "u1");
    assert.deepStrictEqual(plain(state.habits.map((h) => h.title)), ["h0", "h1", "h2", "h3"], "the restored habit moved");
    assert.deepStrictEqual(plain(state.tasks.map((t) => t.title)), ["t0", "t1", "t2", "t3"], "the restored task moved");
    assert.deepStrictEqual(plain(state.habits.map((h) => h.createdAt)), ["2026-11-03", "2026-11-03", "2026-11-03", "2026-11-03"]);
  });

  test("schedule items [" + label + "]: a new one sends NO created_at (the server's now() is the real time) and they keep creation order; undo puts one back in place", async () => {
    const client = makeClient({ tables: noWrittenTables(), persist: true });
    const { R } = boot(Object.assign({ client }, where));
    const item = (id, title) => ({ id, title, type: "event", date: "2026-11-05", startTime: "09:00", endTime: null, notes: "" });
    for (let i = 0; i < 4; i++) await R.SupabaseData.insertScheduleItem(client, "u1", item(IDS[i] + "08", "s" + i));
    assert.ok(client.inserts.filter((x) => x.table === "schedule_items").every((x) => x.payload.created_at === undefined), "a new item must leave created_at to the server");
    let state = await R.SupabaseData.loadFullState(client, "u1");
    assert.deepStrictEqual(plain(state.scheduleItems.map((s) => s.title)), ["s0", "s1", "s2", "s3"]);
    const snapshot = JSON.parse(JSON.stringify(state.scheduleItems[1]));
    await R.SupabaseData.deleteScheduleItem(client, snapshot.id);
    await R.SupabaseData.insertScheduleItem(client, "u1", snapshot);
    state = await R.SupabaseData.loadFullState(client, "u1");
    assert.deepStrictEqual(plain(state.scheduleItems.map((s) => s.title)), ["s0", "s1", "s2", "s3"], "the restored item moved to the end");
  });
}

/* ---- old data keeps working ---- */

for (const [label, where] of BOTH) {
  test("old data [" + label + "]: rows written as «day + T00:00:00» load in the order they always had (created_at, then id), with the same createdAt", async () => {
    const t = noWrittenTables();
    const row = (id, title) => ({ id, user_id: "u1", title, xp: 10, frequency: "daily", target_days: [], icon: "x", created_at: "2026-10-30T00:00:00+00:00" });
    t.habits = [row("c3000000-0000-4000-8000-000000000009", "legacy-c"), row("a1000000-0000-4000-8000-000000000009", "legacy-a"), row("b2000000-0000-4000-8000-000000000009", "legacy-b"),
      Object.assign(row("0f000000-0000-4000-8000-000000000009", "older-day"), { created_at: "2026-10-29T00:00:00+00:00" })];
    const client = makeClient({ tables: t });
    const { R } = boot(Object.assign({ client }, where));
    const state = await R.SupabaseData.loadFullState(client, "u1");
    assert.deepStrictEqual(plain(state.habits.map((h) => h.title)), ["older-day", "legacy-a", "legacy-b", "legacy-c"]);
    assert.deepStrictEqual(plain(state.habits.map((h) => h.createdAt)), ["2026-10-29", "2026-10-30", "2026-10-30", "2026-10-30"]);
  });

  test("old data [" + label + "]: old rows and new rows of the same day mix cleanly — the old ones first, the new ones in the order they were made", async () => {
    const D = loadData(local(2026, 11, 3, 10, 0));
    const t = noWrittenTables();
    const legacy = (id, title) => ({ id, user_id: "u1", title, xp: 10, frequency: "daily", target_days: [], icon: "x", created_at: "2026-11-03T00:00:00+00:00" });
    t.habits = [legacy("f0000000-0000-4000-8000-00000000000a", "old-2"), legacy("e0000000-0000-4000-8000-00000000000a", "old-1")];
    const client = makeClient({ tables: t, persist: true });
    const { R } = boot(Object.assign({ client }, where));
    const first = madeHabit("00000000-0000-4000-8000-00000000000a", "new-1", D.Data.stampNow());
    D.set(local(2026, 11, 3, 15, 0));
    const second = madeHabit("00000001-0000-4000-8000-00000000000a", "new-2", D.Data.stampNow());
    await R.SupabaseData.insertHabit(client, "u1", second);
    await R.SupabaseData.insertHabit(client, "u1", first);
    const state = await R.SupabaseData.loadFullState(client, "u1");
    assert.deepStrictEqual(plain(state.habits.map((h) => h.title)), ["old-1", "old-2", "new-1", "new-2"]);
    assert.ok(state.habits.every((h) => h.createdAt === "2026-11-03"));
  });

  test("old data [" + label + "]: an old row that is restored (undo) is written back with the SAME created_at it had", async () => {
    const t = noWrittenTables();
    t.habits = [{ id: "a1000000-0000-4000-8000-00000000000b", user_id: "u1", title: "legacy", xp: 10, frequency: "daily", target_days: [], icon: "x", created_at: "2026-10-30T00:00:00+00:00" }];
    t.tasks = [{ id: "a1000000-0000-4000-8000-00000000000c", user_id: "u1", title: "legacy", xp: 5, priority: "low", completed: false, created_at: "2026-10-30T00:00:00+00:00" }];
    const client = makeClient({ tables: t, persist: true });
    const { R } = boot(Object.assign({ client }, where));
    const state = await R.SupabaseData.loadFullState(client, "u1");
    await R.SupabaseData.insertHabit(client, "u1", JSON.parse(JSON.stringify(state.habits[0])));
    await R.SupabaseData.insertTask(client, "u1", JSON.parse(JSON.stringify(state.tasks[0])));
    for (const i of client.inserts) assert.strictEqual(asUTC(i.payload.created_at), asUTC("2026-10-30T00:00:00+00:00"), i.table + " was written back with " + i.payload.created_at);
  });
}

test("old objects: a habit / task WITHOUT a stamp (an older local copy, an imported file, demo data) is written exactly as before: day + T00:00:00", async () => {
  for (const [, where] of BOTH) {
    const client = makeClient({ tables: noWrittenTables() });
    const { R } = boot(Object.assign({ client }, where));
    await R.SupabaseData.insertHabit(client, "u1", { id: "h", title: "x", icon: "x", xp: 10, frequency: "daily", targetDays: [], createdAt: "2026-10-30" });
    await R.SupabaseData.insertTask(client, "u1", { id: "t", title: "x", priority: "low", xp: 5, createdAt: "2026-10-30" });
    assert.deepStrictEqual(client.inserts.map((i) => i.payload.created_at), ["2026-10-30T00:00:00", "2026-10-30T00:00:00"]);
    await R.SupabaseData.insertHabit(client, "u1", { id: "h2", title: "x", icon: "x", xp: 10, frequency: "daily", targetDays: [] });
    assert.strictEqual(client.inserts[2].payload.created_at, undefined, "no createdAt at all → leave it to the server (as before)");
  }
});

test("a stamp that does not belong to the habit's day is NOT trusted (createdAt must stay the first 10 characters of created_at)", async () => {
  const client = makeClient({ tables: noWrittenTables() });
  const { R } = boot({ configured: true, client });
  await R.SupabaseData.insertHabit(client, "u1", { id: "h", title: "x", icon: "x", xp: 10, frequency: "daily", targetDays: [], createdAt: "2026-10-30", createdStamp: "2026-11-03T10:00:00.000" });
  await R.SupabaseData.insertTask(client, "u1", { id: "t", title: "x", priority: "low", xp: 5, createdAt: "2026-10-30", createdStamp: "garbage" });
  assert.deepStrictEqual(client.inserts.map((i) => i.payload.created_at), ["2026-10-30T00:00:00", "2026-10-30T00:00:00"]);
});

test("editing never rewrites when something was created (no created_at in any update)", async () => {
  const client = makeClient({ tables: seedTables() });
  const { R } = boot({ configured: true, client });
  const all = { title: "n", description: "d", icon: "x", xp: 1, frequency: "daily", targetDays: [], time: null, priority: "low", date: null, type: "event", startTime: "09:00", endTime: null, notes: "", createdAt: "2026-11-03", createdStamp: "2026-11-03T10:00:00.000" };
  await R.SupabaseData.updateHabit(client, "h1", all);
  await R.SupabaseData.updateTask(client, "t1", all);
  await R.SupabaseData.updateScheduleItem(client, "s1", all);
  assert.strictEqual(client.updates.length, 3);
  client.updates.forEach((u) => assert.ok(!("created_at" in u.payload) && !("createdStamp" in u.payload) && !("createdAt" in u.payload), u.table + " update carries a creation time: " + JSON.stringify(Object.keys(u.payload))));
});

test("achievements: unlocked_at stays a plain DATE (the column is a date; there is no timestamp to record without a migration)", async () => {
  const client = makeClient({ tables: seedTables() });
  const { R } = boot({ configured: true, client });
  await R.SupabaseData.insertUnlockedAchievement(client, "u1", "first_habit", "2026-11-03", 50);
  assert.strictEqual(client.upserts.length, 1, "the achievement was not written");
  assert.strictEqual(client.upserts[0].payload.unlocked_at, "2026-11-03", "unlocked_at is a date column: a day, never a time");
  assert.ok(!("created_at" in client.upserts[0].payload), "the table has no created_at column");
  const t = seedTables(); t.unlocked_achievements = [{ user_id: "u1", achievement_id: "b", unlocked_at: "2026-11-03" }, { user_id: "u1", achievement_id: "a", unlocked_at: "2026-11-03" }, { user_id: "u1", achievement_id: "c", unlocked_at: "2026-11-01" }];
  const c2 = makeClient({ tables: t });
  const B = boot({ configured: true, client: c2 });
  await B.R.SupabaseData.loadFullState(c2, "u1");
  assert.deepStrictEqual(c2.orders.filter((o) => o.table === "unlocked_achievements").map((o) => o.cols.join(",")), ["unlocked_at,achievement_id"]);
});

/* ============================================================
   9. The profile AS SHIPPED (no test patch): the Developer site is wired to REBUILT-Dev, in strict mode — and nothing else is
   ============================================================ */

const REAL_DEV_URL = "https://zdqwhbtsjjlfkzdywsqt.supabase.co";
const DEV_SITE = { hostname: "omarelzanaty1.github.io", pathname: "/REBUILT-Developer/", origin: "https://omarelzanaty1.github.io", search: "", hash: "" };

test("as shipped: the Developer site asks for REBUILT-Dev and strict mode is on", () => {
  const spy = [];
  const client = makeClient({ tables: seedTables() });
  const { R, win } = boot({ shipped: true, client, location: DEV_SITE });
  win.supabase = { createClient: (url, key) => { spy.push({ url, key }); return client; } };
  assert.strictEqual(R.SupabaseClient.mustUseBackend(), true);
  assert.ok(R.SupabaseClient.get(), "a client must be created");
  assert.deepStrictEqual(plain(spy.map((x) => x.url)), [REAL_DEV_URL]);
  assert.ok(/^sb_publishable_/.test(spy[0].key));
  assert.strictEqual(R.Auth.mode(), "supabase");
});

test("as shipped: with the Developer server unreachable the app reports an error — it never falls back to the browser copy, and never touches it", async () => {
  const client = makeClient({ tables: seedTables(), errors: { "select:profiles": { code: "", message: "TypeError: Failed to fetch" } } });
  const { R, local } = boot({ shipped: true, client, location: DEV_SITE, cache: { rebuilt_state_v1: POISON } });
  let reads = 0, writes = 0; const get = local.getItem, set = local.setItem;
  local.getItem = (k) => { if (k === "rebuilt_state_v1") reads += 1; return get(k); };
  local.setItem = (k, v) => { if (k === "rebuilt_state_v1") writes += 1; return set(k, v); };
  const err = await rejects(R.Storage.load());
  assert.strictEqual(err.name, "BackendError");
  assert.strictEqual(err.kind, "network");
  R.Storage.save({ habits: [{ title: "x" }] });
  assert.strictEqual(reads, 0, "the browser copy must not be read");
  assert.strictEqual(writes, 0, "the browser copy must not be written");
  assert.strictEqual(local.getItem("rebuilt_state_v1"), POISON);
});

test("as shipped: with the library missing the Developer site is 'unavailable' (an error), never the device-only local sign-in", () => {
  const { R } = boot({ shipped: true, client: null, location: DEV_SITE });
  assert.strictEqual(R.Auth.mode(), "unavailable");
  assert.strictEqual(R.Auth.isRealAuth(), false);
});

for (const [name, location] of [["localhost", { hostname: "localhost", pathname: "/", origin: "http://localhost:4173", search: "", hash: "" }],
  ["a retired vercel address", { hostname: "rebuilt-jet.vercel.app", pathname: "/", origin: "https://rebuilt-jet.vercel.app", search: "", hash: "" }],
  ["an unknown address", { hostname: "example.com", pathname: "/", origin: "https://example.com", search: "", hash: "" }]]) {
  test("as shipped: " + name + " has no backend — local mode, no client, strict mode off", () => {
    const spy = [];
    const { R, win } = boot({ shipped: true, client: makeClient(), location });
    win.supabase = { createClient: (url) => { spy.push(url); return makeClient(); } };
    assert.strictEqual(R.SupabaseClient.mustUseBackend(), false);
    assert.strictEqual(R.SupabaseClient.get(), null);
    assert.deepStrictEqual(plain(spy), [], "no client may be created at " + name);
    assert.strictEqual(R.Auth.mode(), "local");
  });
}

test("as shipped: stable keeps the production project and keeps its old fallbacks (strict off)", () => {
  const spy = [];
  const client = makeClient({ tables: seedTables() });
  const { R, win } = boot({ shipped: true, client, location: STABLE });
  win.supabase = { createClient: (url) => { spy.push(url); return client; } };
  assert.strictEqual(R.SupabaseClient.mustUseBackend(), false);
  R.SupabaseClient.get();
  assert.deepStrictEqual(plain(spy), ["https://jvyhtpfedkypwdzyadba.supabase.co"]);
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
