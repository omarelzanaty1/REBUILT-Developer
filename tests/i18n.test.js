/* ============================================================
   REBUILT — tests/i18n.test.js
   Guards the translation system (no browser needed):
     1. every key exists in BOTH languages, with the same {placeholders}
     2. every t("ns.key") written in the code exists
     3. no Arabic text is left inside the code (everything the person reads
        lives in js/locales/); a line may carry  // i18n-ignore  with a reason
     4. the core: plural / number / date / time formats, fallback to Arabic
     5. a person never sees a key: an unknown key shows nothing (and is warned about once)
     6. the dictionaries are CHECKED before the first screen (I18n.ready): a file that failed to load, or came from another
        build, is fetched again; if it never arrives the app still draws (with the fallback) and redraws when it does
   Run:  node tests/i18n.test.js            (add --report to list every finding)
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const REPORT = process.argv.includes("--report");
const ARABIC = /[؀-ۿ]/;
let passed = 0, failed = 0;
const later = [];   // async tests run after the synchronous ones
function testAsync(name, fn) { later.push([name, fn]); }
function test(name, fn) {
  try { fn(); passed++; console.log("PASS " + name); }
  catch (e) { failed++; console.log("FAIL " + name + "\n     " + String(e.message).split("\n").join("\n     ")); }
}

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");

/* ---- load the core and every dictionary the way the browser does (index.html order) ---- */
function load(skip, quiet) {
  const store = {};
  const sandbox = { console: quiet ? { warn() {}, error() {}, log() {} } : console, Intl, Date, JSON, Object, Array, Number, String, RegExp, Math, setTimeout, clearTimeout, Promise, Set };
  sandbox.window = sandbox;
  sandbox.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
  const attrs = {};
  sandbox.document = { documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => attrs[k] }, querySelectorAll: () => [], querySelector: () => null };
  vm.createContext(sandbox);
  const run = (f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f });
  run("js/prefs.js"); run("js/i18n.js");
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const files = [...html.matchAll(/<script src="(js\/locales\/[^"]+)"/g)].map((m) => m[1]);
  files.filter((f) => !(skip || []).includes(f)).forEach(run);
  return { sandbox, I: sandbox.REBUILT.I18n, files, attrs, run };
}

const { sandbox, I, files: localeFiles } = load();
const LANGS = I.languages().map((l) => l.code);

test("index.html loads one dictionary per language and area, and every file exists", () => {
  LANGS.forEach((l) => assert.ok(localeFiles.some((f) => f.startsWith("js/locales/" + l + "/")), "no dictionaries loaded for " + l));
  const onDisk = walk(path.join(ROOT, "js/locales")).map(rel).sort();
  assert.deepStrictEqual(localeFiles.slice().sort(), onDisk, "js/locales/ and the <script> lines in index.html must list the same files");
});

const placeholders = (v) => (typeof v === "string" ? (v.match(/\{(\w+)\}/g) || []).sort().join(",") : "fn");
test("every key exists in every language with the same placeholders", () => {
  const base = I.keysOf("ar");
  const problems = [];
  LANGS.filter((l) => l !== "ar").forEach((l) => {
    const keys = new Set(I.keysOf(l));
    base.forEach((k) => { if (!keys.has(k)) problems.push(l + " is missing " + k); });
    keys.forEach((k) => { if (!base.includes(k)) problems.push(l + " has " + k + " which Arabic does not"); });
  });
  // the same {placeholders} in every language (function values are checked by calling them)
  const holes = (v) => (typeof v === "string" ? (v.match(/\{\w+\}/g) || []).sort().join(",") : null);
  base.forEach((k) => {
    LANGS.filter((l) => l !== "ar").forEach((l) => {
      const a = I.raw("ar", k), b = I.raw(l, k);
      if (b === undefined) return;
      if (typeof a === "string" && typeof b === "string" && holes(a) !== holes(b)) problems.push(k + ": placeholders differ between ar (" + holes(a) + ") and " + l + " (" + holes(b) + ")");
      [a, b].forEach((v, i) => {
        if (typeof v !== "function") return;
        try { const out = v({ n: 3, p1: "x", p2: "y", name: "x" }, I); if (typeof out !== "string" && typeof out !== "number") problems.push(k + ": function in " + (i ? l : "ar") + " did not return text"); }
        catch (err) { problems.push(k + ": function in " + (i ? l : "ar") + " threw " + err.message); }
      });
    });
  });
  if (REPORT) console.log(problems.join("\n"));
  assert.strictEqual(problems.length, 0, problems.length + " problem(s); first: " + problems.slice(0, 8).join(" | "));
});

