/* tests/stamp-build.test.js — the build stamp that keeps one deployment's files together (scripts/stamp-build.js). No browser needed. */
"use strict";
const fs = require("fs"), path = require("path"), os = require("os"), cp = require("child_process"), assert = require("assert");
const ROOT = path.resolve(__dirname, "..");
const { stamp } = require(path.join(ROOT, "scripts/stamp-build.js"));
let passed = 0, failed = 0;
const test = (name, fn) => { try { fn(); passed++; console.log("PASS " + name); } catch (e) { failed++; console.log("FAIL " + name + "\n     " + String(e.message).split("\n").join("\n     ")); } };
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const ID = "abc1234";

test("every local script and stylesheet URL of index.html gets ?v=<build>; CDN, fonts and images do not", () => {
  const r = stamp(html, ID);
  const locals = [...html.matchAll(/<(?:script|link)\b[^>]*?\s(?:src|href)="((?:js|css)\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(locals.length > 40, "expected the ~30 dictionaries + app scripts + styles, found " + locals.length);
  assert.strictEqual(r.stamped, locals.length);
  locals.forEach((u) => assert.ok(r.html.includes('"' + u + "?v=" + ID + '"'), u + " was not stamped"));
  assert.ok(!/(?:src|href)="(?:js|css)\/[^"?]+"/.test(r.html), "an unstamped local URL is left");
  assert.ok(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[\d.]+[^"]*"/.test(r.html) && !/supabase-js[^"]*\?v=/.test(r.html), "the CDN URL must stay exactly as it is");
  assert.ok(!/fonts\.googleapis\.com[^"]*\?v=/.test(r.html), "fonts untouched");
});

test("the build marker gets the build id appended, once (running it twice changes nothing more)", () => {
  const a = stamp(html, ID), b = stamp(a.html, ID);
  assert.ok(new RegExp('<meta name="rebuilt-build" content="[^"]+\\+' + ID + '"').test(a.html));
  assert.strictEqual(b.html, a.html, "idempotent");
  assert.strictEqual(b.stamped, 0, "already-stamped URLs are not counted again");
});

test("nothing but the stamp changes: removing ?v=<id> and +<id> gives back the original file", () => {
  const r = stamp(html, ID);
  assert.strictEqual(r.html.split("?v=" + ID).join("").split("+" + ID).join(""), html);
});

test("a bad build id is refused (it ends up in URLs)", () => {
  ["", "a b", "x\"><script>", "../x", "a"].forEach((bad) => assert.throws(() => stamp(html, bad), /build id/, JSON.stringify(bad)));
});

test("the command: stamps a copy of index.html in a site folder, and refuses a folder with nothing to stamp", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stamp-"));
  fs.writeFileSync(path.join(dir, "index.html"), html);
  const out = cp.execFileSync("node", [path.join(ROOT, "scripts/stamp-build.js"), dir, ID]).toString();
  assert.ok(/stamped \d+ URLs with \?v=abc1234/.test(out), out);
  assert.ok(/js\/app\.js\?v=abc1234/.test(fs.readFileSync(path.join(dir, "index.html"), "utf8")));
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "stamp-"));
  fs.writeFileSync(path.join(empty, "index.html"), "<html><body>no scripts</body></html>");
  const r = cp.spawnSync("node", [path.join(ROOT, "scripts/stamp-build.js"), empty, ID]);
  assert.notStrictEqual(r.status, 0, "an index.html with nothing to stamp must fail the build, not pass silently");
  assert.strictEqual(fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), html, "the source index.html is never modified");
});

console.log("\n" + passed + " passed, " + failed + " failed (of " + (passed + failed) + ")");
process.exit(failed ? 1 : 0);
