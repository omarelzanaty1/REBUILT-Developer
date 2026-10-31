/* ============================================================
   REBUILT — tests/release.test.js   (Development repository only — not part of what is released)
   Runs scripts/release.sh for real, against throw-away LOCAL git repositories that stand in for Stable and
   Development. Nothing here can reach GitHub. It proves the promise made in docs/ENVIRONMENTS.md:
     - promote moves exactly the approved commit's release files onto Stable, keeps Stable's CNAME and its
       other files, preserves Stable's history, and records where the release came from;
     - it refuses: a commit not on Development, an unchanged build marker, failing tests, a Stable
       without the official CNAME, a missing confirmation;
     - rollback adds one new commit with an earlier release's files (history kept) and refuses to drop the CNAME;
     - nothing is ever forced.
       node tests/release.test.js
   ============================================================ */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { execFileSync, spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "rebuilt-release-test-"));
const ENV = Object.assign({}, process.env, {
  GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.invalid",
  GIT_CONFIG_GLOBAL: path.join(TMP, "gitconfig"), GIT_TERMINAL_PROMPT: "0",
});
fs.writeFileSync(ENV.GIT_CONFIG_GLOBAL, "[user]\n\tname = Test\n\temail = test@example.invalid\n[init]\n\tdefaultBranch = main\n");

