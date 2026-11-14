// LANGUAGE AT START-UP, with the browser's REAL HTTP cache — the "I chose English, refreshed, and some texts went back to Arabic" bug.
//   node tests/browser/run_lang_boot.js            (RB_BUILD_REF=<git ref> tests that commit instead of the working tree — unstamped, to see the old bug come back;
//                                                   add RB_BUILD_ID=<id> to stamp it the way the workflow does, e.g. RB_BUILD_REF=e844afb RB_BUILD_ID=e844afb)
//
// Why a separate runner: the other browser suites serve the site through page.route(), and routing turns the browser's HTTP cache
// OFF, so they never see what a person sees on a refresh. This one serves the site over HTTPS from a stand-in for GitHub Pages
// (tests/browser/_pages-server.js: Cache-Control max-age=600, ETag, 304) and points Chromium at it, so the page really is at
// https://omarelzanaty1.github.io/REBUILT-Developer/ and the cache is real. Supabase is the in-page test double.
// LOCAL SIMULATION of the network and of GitHub Pages — what the real Pages sends is checked by the "verify" job of the workflow.
//
// What it proves:
//   • English chosen → 10 refreshes, deep links to every page, browser closed and reopened, empty cache, slow network,
//     back to Arabic, sign-out / sign-in, phone and desktop: every time the right lang / dir / saved choice / dictionary, the right
//     words, and never a key or a word of the other language (the person's own data aside);
//   • a dictionary file that fails (503), arrives empty, or is down for a while does NOT leave the screen half-translated:
//     it is fetched again before the first screen, or — if the network stays down — the screen draws with the fallback (never a
//     key) and fixes itself when the file comes back;
//   • a new deployment going live while the browser still holds the old one cannot mix the two: every script of a page comes from ONE build;
//   • the first screen is never drawn in the default language when another was chosen; a cold load and a cached load read the same.
const { ROOT, OUT, chromium } = require("./_env");
const fs = require("fs"), path = require("path");
const PS = require("./_pages-server");
const { stamp } = require(path.join(ROOT, "scripts/stamp-build.js"));
const FAKE = fs.readFileSync(path.join(__dirname, "fake-supabase.js"), "utf8");
const KNOWN_CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const EXE = process.env.RB_CHROME || (fs.existsSync(KNOWN_CHROME) ? KNOWN_CHROME : undefined);
const REF = process.env.RB_BUILD_REF || "";           // "" = the working tree
const STAMP = process.env.RB_BUILD_ID || (REF ? "" : "bbbbbbb");   // the build id stamped onto the site ("" = unstamped, like the commit that had the bug)

const results = [];
const log = (name, ok, detail) => { results.push({ name, ok }); console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : "")); };
const ARABIC = /[؀-ۿ]/;
const EMAIL = "omar.test@example.com";
const MINE = ["قراءة 10 صفحات", "مراجعة الخطة", "عمر", "ع", EMAIL];        // what the person wrote: never translated
const BRAND = /\b(REBUILT|XP|AI|LEVEL|Level|Google|Build yourself|streak)\b|LEVEL(?=\d)/g;
const KEYLIKE = /\b(?:common|messages|data|settings|gate|auth|dashboard|habits|tasks|goals|planner|profile|analytics|achievements|ai)\.[a-z0-9_.]{3,}\b/g;
const PAGES = ["dashboard", "habits", "tasks", "goals", "planner", "analytics", "achievements", "ai", "profile", "settings"];