/* ---- the code: t() keys used, Arabic left ---- */
const CODE = walk(path.join(ROOT, "js")).filter((f) => f.endsWith(".js") && !rel(f).startsWith("js/locales/")).concat([path.join(ROOT, "index.html")]);
function stripComments(src, isHtml) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  if (isHtml) out = out.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
  return out.split("\n").map((line) => {
    if (/i18n-ignore/.test(line)) return "";
    // drop a trailing // comment that is not inside a string or a URL
    return line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1");
  });
}

test("every t(\"ns.key\") in the code exists in Arabic (the fallback)", () => {
  const known = new Set(I.keysOf("ar"));
  const bad = [];
  CODE.forEach((f) => {
    const src = stripComments(fs.readFileSync(f, "utf8"), f.endsWith(".html")).join("\n");
    for (const m of src.matchAll(/(?:\bt|I18n\.t|REBUILT\.t)\(\s*(["'])([a-zA-Z][\w]*\.[\w.\-]+)\1(\s*\+)?/g)) {
      const key = m[2];
      // "ns.group_" + something → a family of keys: at least one must exist
      const ok = m[3] ? I.keysOf("ar").some((k) => k.startsWith(key)) : known.has(key);
      if (!ok) bad.push(rel(f) + ": " + key);
    }
    for (const m of src.matchAll(/data-i18n(?:-attr)?="([^"]+)"/g)) {
      m[1].split(";").forEach((p) => { const k = p.includes(":") ? p.split(":")[1].trim() : p.trim(); if (/^[a-zA-Z][\w]*\.[\w.\-]+$/.test(k) && !known.has(k)) bad.push(rel(f) + ": " + k); });
    }
  });
  if (REPORT) console.log(bad.join("\n"));
  assert.strictEqual(bad.length, 0, bad.length + " unknown key(s); first: " + bad.slice(0, 8).join(" | "));
});

test("no Arabic text is left in the code (it all lives in js/locales/)", () => {
  const left = {};
  CODE.forEach((f) => {
    const isHtml = f.endsWith(".html");
    stripComments(fs.readFileSync(f, "utf8"), isHtml).forEach((line, i) => {
      if (isHtml && /data-i18n/.test(line)) return; // the first-paint default of a translated element
      if (ARABIC.test(line)) (left[rel(f)] = left[rel(f)] || []).push((i + 1) + ": " + line.trim().slice(0, 110));
    });
  });
  const total = Object.values(left).reduce((n, a) => n + a.length, 0);
  console.log("     Arabic lines left in code: " + total + (total ? "  (" + Object.entries(left).map(([f, a]) => f.replace(/^js\//, "") + "=" + a.length).join(", ") + ")" : ""));
  if (REPORT) Object.entries(left).forEach(([f, a]) => a.forEach((l) => console.log("     " + f + ":" + l)));
  assert.strictEqual(total, 0, total + " line(s) still hold Arabic text");
});

/* ---- the core ---- */
test("core: fallback to Arabic, then to the key; placeholders; plural; formats", () => {
  I.add("ar", "zz", { a: "أهلاً {name}", n: (p, i) => i.plural(p.n, { one: "واحد", two: "اتنين", few: "{n} حاجات", other: "{n} حاجة" }) });
  I.add("en", "zz", { n: (p, i) => i.plural(p.n, { one: "one thing", other: "{n} things" }) });
  assert.strictEqual(I.t("zz.a", { name: "عمر" }), "أهلاً عمر");
  assert.strictEqual(I.t("zz.nope"), "", "an unknown key shows nothing — never the key itself");
  assert.strictEqual(I.t("zz.n", { n: 1 }), "واحد");
  assert.strictEqual(I.t("zz.n", { n: 3 }), "3 حاجات");
  I.setLang("en");
  assert.strictEqual(I.t("zz.a", { name: "Omar" }), "أهلاً Omar", "an untranslated key falls back to Arabic (and is reported)");
  assert.ok(I.missing().includes("en|zz.a"));
  assert.strictEqual(I.t("zz.n", { n: 1 }), "one thing");
  assert.strictEqual(I.t("zz.n", { n: 2 }), "2 things");
  assert.strictEqual(I.dir(), "ltr");
  assert.strictEqual(I.time("17:05"), "5:05 PM");
  assert.strictEqual(I.time("00:10"), "12:10 AM");
  assert.strictEqual(I.number(1234567), "1,234,567");
  assert.strictEqual(I.date("2026-11-10"), "10 Nov");
  I.setLang("ar");
  assert.strictEqual(I.dir(), "rtl");
  assert.strictEqual(I.time("17:05"), "17:05");
  assert.ok(/نوفمبر/.test(I.date("2026-11-10")), I.date("2026-11-10"));
  assert.strictEqual(sandbox.REBUILT.Prefs.read().lang, "ar", "the choice is remembered on the device");
});

/* ---- a person never sees a key ---- */
test("an unknown key shows nothing and is warned about once; an untranslated one shows Arabic and is warned about once", () => {
  const warnings = [];
  const ctx = load([], true);
  ctx.sandbox.console = { warn: (m) => warnings.push(String(m)), error() {}, log() {} };
  const J = ctx.I;
  J.setLang("en");
  assert.strictEqual(J.t("no.such_key"), ""); assert.strictEqual(J.t("no.such_key"), ""); assert.strictEqual(J.t("no.such_key"), "");
  assert.strictEqual(warnings.filter((w) => /no\.such_key/.test(w)).length, 1, "one console warning per key, not one per draw");
  assert.ok(J.missing().includes("*|no.such_key"));
  J.add("ar", "zz2", { only_ar: "عربي فقط" });
  assert.strictEqual(J.t("zz2.only_ar"), "عربي فقط");
  assert.strictEqual(warnings.filter((w) => /zz2\.only_ar/.test(w)).length, 1);
  // no real key of the app may come back as itself in either language
  ["ar", "en"].forEach((l) => { J.setLang(l); J.keysOf("ar").slice(0, 400).forEach((k) => { const v = J.t(k, { n: 1, name: "x" }); assert.ok(v !== k && v !== "", l + ": " + k + " drew as " + JSON.stringify(v)); }); });
});

/* ---- the dictionary list in the engine is the folder on disk ---- */
test("I18n.NAMESPACES lists exactly the dictionary files of every language", () => {
  LANGS.forEach((l) => {
    const onDisk = fs.readdirSync(path.join(ROOT, "js/locales", l)).map((f) => f.replace(/\.js$/, "")).sort();
    assert.deepStrictEqual(Array.from(I.NAMESPACES).sort(), onDisk, "I18n.NAMESPACES (js/i18n.js) and js/locales/" + l + "/ disagree");
  });
});

/* ---- the check before the first screen ---- */
const urlFile = (url) => { const m = /(js\/locales\/[a-z]+\/[a-z]+\.js)/.exec(url); return m && m[1]; };
function savedLang(ctx, code) { ctx.sandbox.REBUILT.Prefs.write({ lang: code }); ctx.I.init(); }

testAsync("ready(): nothing to fetch when everything is already there (the normal case costs nothing)", async () => {
  const ctx = load([], true); savedLang(ctx, "en");
  let calls = 0; ctx.I._loader.load = () => { calls++; return Promise.resolve(); };
  const r = await ctx.I.ready();
  assert.ok(r.ok); assert.strictEqual(calls, 0);
});

testAsync("ready(): a dictionary file that failed once is fetched again (cache-busted) BEFORE the first screen, so nothing is half-translated", async () => {
  const skip = "js/locales/en/habits.js";
  const ctx = load([skip], true); savedLang(ctx, "en");
  assert.strictEqual(ctx.I.t("habits.today"), "النهارده", "before the check the missing file shows Arabic — the symptom");
  const asked = []; let fail = 1;
  ctx.I._loader.load = (url) => { asked.push(url); if (fail-- > 0) return Promise.reject(new Error("503")); ctx.run(urlFile(url)); return Promise.resolve(); };
  const r = await ctx.I.ready({ rounds: 3, budgetMs: 3000 });
  assert.ok(r.ok, "ready() must finish with a complete dictionary: " + JSON.stringify(r.left));
  assert.ok(asked.length === 2 && asked.every((u) => urlFile(u) === skip), "it fetched exactly the missing file, twice: " + asked.join(" "));
  assert.ok(/[?&]r=/.test(asked[1]) || /[?&]r=/.test(asked[0]), "the retry bypasses any cached copy");
  assert.strictEqual(ctx.I.t("habits.today"), "Today");
  assert.strictEqual(ctx.I.problems().length, 0, "no namespace is missing or out of step any more");
  assert.ok(ctx.I.raw("en", "habits.today") !== undefined && ctx.I.keysOf("en").length === ctx.I.keysOf("ar").length, "English is complete again");
});

testAsync("ready(): a file from ANOTHER BUILD (its keys differ from its twin) is detected and fetched again, in both languages", async () => {
  const ctx = load([], true); savedLang(ctx, "en");
  const real = ctx.I.keysOf("en").filter((k) => k.startsWith("tasks."));
  ctx.I.add("en", "tasks", { an_old_key_nobody_uses_any_more: "old" });   // what a stale cached copy would leave behind (replaces the key list of the file)
  assert.ok(ctx.I.problems().some((p) => p.ns === "tasks"), "the mismatch is noticed");
  const asked = []; ctx.I._loader.load = (url) => { asked.push(urlFile(url)); ctx.run(urlFile(url)); return Promise.resolve(); };
  const r = await ctx.I.ready({ rounds: 2, budgetMs: 3000 });
  assert.ok(r.ok, JSON.stringify(r.left));
  assert.ok(asked.includes("js/locales/en/tasks.js") && asked.includes("js/locales/ar/tasks.js"), "either side may be the stale one: " + asked.join(","));
  assert.strictEqual(ctx.I.keysOf("en").filter((k) => k.startsWith("tasks.") && k !== "tasks.an_old_key_nobody_uses_any_more").length, real.length);
});

testAsync("ready(): if a file never arrives the app still draws (Arabic fallback, never a key), then redraws by itself when it does", async () => {
  const skip = "js/locales/en/goals.js";
  const ctx = load([skip], true); savedLang(ctx, "en");
  ctx.I._loader.load = () => Promise.reject(new Error("offline"));
  const t0 = Date.now();
  const r = await ctx.I.ready({ rounds: 2, budgetMs: 1500 });
  assert.ok(!r.ok && r.left.some((p) => p.ns === "goals" && p.lang === "en"), "it reports what is missing instead of pretending");
  assert.ok(Date.now() - t0 < 3000, "it gives up in a bounded time");
  const key = ctx.I.keysOf("ar").find((k) => k.startsWith("goals."));
  assert.ok(ctx.I.t(key) && ctx.I.t(key) !== key, "the fallback is a real sentence, not a key");
  let redraws = 0; ctx.I.onChange(() => { redraws++; });
  ctx.run(skip);                                   // the file finally arrives (the background retry)
  await new Promise((ok) => setTimeout(ok, 120));
  assert.strictEqual(redraws, 1, "the screen is redrawn once, by itself");
  assert.ok(ctx.I.isComplete("en") && ctx.I.problems().length === 0);
});

testAsync("setLang(): a dictionary that was lost while the app was in the OTHER language is fetched again when it is chosen, and the screen repaints", async () => {
  const skip = "js/locales/en/goals.js";
  const ctx = load([skip], true); savedLang(ctx, "ar");
  assert.ok((await ctx.I.ready()).ok, "in Arabic nothing is missing: the English file is not needed yet");
  const asked = []; ctx.I._loader.load = (url) => { asked.push(urlFile(url)); ctx.run(urlFile(url)); return Promise.resolve(); };
  let draws = 0; ctx.I.onChange(() => { draws++; });
  ctx.I.setLang("en");
  assert.strictEqual(draws, 1, "the immediate redraw");
  await new Promise((ok) => setTimeout(ok, 300));
  assert.deepStrictEqual(asked, [skip], "exactly the lost file was fetched");
  assert.ok(ctx.I.isComplete("en") && ctx.I.problems().length === 0);
  assert.ok(draws >= 2, "…and the screen was redrawn once the file arrived (" + draws + ")");
  assert.ok(!ctx.I.missing().some((k) => k.startsWith("en|goals.")), "missing() no longer lists what has arrived");
});

(async () => {
  for (const [name, fn] of later) {
    try { await fn(); passed++; console.log("PASS " + name); }
    catch (e) { failed++; console.log("FAIL " + name + "\n     " + String(e && e.message).split("\n").join("\n     ")); }
  }
  console.log("\n" + passed + " passed, " + failed + " failed (of " + (passed + failed) + ")");
  process.exit(failed ? 1 : 0);
})();
