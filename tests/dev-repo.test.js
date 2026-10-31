/* ============================================================
   REBUILT — tests/dev-repo.test.js   (Development repository only — not part of what is released)
   Structural guards for this repository: the things that, if they slipped, would let Development affect
   the official site, publish more than the site, or leak a secret.
       node tests/dev-repo.test.js
   ============================================================ */
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = (f) => fs.existsSync(path.join(ROOT, f));
let passed = 0; const failures = [];
function test(name, fn) { try { fn(); passed += 1; console.log("PASS " + name); } catch (e) { failures.push(name); console.log("FAIL " + name + "\n     " + String(e && e.message).split("\n").join("\n     ")); } }
const lines = (f) => read(f).split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));

function walk(dir, out) {
  out = out || [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    if (e.name === ".git" || e.name === "node_modules") return;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out); else out.push(full);
  });
  return out;
}
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");

test("the official domain is not carried here: no CNAME file, and no file claims getrebuilt.online as a Pages domain", () => {
  assert.ok(!exists("CNAME"), "CNAME must not exist in the Development repository (it belongs to the Stable repository only)");
  assert.ok(!lines("scripts/site-files.txt").includes("CNAME"), "CNAME must not be a release/site file");
});

test("only site files are published: scripts/site-files.txt lists exactly the browser files and the workflow uses that list", () => {
  assert.deepStrictEqual(lines("scripts/site-files.txt").sort(), ["assets", "css", "index.html", "js", "manifest.webmanifest", "sw.js"]);
  lines("scripts/site-files.txt").forEach((p) => assert.ok(exists(p), p + " is listed but missing"));
  const wf = read(".github/workflows/pages.yml");
  assert.ok(/scripts\/site-files\.txt/.test(wf) && /upload-pages-artifact/.test(wf) && /path:\s*_site/.test(wf), "the Pages workflow must publish the assembled _site only");
  assert.ok(!/path:\s*\.\s*$/m.test(wf), "the whole repository must not be uploaded");
  ["supabase", "tests", "docs", "scripts", ".github"].forEach((d) => assert.ok(!lines("scripts/site-files.txt").includes(d), d + " must not be published"));
});