const SEED = (signedIn) => ({ users: [{ id: "u-seed", email: EMAIL, password: "secret123", name: "عمر", confirmed: true }],
  sessionUserId: signedIn ? "u-seed" : null, tokens: {}, otps: {}, outbox: [], mailCount: 0, lastMail: {},
  tables: {
    profiles: [{ id: "u-seed", name: "عمر", email: EMAIL, avatar: "", settings: {}, is_onboarded: true, created_at: "2026-10-01T00:00:00Z" }],
    user_profiles: [{ user_id: "u-seed", occupation: "", occupation_custom: "", life_description: "", skills: [], hobbies: [], goals: [], challenges: "" }],
    ai_profiles: [{ user_id: "u-seed" }],
    habits: [{ id: "11111111-1111-4111-8111-111111111111", user_id: "u-seed", title: "قراءة 10 صفحات", description: "", icon: "book", xp: 15, frequency: "daily", target_days: [], time: null, created_at: "2026-10-01T00:00:00" }],
    tasks: [{ id: "22222222-2222-4222-8222-222222222222", user_id: "u-seed", title: "مراجعة الخطة", description: "", priority: "high", date: "2026-10-26", time: null, xp: 20, completed: false, completed_at: null, xp_awarded: 0, created_at: "2026-10-01T00:00:00" }],
  } });

/** What is on screen (interface only: the person's own data and other-language labels are cut out) + the state of the language engine. */
const snapshot = (page) => page.evaluate(() => {
  const h = document.documentElement, I = window.REBUILT && REBUILT.I18n;
  const out = [];
  ["#gate-root:not([hidden])", "#page-content", "#sidebar", "#topbar", "#bottom-nav"].forEach((s) => document.querySelectorAll(s).forEach((n) => {
    const c = n.cloneNode(true); c.querySelectorAll("[data-user], script, style, svg, [lang]").forEach((x) => x.remove()); out.push(c.innerText || c.textContent || "");
  }));
  let saved = null; try { saved = JSON.parse(localStorage.getItem("rebuilt_prefs_v1") || "{}").lang || null; } catch (e) { saved = "ERR"; }
  return { lang: h.getAttribute("lang"), dir: h.getAttribute("dir"), dataLang: h.getAttribute("data-lang"), saved, engine: I ? I.lang() : null,
    nEn: I ? I.keysOf("en").length : -1, nAr: I ? I.keysOf("ar").length : -1, problems: I && I.problems ? I.problems().length : -1,
    missing: I ? I.missing() : ["NO-I18N"], text: out.join("\n"), app: !document.getElementById("app").hidden, gate: !document.getElementById("gate-root").hidden };
});

/** Everything that is wrong with a snapshot, for the language L it should be in. [] = fine. */
function judge(s, L, opt) {
  const bad = []; opt = opt || {};
  if (s.lang !== L) bad.push("html lang=" + s.lang);
  if (s.dir !== (L === "en" ? "ltr" : "rtl")) bad.push("html dir=" + s.dir);
  if (s.dataLang !== L) bad.push("data-lang=" + s.dataLang);
  if (s.saved !== L) bad.push("saved=" + s.saved);
  if (s.engine !== L) bad.push("engine=" + s.engine);
  if (!opt.ignoreEn && (s.nEn !== s.nAr || s.nAr < 700)) bad.push("dictionary en=" + s.nEn + " ar=" + s.nAr);
  if (!opt.ignoreEn && s.problems > 0) bad.push("dictionary problems=" + s.problems);
  if (s.missing.length && !opt.ignoreMissing) bad.push("missing=" + s.missing.slice(0, 3).join(","));
  let t = s.text; MINE.forEach((m) => { t = t.split(m).join(""); });
  if (L === "en" && ARABIC.test(t)) bad.push("ARABIC in English: " + t.split("\n").filter((l) => ARABIC.test(l)).join(" | ").replace(/\s+/g, " ").slice(0, 110));
  if (L === "ar") { const w = t.replace(BRAND, "").split("\n").filter((l) => /[A-Za-z]{3,}/.test(l)); if (w.length) bad.push("ENGLISH in Arabic: " + w.join(" | ").replace(/\s+/g, " ").slice(0, 110)); }
  const keys = t.match(KEYLIKE); if (keys) bad.push("KEY on screen: " + keys.slice(0, 3).join(","));
  if (!s.app && !s.gate) bad.push("nothing drawn");
  return bad;
}