const git = (cwd, ...args) => execFileSync("git", args, { cwd, env: ENV, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const write = (dir, rel, text) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
const html = (marker) => '<!doctype html><meta name="rebuilt-build" content="' + marker + '" /><title>x</title>\n';
const PASSING_TESTS = "process.exit(require('fs').existsSync(__dirname + '/../FAIL') ? 1 : 0);\n";

/** A bare repository seeded with the given files; returns its path. */
function bareWith(name, commits) {
  const bare = path.join(TMP, name + ".git");
  git(TMP, "init", "--bare", "-q", bare);
  const seed = path.join(TMP, name + "-seed");
  git(TMP, "clone", "-q", bare, seed);
  commits.forEach((files) => { Object.keys(files).forEach((f) => (files[f] === null ? fs.rmSync(path.join(seed, f), { force: true }) : write(seed, f, files[f]))); git(seed, "add", "-A"); git(seed, "commit", "-q", "-m", "stable commit"); });
  git(seed, "push", "-q", "origin", "HEAD:refs/heads/main");
  return bare;
}
const STABLE_BASE = {
  CNAME: "getrebuilt.online\n", "index.html": html("0.4.5 confirm-email 2026-10-26"), "js/a.js": "A1\n", "js/old.js": "OLD\n", "css/x.css": "X1\n", "assets/i.svg": "<svg/>\n",
  "manifest.webmanifest": "{}\n", "sw.js": "//sw\n", "WEB-DEPLOYMENT.md": "official doc\n", "tests/auth.test.js": PASSING_TESTS,
};

/** A Development working copy (with its bare "origin") that holds the real release script. */
function devRepo() {
  const bare = path.join(TMP, "dev.git");
  git(TMP, "init", "--bare", "-q", bare);
  const dir = path.join(TMP, "dev");
  git(TMP, "clone", "-q", bare, dir);
  const base = Object.assign({}, STABLE_BASE); delete base.CNAME; delete base["WEB-DEPLOYMENT.md"];
  Object.keys(base).forEach((f) => write(dir, f, base[f]));
  write(dir, "scripts/release.sh", fs.readFileSync(path.join(ROOT, "scripts/release.sh"), "utf8"));
  write(dir, "scripts/site-files.txt", fs.readFileSync(path.join(ROOT, "scripts/site-files.txt"), "utf8"));
  fs.chmodSync(path.join(dir, "scripts/release.sh"), 0o755);
  git(dir, "add", "-A"); git(dir, "commit", "-q", "-m", "c1 initial");
  const shas = { c1: git(dir, "rev-parse", "HEAD") };
  const step = (name, marker, files) => {
    write(dir, "index.html", html(marker));
    Object.keys(files).forEach((f) => (files[f] === null ? fs.rmSync(path.join(dir, f), { force: true }) : write(dir, f, files[f])));
    git(dir, "add", "-A"); git(dir, "commit", "-q", "-m", name); shas[name.split(" ")[0]] = git(dir, "rev-parse", "HEAD");
  };
  step("c2 new login screen", "0.4.6 login 2026-10-29", { "js/a.js": "A2\n", "js/new.js": "NEW\n", "js/old.js": null });
  step("c3 style tweak", "0.4.7 style 2026-10-30", { "css/x.css": "X2\n" });
  step("c4 broken experiment", "0.4.8 broken 2026-10-31", { FAIL: "1\n" });
  git(dir, "push", "-q", "origin", "HEAD:refs/heads/main");
  git(dir, "fetch", "-q", "origin");
  return { dir, bare, shas };
}

function rel(dev, stableBare, args, input) {
  const r = spawnSync("bash", [path.join(dev.dir, "scripts/release.sh"), ...args], {
    cwd: dev.dir, encoding: "utf8", input: input || "",
    env: Object.assign({}, ENV, { REBUILT_STABLE_URL: stableBare, REBUILT_DEV_REMOTE: "origin", REBUILT_DEV_BRANCH: "main" }),
  });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}
const clone = (bare, name) => { const d = path.join(TMP, "check-" + name + "-" + Math.random().toString(36).slice(2, 7)); git(TMP, "clone", "-q", bare, d); return d; };
const read = (d, f) => (fs.existsSync(path.join(d, f)) ? fs.readFileSync(path.join(d, f), "utf8") : null);
const tip = (bare) => git(bare, "rev-parse", "refs/heads/main");

let passed = 0; const failures = [];
function test(name, fn) { try { fn(); passed += 1; console.log("PASS " + name); } catch (e) { failures.push(name); console.log("FAIL " + name + "\n     " + String(e && e.message).split("\n").join("\n     ")); } }

const stable = bareWith("stable", [STABLE_BASE]);
const dev = devRepo();
const stableInitial = tip(stable);
const devTipBefore = git(dev.bare, "rev-parse", "refs/heads/main");

test("script text: nothing can force a push or rewrite history", () => {
  const s = fs.readFileSync(path.join(ROOT, "scripts/release.sh"), "utf8").replace(/^\s*#.*$/gm, "");
  // (`git worktree remove --force` is how a throw-away checkout is cleaned up; it is not a push)
  assert.ok(!/push[^\n]*(--force|--force-with-lease|\s-f\b|\+refs\/|\s\+[A-Za-z$"])|reset\s+--hard|push[^\n]*--delete|branch\s+-D|update-ref|filter-branch/.test(s), "found a forcing / destructive git command");
  assert.ok(/commit-tree/.test(s) && /CNAME/.test(s));
});

test("a promote without the typed confirmation publishes nothing", () => {
  const r = rel(dev, stable, ["promote", dev.shas.c2], "no\n");
  assert.notStrictEqual(r.code, 0, r.out);
  assert.strictEqual(tip(stable), stableInitial);
});

test("promote of the approved commit: its release files land on Stable, the rest of Stable is kept, history is kept", () => {
  const r = rel(dev, stable, ["promote", dev.shas.c2, "--yes"]);
  assert.strictEqual(r.code, 0, r.out);
  const c = clone(stable, "after-c2");
  assert.strictEqual(read(c, "js/a.js"), "A2\n");
  assert.strictEqual(read(c, "js/new.js"), "NEW\n");
  assert.strictEqual(read(c, "js/old.js"), null, "a file deleted in Development must be deleted on Stable");
  assert.strictEqual(read(c, "css/x.css"), "X1\n", "c3's change must NOT be on Stable yet");
  assert.strictEqual(read(c, "CNAME"), "getrebuilt.online\n", "the official domain file must be untouched");
  assert.strictEqual(read(c, "WEB-DEPLOYMENT.md"), "official doc\n", "Stable's own documents are not overwritten");
  assert.ok(/0\.4\.6 login/.test(read(c, "index.html")));
  assert.strictEqual(git(c, "rev-list", "--count", "HEAD"), "2", "one new commit on top of the old history");
  assert.strictEqual(git(c, "rev-parse", "HEAD~1"), stableInitial);
  const msg = git(c, "log", "-1", "--format=%B");
  assert.ok(msg.includes("Release-From: omarelzanaty1/REBUILT-Developer@" + dev.shas.c2), msg);
  assert.ok(msg.includes("Build-Marker: 0.4.6 login 2026-10-29"), msg);
  assert.strictEqual(git(dev.bare, "rev-parse", "refs/heads/main"), devTipBefore, "Development must be untouched by a release");
});

test("promoting the same commit again is refused", () => {
  const before = tip(stable);
  const r = rel(dev, stable, ["promote", dev.shas.c2, "--yes"]);
  assert.notStrictEqual(r.code, 0, r.out);
  assert.strictEqual(tip(stable), before);
});

test("a commit whose tests fail is refused and Stable is unchanged", () => {
  const before = tip(stable);
  const r = rel(dev, stable, ["promote", dev.shas.c4, "--yes"]);
  assert.notStrictEqual(r.code, 0, r.out);
  assert.ok(/tests failed/i.test(r.out), r.out);
  assert.strictEqual(tip(stable), before);
});

test("a commit that exists only locally (never pushed to Development) is refused", () => {
  const before = tip(stable);
  write(dev.dir, "index.html", html("0.4.9 local-only 2026-11-01")); git(dev.dir, "add", "-A"); git(dev.dir, "commit", "-q", "-m", "c9 local only");
  const sha = git(dev.dir, "rev-parse", "HEAD");
  const r = rel(dev, stable, ["promote", sha, "--yes"]);
  assert.notStrictEqual(r.code, 0, r.out);
  assert.ok(/not on origin\/main/.test(r.out), r.out);
  assert.strictEqual(tip(stable), before);
  git(dev.dir, "reset", "-q", "--hard", dev.shas.c4);
});

test("the next approved commit goes out alone; the release records what it contains", () => {
  const r = rel(dev, stable, ["promote", dev.shas.c3, "--yes"]);
  assert.strictEqual(r.code, 0, r.out);
  const c = clone(stable, "after-c3");
  assert.strictEqual(read(c, "css/x.css"), "X2\n");
  assert.strictEqual(read(c, "FAIL"), null, "c4's experiment must not travel");
  assert.ok(/0\.4\.7 style/.test(read(c, "index.html")));
  const msg = git(c, "log", "-1", "--format=%B");
  assert.ok(/Development commits in this release:/.test(msg) && /c3 style tweak/.test(msg), msg);
});

test("status shows both sides", () => {
  const r = rel(dev, stable, ["status"]);
  assert.strictEqual(r.code, 0, r.out);
  assert.ok(/Development .*\[0\.4\.8 broken/.test(r.out) && /Stable .*\[0\.4\.7 style/.test(r.out), r.out);
});

test("rollback: ONE new commit with an earlier release's files; history kept; CNAME kept", () => {
  const before = tip(stable);
  const r = rel(dev, stable, ["rollback", stableInitial, "--yes"]);
  assert.strictEqual(r.code, 0, r.out);
  const c = clone(stable, "after-rollback");
  assert.strictEqual(git(c, "rev-parse", "HEAD^{tree}"), git(c, "rev-parse", stableInitial + "^{tree}"), "files must be exactly the earlier release's");
  assert.strictEqual(git(c, "rev-parse", "HEAD~1"), before, "the rollback is added on top, nothing rewritten");
  assert.ok(git(c, "merge-base", "--is-ancestor", before, "HEAD") === "" );
  assert.strictEqual(read(c, "CNAME"), "getrebuilt.online\n");
  assert.ok(/0\.4\.5 confirm-email/.test(read(c, "index.html")));
});

test("rollback to a commit that is not in Stable's history is refused", () => {
  const before = tip(stable);
  const r = rel(dev, stable, ["rollback", dev.shas.c2, "--yes"]);
  assert.notStrictEqual(r.code, 0, r.out);
  assert.strictEqual(tip(stable), before);
});

test("a Stable without the official CNAME is never published to (promote and rollback refuse)", () => {
  const noCname = Object.assign({}, STABLE_BASE); delete noCname.CNAME;
  const s2 = bareWith("stable-nocname", [noCname]);
  const before = tip(s2);
  const p = rel(dev, s2, ["promote", dev.shas.c2, "--yes"]);
  assert.notStrictEqual(p.code, 0, p.out); assert.ok(/CNAME/.test(p.out), p.out);
  assert.strictEqual(tip(s2), before);
  // history in which the CNAME arrived later: going back to before it would drop the domain
  const first = Object.assign({}, noCname);
  const s3 = bareWith("stable-late-cname", [first, { CNAME: "getrebuilt.online\n", "js/a.js": "A9\n" }]);
  const firstSha = git(s3, "rev-list", "--max-parents=0", "refs/heads/main");
  const r = rel(dev, s3, ["rollback", firstSha, "--yes"]);
  assert.notStrictEqual(r.code, 0, r.out); assert.ok(/CNAME/.test(r.out), r.out);
});

test("a Stable whose CNAME names another domain is refused too", () => {
  const wrong = Object.assign({}, STABLE_BASE, { CNAME: "example.org\n" });
  const s4 = bareWith("stable-wrongdomain", [wrong]);
  const r = rel(dev, s4, ["promote", dev.shas.c2, "--yes"]);
  assert.notStrictEqual(r.code, 0, r.out);
});

fs.rmSync(TMP, { recursive: true, force: true });
console.log("\n" + passed + " passed, " + failures.length + " failed (of " + (passed + failures.length) + ")");
process.exit(failures.length ? 1 : 0);