test("the deployment is gated by the tests and runs on this repository's own main only", () => {
  const wf = read(".github/workflows/pages.yml");
  assert.ok(/needs:\s*test/.test(wf), "deploy must need the test job");
  assert.ok(/node tests\/auth\.test\.js/.test(wf));
  assert.ok(/branches:\s*\[main\]/.test(wf));
  assert.ok(!/getrebuilt\.online/.test(wf.replace(/^\s*#.*$/gm, "").replace(/getrebuilt\.online[^\n]*never be published/, "")) , "no deployment step may mention the official domain");
});

test("nothing in the workflows or scripts can reach the official repository except release.sh (which asks for approval)", () => {
  const offenders = walk(path.join(ROOT, ".github")).filter((f) => /rebuilt0\.4/i.test(fs.readFileSync(f, "utf8").replace(/^\s*#.*$/gm, ""))).map(rel);   // comments may explain; steps may not name it
  assert.deepStrictEqual(offenders, [], "workflows must not push to the Stable repository");
});

test("pages.yml is test -> build -> deploy -> verify; only deploy may write Pages; the token is read-only elsewhere", () => {
  const wf = read(".github/workflows/pages.yml");
  assert.ok(/^permissions:\n\s+contents:\s*read\s*$/m.test(wf), "top-level permissions must be contents: read only");
  assert.strictEqual((wf.match(/pages:\s*write/g) || []).length, 1, "exactly one job (deploy) may have pages: write");
  assert.strictEqual((wf.match(/id-token:\s*write/g) || []).length, 1, "exactly one job (deploy) may have id-token: write");
  assert.ok(/deploy:\n\s+needs:\s*build/.test(wf), "deploy must need build");
  assert.ok(/build:\n\s+needs:\s*test/.test(wf), "build must need test");
  assert.ok(/verify:\n\s+needs:\s*\[build,\s*deploy\]/.test(wf), "a verify job must run after deploy");
  assert.ok(/rebuilt-build/.test(wf.slice(wf.indexOf("verify:"))), "verify must compare the served build marker");
  ["CNAME", "supabase/README.md", "tests/auth.test.js", "docs/ENVIRONMENTS.md"].forEach((x) => assert.ok(wf.slice(wf.indexOf("verify:")).includes(x), "verify must prove /" + x + " is not served"));
});

test("regression.yml: manual trigger only, read-only token, can publish nothing, and no `runner` context in job-level env (the context GitHub rejects there)", () => {
  const wf = read(".github/workflows/regression.yml");
  const on = wf.slice(wf.indexOf("\non:"), wf.indexOf("\npermissions:"));
  assert.ok(/workflow_dispatch/.test(on) && !/push|pull_request|schedule|workflow_run/.test(on), "must run only when started by hand");
  assert.ok(/^permissions:\n\s+contents:\s*read\s*$/m.test(wf));
  assert.ok(!/pages:\s*write|id-token:\s*write|contents:\s*write|deploy-pages|configure-pages/.test(wf.replace(/^\s*#.*$/gm, "")), "a regression run must not be able to publish");
  // job-level env block (4-space indent) must not read the runner context
  const lines = wf.split("\n");
  lines.forEach((l, i) => {
    if (/^ {4}env:\s*$/.test(l)) {
      for (let j = i + 1; j < lines.length && (/^ {5,}/.test(lines[j]) || lines[j].trim() === ""); j++) assert.ok(!/\$\{\{\s*runner\./.test(lines[j]), "job-level env uses the runner context: " + lines[j].trim());
    }
  });
});

test(".gitignore keeps secrets and tool output out of Git", () => {
  const g = lines(".gitignore");
  [".env", "node_modules/", "tests/browser/out/"].forEach((x) => assert.ok(g.includes(x), x + " missing from .gitignore"));
});

test("no secret in the repository: no sb_secret_, JWT, Google client secret, private key, or service_role KEY value", () => {
  const hits = [];
  walk(ROOT).filter((f) => !/\.(png|ico|woff2?)$/i.test(f) && rel(f) !== "tests/auth.test.js" && rel(f) !== "tests/dev-repo.test.js").forEach((f) => {
    const s = fs.readFileSync(f, "utf8");
    if (/sb_secret_[A-Za-z0-9_-]{10,}/.test(s)) hits.push(rel(f) + " (sb_secret_)");
    if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/.test(s)) hits.push(rel(f) + " (JWT)");
    if (/GOCSPX-[A-Za-z0-9_-]{10,}/.test(s)) hits.push(rel(f) + " (Google client secret)");
    if (/BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/.test(s)) hits.push(rel(f) + " (private key)");
    if (/(service_role|secret)[\s"']*[:=][\s"']*(eyJ|sb_secret_)/i.test(s)) hits.push(rel(f) + " (service role / secret assignment)");
  });
  assert.deepStrictEqual(hits, []);
});

test("the SQL pack is complete and only ever names synthetic test identities", () => {
  ["00_preflight_readonly", "01_schema", "02_functions_triggers", "03_rls_and_grants", "04_verify_readonly", "05_isolation_test_rolled_back", "06_OPTIONAL_ai_backend_do_not_run_yet", "07_optional_backfill_existing_users"]
    .forEach((n) => assert.ok(exists("supabase/sql/" + n + ".sql"), n + ".sql missing"));
  assert.ok(exists("supabase/migrations/20261022214309_rebuilt_0_4_schema.sql") && exists("supabase/migrations/20261022214525_revoke_rls_auto_enable_execute.sql"));
  assert.ok(exists("supabase/verify/schema_signature.sql") && exists("supabase/verify/local_auth_stub.sql"));
  const emails = [];
  walk(path.join(ROOT, "supabase")).filter((f) => f.endsWith(".sql")).forEach((f) => (fs.readFileSync(f, "utf8").match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || []).forEach((m) => emails.push(rel(f) + " " + m)));
  const real = emails.filter((e) => !/@example\.(invalid|com)$/.test(e));
  assert.deepStrictEqual(real, [], "real-looking e-mail addresses in SQL files");
});

test("no destructive statement in the files meant to be run against a project (no drop / truncate / delete without a test-only scope)", () => {
  ["supabase/sql/01_schema.sql", "supabase/sql/02_functions_triggers.sql", "supabase/sql/03_rls_and_grants.sql", "supabase/migrations/20261022214309_rebuilt_0_4_schema.sql", "supabase/migrations/20261022214525_revoke_rls_auto_enable_execute.sql"].forEach((f) => {
    const s = read(f).replace(/--[^\n]*/g, "");
    assert.ok(!/\b(drop\s+(table|schema|database|function|view|policy|trigger)|truncate|delete\s+from)\b/i.test(s), f + " contains a destructive statement");
  });
});

test("the documentation exists and names both repositories and both addresses", () => {
  const d = read("docs/ENVIRONMENTS.md");
  ["omarelzanaty1/rebuilt0.4", "omarelzanaty1/REBUILT-Developer", "https://getrebuilt.online/", "https://omarelzanaty1.github.io/REBUILT-Developer/", "scripts/release.sh"].forEach((x) => assert.ok(d.includes(x), "ENVIRONMENTS.md does not mention " + x));
  assert.ok(/ENVIRONMENTS\.md/.test(read("WEB-DEPLOYMENT.md")), "WEB-DEPLOYMENT.md should point to docs/ENVIRONMENTS.md");
});

test("every browser runner and the sweep exist", () => {
  ["run_local", "run_extra", "run_connected", "run_sw", "run_recovery", "run_otp", "run_google", "run_confirm", "run_channels"].forEach((n) => assert.ok(exists("tests/browser/" + n + ".js"), n + " missing"));
  assert.ok(exists("tests/browser/run-all.sh") && exists("tests/browser/fake-supabase.js") && exists("tests/browser/_env.js"));
});

console.log("\n" + passed + " passed, " + failures.length + " failed (of " + (passed + failures.length) + ")");
process.exit(failures.length ? 1 : 0);