async function ready(page) {
  await page.waitForFunction(() => { const a = document.getElementById("app"), g = document.getElementById("gate-root");
    return (a && !a.hidden && document.querySelector("#page-content")) || (g && !g.hidden && g.children.length); }, null, { timeout: 45000 });
  await page.waitForTimeout(450);
}
const settleApp = async (page) => { await page.waitForSelector("#app:not([hidden])", { timeout: 45000 }); await page.waitForTimeout(450); };

(async () => {
  const work = path.join(OUT, "lang-boot"); fs.mkdirSync(work, { recursive: true });
  // the site as the workflow publishes it: files from site-files.txt, then the build stamp
  const build = (dir, ref, id) => { PS.assembleSite(ROOT, dir, ref); if (id) { const f = path.join(dir, "index.html"); fs.writeFileSync(f, stamp(fs.readFileSync(f, "utf8"), id).html); } return dir; };
  const ID_NEW = STAMP, ID_OLD = "aaaaaaa";
  const dirNow = build(path.join(work, "site-now"), REF || undefined, ID_NEW);
  console.log("BUILD UNDER TEST: " + (REF || "working tree") + (ID_NEW ? ", stamped ?v=" + ID_NEW : " (unstamped)"));
  const srv = await PS.start({ dir: dirNow, fake: FAKE, outDir: work });
  const browser = await chromium.launch({ executablePath: EXE, args: srv.launchArgs });

  const consoleI18n = [];   // every "REBUILT i18n" warning / error the page wrote outside the failure drills
  let drilling = false;
  async function newCtx(o) {
    o = o || {};
    const ctx = await browser.newContext({ viewport: o.mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, locale: "ar-EG", timezoneId: "Africa/Cairo", ignoreHTTPSErrors: true, isMobile: !!o.mobile, hasTouch: !!o.mobile });
    await initScripts(ctx, o);
    return ctx;
  }
  async function initScripts(ctx, o) {
    await ctx.addInitScript(([seed, prefs]) => {
      try { if (!localStorage.getItem("__fakesb")) localStorage.setItem("__fakesb", JSON.stringify(seed)); } catch (e) { /* about:blank */ }
      try { if (prefs && !localStorage.getItem("__p")) { localStorage.setItem("rebuilt_prefs_v1", JSON.stringify(prefs)); localStorage.setItem("__p", "1"); } } catch (e) { /* about:blank */ }
      // a fixed Math.random, so two loads of the same page draw the same greeting
      let a = 123456789; Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      // the first moment the app or the sign-in screen is on show: what language is it in?
      window.__first = null;
      const iv = setInterval(() => {
        const A = document.getElementById("app"), G = document.getElementById("gate-root");
        const shown = A && !A.hidden && A.children.length ? A : (G && !G.hidden && G.children.length ? G : null);
        if (shown && !window.__first) { window.__first = { lang: document.documentElement.getAttribute("lang"), text: shown.innerText || "" }; clearInterval(iv); }
      }, 5);
    }, [SEED(o.signedIn !== false), o.prefs || null]);
  }
  const watch = (page, errors) => {
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => { const t = m.text(); if (!drilling && /^REBUILT i18n/.test(t) && (m.type() === "warning" || m.type() === "error")) consoleI18n.push(m.type() + ": " + t.slice(0, 160)); });
  };
  const verdict = (name, bad, extra) => log(name, bad.length === 0, bad.length ? bad.join(" || ").slice(0, 380) : extra);
  const chooseInSettings = async (page, code) => {
    await page.evaluate(() => REBUILT.Router.navigateTo("settings")); await page.waitForSelector('[data-segmented="pref-lang"] [data-value="' + code + '"]');
    await page.click('[data-segmented="pref-lang"] [data-value="' + code + '"]'); await page.waitForTimeout(350);
  };
  const scriptBuilds = (page) => page.evaluate(() => [...new Set(performance.getEntriesByType("resource").map((e) => new URL(e.name)).filter((u) => /\/(js|css)\//.test(u.pathname)).map((u) => u.searchParams.get("v") || "(none)"))]);

  /* ---------- A. choose English, then refresh ten times ---------- */
  {
    const errors = []; const ctx = await newCtx(); const page = await ctx.newPage(); watch(page, errors);
    await page.goto(srv.url); await ready(page);
    await chooseInSettings(page, "en");
    verdict("A. English chosen in Settings: switches at once", judge(await snapshot(page), "en"));
    const bad = [];
    for (let i = 1; i <= 10; i++) { await page.reload(); await ready(page); const b = judge(await snapshot(page), "en"); if (b.length) bad.push("refresh " + i + ": " + b.join("; ")); }
    verdict("A. …then 10 refreshes in a row: every one is English, complete, no key, no Arabic", bad);
    const first = await page.evaluate(() => window.__first);
    log("A. the first screen drawn after a refresh is already English (nothing drawn in the default language first)", !!first && first.lang === "en" && !ARABIC.test(first.text.split("\n").filter((l) => !MINE.some((m) => l.includes(m))).join("\n")), first ? "lang=" + first.lang : "no first screen");
    // no service worker and no Cache Storage can serve old files or old dictionaries behind the HTTP cache
    const sw = await page.evaluate(async () => ({ workers: (await navigator.serviceWorker.getRegistrations()).length, caches: (await caches.keys()).length }));
    log("A. no service worker and no Cache Storage is in play (nothing can serve old files behind the page's back)", sw.workers === 0 && sw.caches === 0, JSON.stringify(sw));
    await ctx.close();
  }

  /* ---------- B. a link straight into every page, English ---------- */
  {
    const errors = []; const ctx = await newCtx({ prefs: { lang: "en", theme: "dark" } }); const page = await ctx.newPage(); watch(page, errors);
    const bad = [];
    for (const p of PAGES) { await page.goto("about:blank"); await page.goto(srv.url + "#" + p); await ready(page); const b = judge(await snapshot(page), "en"); if (b.length) bad.push("#" + p + ": " + b.join("; ")); }
    verdict("B. opening the site directly on each of the 10 pages (a link, not a click): English everywhere", bad);
    await ctx.close();
  }

  /* ---------- C. the browser is closed and opened again ---------- */
  {
    const dir = path.join(work, "profile-c"); fs.rmSync(dir, { recursive: true, force: true });
    const open = async () => { const c = await chromium.launchPersistentContext(dir, { executablePath: EXE, args: srv.launchArgs, ignoreHTTPSErrors: true, viewport: { width: 1280, height: 800 }, locale: "ar-EG", timezoneId: "Africa/Cairo" }); await initScripts(c, {}); return c; };
    let c = await open(); let p = c.pages()[0] || await c.newPage(); await p.goto(srv.url); await ready(p); await chooseInSettings(p, "en"); await c.close();
    const bad = [];
    for (let i = 1; i <= 3; i++) { c = await open(); p = c.pages()[0] || await c.newPage(); await p.goto(srv.url); await ready(p); const b = judge(await snapshot(p), "en"); if (b.length) bad.push("reopen " + i + ": " + b.join("; ")); await c.close(); }
    verdict("C. browser closed completely and opened again, three times: still English", bad);
  }

  /* ---------- D. empty cache, and cold = warm ---------- */
  {
    const bad = [];
    for (let i = 1; i <= 3; i++) { const ctx = await newCtx({ prefs: { lang: "en", theme: "light" } }); const page = await ctx.newPage(); watch(page, []); await page.goto(srv.url); await ready(page); const b = judge(await snapshot(page), "en"); if (b.length) bad.push("cold " + i + ": " + b.join("; ")); await ctx.close(); }
    verdict("D. empty cache (three fresh browsers with English saved): English", bad);

    for (const L of ["en", "ar"]) {
      const cold = {}, warm = {};
      const read = async (page, into) => { for (const p of PAGES) { await page.goto("about:blank"); await page.goto(srv.url + "#" + p); await ready(page); into[p] = (await snapshot(page)).text.replace(/\s+/g, " ").trim(); } };
      const c1 = await newCtx({ prefs: { lang: L, theme: "dark" } }); const p1 = await c1.newPage(); watch(p1, []); await read(p1, cold);   // first pass: everything from the network
      srv.resetHits(); await read(p1, warm);                                                                                                // second pass: from the browser's cache
      const fromNetwork = srv.siteHits().length;
      const diff = PAGES.filter((p) => cold[p] !== warm[p]);
      log("D. " + L + ": every page reads the same from the network and from the cache", diff.length === 0 && fromNetwork < 40, diff.length ? "differs on " + diff.join(",") + ": «" + (cold[diff[0]] || "").slice(0, 60) + "» vs «" + (warm[diff[0]] || "").slice(0, 60) + "»" : fromNetwork + " requests on the second pass");
      await c1.close();
    }
  }

  /* ---------- E. slow network ---------- */
  {
    const r = srv.rule({ match: (h) => h === PS.SITE_HOST || h === "cdn.jsdelivr.net", delayMs: () => Math.floor(Math.random() * 900) });
    const ctx = await newCtx({ prefs: { lang: "en", theme: "dark" } }); const page = await ctx.newPage(); watch(page, []);
    const bad = [];
    for (let i = 1; i <= 3; i++) { await page.goto("about:blank"); await page.goto(srv.url); await ready(page); const b = judge(await snapshot(page), "en"); if (b.length) bad.push("load " + i + ": " + b.join("; ")); }
    verdict("E. slow network (every file 0–0.9 s late, in random order): English each time", bad);
    // …and one dictionary file that is very slow (3 s) while the rest is fast: the first screen waits for it, it is not drawn half-translated
    srv.clearRules(); srv.rule({ match: /locales\/en\/(habits|dashboard)\.js/, delayMs: 3000 });
    const c2 = await newCtx({ prefs: { lang: "en", theme: "dark" } }); const p2 = await c2.newPage(); watch(p2, []);
    await p2.goto(srv.url); await ready(p2);
    const first = await p2.evaluate(() => window.__first);
    verdict("E. two dictionary files that take 3 s to arrive: the screen is complete when it first appears", judge(await snapshot(p2), "en").concat(first && ARABIC.test(first.text.split("\n").filter((l) => !MINE.some((m) => l.includes(m))).join("\n")) ? ["first screen had Arabic"] : []));
    srv.clearRules(); await ctx.close(); await c2.close();
  }

  /* ---------- F. back to Arabic ---------- */
  {
    const ctx = await newCtx({ prefs: { lang: "en", theme: "dark" } }); const page = await ctx.newPage(); watch(page, []);
    await page.goto(srv.url); await ready(page); await chooseInSettings(page, "ar");
    const bad = [];
    for (let i = 1; i <= 3; i++) { await page.reload(); await ready(page); const b = judge(await snapshot(page), "ar"); if (b.length) bad.push("refresh " + i + ": " + b.join("; ")); }
    verdict("F. English → back to Arabic → 3 refreshes: Arabic, RTL, complete", bad);
    await ctx.close();
  }

  /* ---------- G. sign out, sign in ---------- */
  {
    const ctx = await newCtx({ prefs: { lang: "en", theme: "dark" } }); const page = await ctx.newPage(); watch(page, []);
    await page.goto(srv.url); await ready(page);
    await page.evaluate(() => REBUILT.Router.navigateTo("settings")); await page.waitForSelector("#sign-out-btn"); await page.click("#sign-out-btn"); await page.waitForSelector(".landing", { timeout: 12000 });
    const bad = [];
    let b = judge(await snapshot(page), "en"); if (b.length) bad.push("signed out: " + b.join("; "));
    await page.reload(); await ready(page); b = judge(await snapshot(page), "en"); if (b.length) bad.push("signed out + refresh: " + b.join("; "));
    await page.click('[data-go="signin"]'); await page.waitForSelector("#auth-form"); await page.fill("#f-email", EMAIL); await page.fill("#f-password", "secret123"); await page.click("#auth-submit");
    await settleApp(page); b = judge(await snapshot(page), "en"); if (b.length) bad.push("signed in: " + b.join("; "));
    await page.reload(); await ready(page); b = judge(await snapshot(page), "en"); if (b.length) bad.push("signed in + refresh: " + b.join("; "));
    verdict("G. sign out → refresh → sign in → refresh: English the whole way", bad);
    await ctx.close();
  }

  /* ---------- H. phone ---------- */
  {
    const ctx = await newCtx({ prefs: { lang: "en", theme: "dark" }, mobile: true }); const page = await ctx.newPage(); watch(page, []);
    await page.goto(srv.url); await ready(page);
    const bad = [];
    for (let i = 1; i <= 3; i++) { await page.reload(); await ready(page); const b = judge(await snapshot(page), "en"); if (b.length) bad.push("refresh " + i + ": " + b.join("; ")); }
    verdict("H. phone (390 px): 3 refreshes, English", bad);
    await ctx.close();
  }

  /* ---------- I. a dictionary file that fails: the bug itself ---------- */
  drilling = true;
  for (const f of ["en/habits", "en/common", "en/dashboard", "ar/habits"]) {
    srv.clearRules(); srv.rule({ match: new RegExp("locales/" + f + "\\.js$"), status: 503, times: 1 });
    const ctx = await newCtx({ prefs: { lang: "en", theme: "dark" } }); const page = await ctx.newPage(); watch(page, []);
    await page.goto(srv.url); await ready(page);
    const first = await page.evaluate(() => window.__first);
    await page.evaluate(() => REBUILT.Router.navigateTo("habits")); await page.waitForTimeout(450);
    const bad = judge(await snapshot(page), "en");
    if (first && ARABIC.test(first.text.split("\n").filter((l) => !MINE.some((m) => l.includes(m))).join("\n"))) bad.push("the FIRST screen had Arabic in it");
    verdict("I. js/locales/" + f + ".js fails once (503): fetched again before the first screen, English complete", bad);
    await ctx.close(); srv.clearRules();
  }
  {
    // arrives empty (200, but the body is cut off): the same, because what counts is whether the dictionary registered
    srv.clearRules();
    srv.rule({ match: /locales\/en\/tasks\.js$/, status: 200, body: "/* cut off */", times: 1 });   // 200, but not a dictionary
    const ctx = await newCtx({ prefs: { lang: "en", theme: "dark" } }); const page = await ctx.newPage(); watch(page, []);
    await page.goto(srv.url); await ready(page); await page.evaluate(() => REBUILT.Router.navigateTo("tasks")); await page.waitForTimeout(450);
    verdict("I. js/locales/en/tasks.js arrives broken (200 but not a dictionary): fetched again, English complete", judge(await snapshot(page), "en"));
    await ctx.close(); srv.clearRules();
  }
  {
    // the network stays down for this file: no crash, no key, Arabic only for what is missing — and it repairs itself when the file is back
    srv.clearRules(); srv.rule({ match: /locales\/en\/goals\.js$/, status: 503 });
    const errors = []; const ctx = await newCtx({ prefs: { lang: "en", theme: "dark" } }); const page = await ctx.newPage(); watch(page, errors);
    await page.goto(srv.url); await ready(page); await page.evaluate(() => REBUILT.Router.navigateTo("goals")); await page.waitForTimeout(500);
    const s = await snapshot(page);
    const t = s.text; const keys = t.match(KEYLIKE);
    log("I. a dictionary file that stays down: the app still opens, in English, with no key on screen and no script error", s.app && !keys && s.engine === "en" && errors.length === 0, keys ? "KEY on screen: " + keys.join(",") : errors.join(";"));
    srv.clearRules();   // the network is back
    let healed = false; const t0 = Date.now();
    while (Date.now() - t0 < 16000) { await page.waitForTimeout(500); const b = judge(await snapshot(page), "en"); if (!b.length) { healed = true; break; } }
    log("I. …and when the file is reachable again the screen repairs itself, without a refresh", healed, healed ? "after " + Math.round((Date.now() - t0) / 100) / 10 + " s" : judge(await snapshot(page), "en").join("; "));
    await ctx.close(); srv.clearRules();
  }
  {
    // the English file was lost while the app was in ARABIC (only the language in use is checked at start-up);
    // choosing English afterwards must not show a half-English screen for good
    srv.clearRules(); srv.rule({ match: /locales\/en\/habits\.js$/, status: 503, times: 1 });
    const ctx = await newCtx({ prefs: { lang: "ar", theme: "dark" } }); const page = await ctx.newPage(); watch(page, []);
    await page.goto(srv.url); await ready(page);
    verdict("I. English file lost while in Arabic: the Arabic screen is untouched", judge(await snapshot(page), "ar", { ignoreEn: true }));
    await chooseInSettings(page, "en"); await page.evaluate(() => REBUILT.Router.navigateTo("habits"));
    let good = false; const t0 = Date.now(); let last = [];
    while (Date.now() - t0 < 8000) { await page.waitForTimeout(300); last = judge(await snapshot(page), "en"); if (!last.length) { good = true; break; } }
    log("I. …then English is chosen: the lost file is fetched and the screen ends complete, with no refresh", good, good ? "after " + Math.round((Date.now() - t0) / 100) / 10 + " s" : last.join("; "));
    await ctx.close(); srv.clearRules();
  }
  drilling = false;

  /* ---------- K. a new deployment while the old one is cached ---------- */
  {
    const dirA = build(path.join(work, "site-A"), "6323b01", ID_NEW ? ID_OLD : null);                       // the deployment before (the commit already published)
    const dirB = build(path.join(work, "site-B"), REF || undefined, ID_NEW);   // the one going live now
    srv.clearRules(); srv.setBuild(dirA, "A");
    const errors = []; const ctx = await newCtx({ prefs: { lang: "en", theme: "dark" } }); const page = await ctx.newPage(); watch(page, errors);
    await page.goto(srv.url); await ready(page);
    const a = await scriptBuilds(page);
    srv.setBuild(dirB, "B"); srv.resetHits();                                              // GitHub Pages: the new deployment is live
    await page.reload(); await ready(page);                                                // …and the person refreshes within the 10 minutes the old files are still fresh
    const after = await scriptBuilds(page);
    verdict("K. new deployment live, old one still in the cache, refresh: English, complete", judge(await snapshot(page), "en").concat(errors));
    log("K. …and every script / dictionary / stylesheet of the page comes from ONE build (never old + new mixed)", after.length === 1 && after[0] !== "(none)", "builds seen: " + JSON.stringify(after) + " (before the deployment: " + JSON.stringify(a) + ")");
    // a person who has the OLD page cached and just navigates (no refresh): the old page with its own old files, complete and consistent
    srv.resetHits(); await page.goto("about:blank"); await page.goto(srv.url); await ready(page);
    const again = await scriptBuilds(page);
    verdict("K. …a later visit still works and stays on one build", judge(await snapshot(page), "en"), JSON.stringify(again));
    await ctx.close(); srv.setBuild(dirNow, "now");
  }

  /* ---------- M. the console stays quiet in normal use ---------- */
  log("M. nothing was written to the console by the language system in all the normal runs (only the failure drills may warn)", consoleI18n.length === 0, consoleI18n.length ? consoleI18n.slice(0, 3).join(" | ") : "quiet");

  await browser.close(); await srv.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log("\n" + (results.length - failed) + "/" + results.length + " passed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("RUNNER FAILED", e); process.exit(2); });
