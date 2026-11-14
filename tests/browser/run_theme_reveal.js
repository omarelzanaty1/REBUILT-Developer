// THEME CHANGE — the circular reveal (Dark ⇄ Light ⇄ System), in a real Chromium.
//   node tests/browser/run_theme_reveal.js
//
// The feature (js/theme.js + css/base.css): tapping a theme button grows a circle of the NEW theme from the centre of that
// button until it covers the screen (~700 ms) — one central code path, so every screen behaves the same.
// What it proves:
//   • WHERE and HOW: the circle starts at the real centre of the tapped button, is a clean circle that only grows, lasts 700 ms,
//     and ends with the whole screen in the new theme (pixel-checked on frozen frames: old screen vs. new screen vs. the frame between);
//   • FROM EVERY SCREEN: welcome, sign-in, sign-up, password recovery, the onboarding steps and Settings — desktop and phone (touch);
//   • System mode: choosing "System" when the colours would not change does not move; the device switching light/dark by itself is
//     applied at once, with no motion, however often it happens;
//   • a refresh right after (even in the middle of the circle) keeps the choice and paints it before the first frame;
//   • fast repeated taps never overlap two reveals, never get stuck, always end on the last choice, and the page keeps answering taps;
//   • browsers without view transitions get a plain colour fade, and prefers-reduced-motion / the in-app "reduce motion" get no motion at all;
//   • language and theme do not fight (a language switch in the middle of a reveal, and the other way round);
//   • the person's data and the (test-double) account are untouched by a theme change, and nothing is written to the console.
// The welcome / sign-up / onboarding / Settings runs are LOCAL mode over http://127.0.0.1; the sign-in, recovery and signed-in Settings
// runs are the connected build at the Developer address through the Pages stand-in (tests/browser/_pages-server.js) with the in-page
// Supabase double — a LOCAL SIMULATION, nothing here talks to the real Dev project.
// Pixel checks need Python with Pillow (the frame comparison); screenshots go to OUT (never committed).
const { ROOT, OUT, chromium } = require("./_env");
const http = require("http"), fs = require("fs"), path = require("path"), cp = require("child_process");
const PS = require("./_pages-server");
const FAKE = fs.readFileSync(path.join(__dirname, "fake-supabase.js"), "utf8");
const KNOWN_CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const EXE = process.env.RB_CHROME || (fs.existsSync(KNOWN_CHROME) ? KNOWN_CHROME : undefined);

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const local = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});

const results = [];
const log = (name, ok, detail) => { results.push({ name, ok }); console.log((ok ? "PASS " : "FAIL ") + name + (detail !== undefined && detail !== "" ? " — " + detail : "")); };
const SHOTS = path.join(OUT, "theme-reveal"); fs.mkdirSync(SHOTS, { recursive: true });
const EMAIL = "omar.test@example.com";
const KEYLIKE = /\b(?:common|messages|data|settings|gate|auth|dashboard|habits|tasks|goals|planner|profile|analytics|achievements|ai)\.[a-z0-9_.]{3,}\b/g;
const PAGES = ["dashboard", "habits", "tasks", "goals", "planner", "analytics", "achievements", "ai", "profile", "settings"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lum = (css) => { const m = css.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };

const SEED = (signedIn) => ({ users: [{ id: "u-seed", email: EMAIL, password: "secret123", name: "عمر", confirmed: true }],
  sessionUserId: signedIn ? "u-seed" : null, tokens: {}, otps: {}, outbox: [], mailCount: 0, lastMail: {},
  tables: {
    profiles: [{ id: "u-seed", name: "عمر", email: EMAIL, avatar: "", settings: {}, is_onboarded: true, created_at: "2026-10-01T00:00:00Z" }],
    user_profiles: [{ user_id: "u-seed", occupation: "", occupation_custom: "", life_description: "", skills: [], hobbies: [], goals: [], challenges: "" }],
    ai_profiles: [{ user_id: "u-seed" }],
    habits: [{ id: "11111111-1111-4111-8111-111111111111", user_id: "u-seed", title: "قراءة 10 صفحات", description: "", icon: "book", xp: 15, frequency: "daily", target_days: [], time: null, created_at: "2026-10-01T00:00:00" }],
    tasks: [{ id: "22222222-2222-4222-8222-222222222222", user_id: "u-seed", title: "مراجعة الخطة", description: "", priority: "high", date: "2026-10-26", time: null, xp: 20, completed: false, completed_at: null, xp_awarded: 0, created_at: "2026-10-01T00:00:00" }],
  } });

/* ---------- frame comparison (Pillow): is the frame between "old" and "new" a clean circle around the button? ---------- */
const GEOM_PY = `
import sys, json
from PIL import Image
A, B, M = [Image.open(p).convert("RGB") for p in sys.argv[1:4]]
x0, y0 = float(sys.argv[4]), float(sys.argv[5])
W, H = A.size
pa, pb, pm = A.load(), B.load(), M.load()
new, old = [], []
for y in range(0, H, 4):
  for x in range(0, W, 4):
    a, b, m = pa[x, y], pb[x, y], pm[x, y]
    if sum(abs(a[i] - b[i]) for i in range(3)) < 90: continue
    da = sum(abs(a[i] - m[i]) for i in range(3)); db = sum(abs(b[i] - m[i]) for i in range(3))
    d = ((x - x0) ** 2 + (y - y0) ** 2) ** 0.5
    (new if db < da else old).append(d)
new.sort(); old.sort()
pct = lambda v, p: v[min(len(v) - 1, max(0, int(len(v) * p)))] if v else None
print(json.dumps({"nNew": len(new), "nOld": len(old), "newMax": pct(new, 0.98), "oldMin": pct(old, 0.02)}))
`;
const geom = (A, B, M, x, y) => JSON.parse(cp.execFileSync("python3", ["-I", "-c", GEOM_PY, A, B, M, String(x), String(y)]).toString());

/* ---------- in the page ---------- */
const NEW_ANIMS = () => document.getAnimations().filter((a) => a.effect && a.effect.pseudoElement === "::view-transition-new(root)");
const attrTheme = (page) => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
const bgLum = async (page) => lum(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
const idle = (page, ms) => page.waitForFunction(() => !REBUILT.Theme.isAnimating() && !document.documentElement.classList.contains("theme-reveal") && !document.documentElement.classList.contains("theme-fade"), null, { timeout: ms || 4000 });
const centre = (page, sel) => page.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
const press = (page, sel, mobile) => (mobile ? page.tap(sel) : page.click(sel));
const settleDraw = (page, ms) => page.waitForTimeout(ms || 250);

(async () => {
  await new Promise((r) => local.listen(0, r));
  const LOCAL = "http://127.0.0.1:" + local.address().port + "/";
  const work = path.join(OUT, "theme-reveal-site");
  const srv = await PS.start({ dir: PS.assembleSite(ROOT, work), fake: FAKE, outDir: OUT });
  const browserLocal = await chromium.launch({ executablePath: EXE });
  const browserPages = await chromium.launch({ executablePath: EXE, args: srv.launchArgs });

  const consoleNoise = [];
  /** A page: `where` = "local" | "pages"; o = { mobile, colorScheme, reducedMotion, prefs, signedIn, noVT }. */
  async function open(where, o) {
    o = o || {};
    const browser = where === "local" ? browserLocal : browserPages;
    const ctx = await browser.newContext({ viewport: o.mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, locale: "ar-EG", timezoneId: "Africa/Cairo",
      colorScheme: o.colorScheme || "dark", reducedMotion: o.reducedMotion || "no-preference", ignoreHTTPSErrors: true, isMobile: !!o.mobile, hasTouch: !!o.mobile, deviceScaleFactor: 1 });
    await ctx.addInitScript(([seed, prefs, noVT]) => {
      try { if (seed && !localStorage.getItem("__fakesb")) localStorage.setItem("__fakesb", JSON.stringify(seed)); } catch (e) { /* about:blank */ }
      try { if (prefs && !localStorage.getItem("__p")) { localStorage.setItem("rebuilt_prefs_v1", JSON.stringify(prefs)); localStorage.setItem("__p", "1"); } } catch (e) { /* about:blank */ }
      if (noVT) { try { delete Document.prototype.startViewTransition; } catch (e) { /* keep */ } }
      // the theme of the page the moment <body> exists (before any script of the app has run)
      window.__firstPaint = null;
      new MutationObserver(() => { if (!window.__firstPaint && document.body) window.__firstPaint = document.documentElement.getAttribute("data-theme"); }).observe(document, { childList: true, subtree: true });
    }, [where === "pages" ? SEED(o.signedIn !== false) : null, o.prefs || null, !!o.noVT]);
    const page = await ctx.newPage(); const errors = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => {
      const t = m.text();
      if (m.type() === "error" && !/Failed to load resource|ERR_|net::/.test(t)) errors.push("console: " + t);
      if (/theme/i.test(t) && (m.type() === "warning" || m.type() === "error") && !/Failed to load resource|ERR_|net::/.test(t)) consoleNoise.push(t.slice(0, 160));
    });
    if (where === "local") await page.route("**/*", (route) => (route.request().url().startsWith(LOCAL) ? route.continue() : route.abort()));
    return { ctx, page, errors };
  }
  const goLocal = async (page) => { await page.goto(LOCAL, { waitUntil: "load" }); await page.waitForSelector(".landing"); };
  const goPages = async (page, ready) => { await page.goto(srv.url, { waitUntil: "load" }); await page.waitForSelector(ready || ".landing", { timeout: 20000 }); await page.waitForTimeout(400); };
  const watchClasses = (page) => page.evaluate(() => {
    if (window.__seenObs) window.__seenObs.disconnect();   // one observer at a time, or every change would be counted twice
    window.__seen = { reveal: false, fade: false, themeAttr: 0 };
    const obs = new MutationObserver((ms) => { ms.forEach((m) => { if (m.attributeName === "class") { const c = document.documentElement.className; if (/theme-reveal/.test(c)) window.__seen.reveal = true; if (/theme-fade/.test(c)) window.__seen.fade = true; } if (m.attributeName === "data-theme") window.__seen.themeAttr++; }); })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    window.__seenObs = obs;
  });
  const seen = (page) => page.evaluate(() => window.__seen);
  const bodyHasKeys = (page) => page.evaluate((re) => { const t = (document.body.innerText || ""); const m = t.match(new RegExp(re, "g")); return m ? m.slice(0, 3) : []; }, KEYLIKE.source);

  /** One theme change from `sel`, frozen and measured. Returns { ok-flags… } and logs. */
  async function measured(page, sel, expect, tag, o) {
    o = o || {};
    const times = o.times || [0, 350];
    await page.waitForTimeout(o.settle === undefined ? 650 : o.settle);   // the screen's own entrance animation must be over: "old" has to be a still picture
    await page.$eval(sel, (el) => el.scrollIntoView({ block: "center", behavior: "instant" })); await page.waitForTimeout(150);   // in view BEFORE the circle's centre is read
    const y0 = await page.evaluate(() => Math.round(window.scrollY));
    const box = await centre(page, sel);
    const A = path.join(SHOTS, tag + "-A.png"), B = path.join(SHOTS, tag + "-B.png");
    await page.screenshot({ path: A });
    await watchClasses(page);
    await press(page, sel, o.mobile);
    const started = await page.waitForFunction(() => document.getAnimations().some((a) => a.effect && a.effect.pseudoElement === "::view-transition-new(root)"), null, { timeout: 4000 }).then(() => true, () => false);
    if (!started) { log(tag + ": the circle starts", false, "no reveal animation appeared"); return null; }
    const meta = await page.evaluate(() => {
      const a = document.getAnimations().find((x) => x.effect && x.effect.pseudoElement === "::view-transition-new(root)");
      const kf = a.effect.getKeyframes(), t = a.effect.getTiming();
      return { dur: t.duration, from: kf[0].clipPath, to: kf[1].clipPath, cls: document.documentElement.className, busy: REBUILT.Theme.isAnimating() };
    });
    const mf = /circle\(([\d.]+)px at ([\d.-]+)px ([\d.-]+)px\)/.exec(meta.from), mt = /circle\(([\d.]+)px at ([\d.-]+)px ([\d.-]+)px\)/.exec(meta.to);
    const cx = mf ? +mf[2] : NaN, cy = mf ? +mf[3] : NaN, R = mt ? +mt[1] : 0;
    log(tag + ": the circle starts at the real centre of the tapped button (±1 px)", Math.abs(cx - box.x) <= 1 && Math.abs(cy - box.y) <= 1 && +mf[1] === 0, "button (" + box.x.toFixed(1) + "," + box.y.toFixed(1) + ") → circle (" + cx + "," + cy + ")");
    const vw = await page.evaluate(() => [innerWidth, innerHeight]);
    const far = Math.hypot(Math.max(cx, vw[0] - cx), Math.max(cy, vw[1] - cy));
    log(tag + ": it lasts 700 ms and grows to the farthest corner", meta.dur === 700 && R >= far && R <= far + 6 && meta.busy && /theme-reveal/.test(meta.cls), "duration " + meta.dur + ", end radius " + R.toFixed(0) + " vs corner " + far.toFixed(0));
    // frozen frames
    const Rs = [], frames = [];
    for (const ms of times) {
      await page.evaluate((t) => { document.getAnimations().filter((a) => a.effect && a.effect.pseudoElement === "::view-transition-new(root)").forEach((a) => { a.pause(); a.currentTime = t; }); }, ms);
      await page.waitForTimeout(60);
      const M = path.join(SHOTS, tag + "-M" + ms + ".png"); await page.screenshot({ path: M }); frames.push([ms, M]);
    }
    await page.evaluate(() => { document.getAnimations().filter((a) => a.effect && a.effect.pseudoElement === "::view-transition-new(root)").forEach((a) => { try { a.finish(); } catch (e) { a.play(); } }); });
    await idle(page, 4000); await page.waitForTimeout(120);
    await page.screenshot({ path: B });
    const g = frames.map(([ms, M]) => [ms, geom(A, B, M, box.x, box.y)]);
    // A screen can have an animation of its own running (a few text pixels differ between any two frames): under 1.5 % of the
    // comparable pixels counts as "none", so only a real circle decides.
    const frac = (r) => (r.nNew + r.nOld ? r.nNew / (r.nNew + r.nOld) : 0);
    const est = (r) => (frac(r) < 0.015 ? 0 : frac(r) > 0.985 ? 99999 : (r.newMax + r.oldMin) / 2);
    const clean = g.every(([ms, r]) => frac(r) < 0.015 || frac(r) > 0.985 || r.newMax <= r.oldMin + 16);
    const radii = g.map(([ms, r]) => Math.round(est(r)));
    const grows = radii.every((v, i) => i === 0 || v > radii[i - 1]);
    log(tag + ": frames between old and new are a clean circle around the button, growing", clean && grows && frac(g[0][1]) < 0.015, "radius at " + times.join("/") + " ms = " + radii.join("/") + " px");
    const s = await seen(page);
    const end = await page.evaluate(() => ({ th: document.documentElement.getAttribute("data-theme"), cls: document.documentElement.className, anims: document.getAnimations().filter((a) => a.effect && a.effect.pseudoElement).length, pref: document.documentElement.getAttribute("data-theme-pref") }));
    const L = await bgLum(page);
    log(tag + ": ends clean — theme " + expect + ", no class left, no animation left, whole screen in the new theme", end.th === expect && !/theme-(reveal|fade)/.test(end.cls) && end.anims === 0 && (expect === "light" ? L > 0.8 : L < 0.05) && s.themeAttr === 1, JSON.stringify(end) + " bgLum " + L.toFixed(3) + " attr changes " + s.themeAttr);
    const y1 = await page.evaluate(() => Math.round(window.scrollY));
    return { box, B, y0, y1 };
  }

  /* ============================================================
     A. Welcome screen (local mode, desktop): dark → light → dark
     ============================================================ */
  {
    const { page, errors, ctx } = await open("local");
    await goLocal(page);
    const sel = ".landing__bar [data-pref-theme]";
    log("starts dark, nothing animating", (await attrTheme(page)) === "dark" && !(await page.evaluate(() => REBUILT.Theme.isAnimating())));
    await measured(page, sel, "light", "A-welcome-dark-to-light", { times: [0, 150, 350, 600] });
    const logo = await page.$eval(".landing__logo", (e) => e.getAttribute("src"));
    log("A: the logo was redrawn with the light-theme variant", /-light\.svg$/.test(logo), logo);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("rebuilt_prefs_v1") || "{}").theme);
    log("A: the choice is saved (light)", saved === "light");
    await measured(page, sel, "dark", "A-welcome-light-to-dark", { times: [0, 150, 350, 600] });
    const logo2 = await page.$eval(".landing__logo", (e) => e.getAttribute("src"));
    log("A: back to dark — the logo is the dark-theme variant", !/-light\.svg$/.test(logo2), logo2);
    log("A: no errors, nothing on screen that looks like a key", errors.length === 0 && (await bodyHasKeys(page)).length === 0, errors.join(" | "));
    await ctx.close();
  }

  /* ============================================================
     B. Every sign-in / sign-up / onboarding screen and Settings (local mode, desktop)
     ============================================================ */
  {
    const { page, errors, ctx } = await open("local");
    await goLocal(page);
    let n = 0;
    const toggle = async (tag, o) => {
      const cur = await attrTheme(page);
      const sel = "[data-pref-theme]";
      return measured(page, sel, cur === "dark" ? "light" : "dark", "B" + String(++n).padStart(2, "0") + "-" + tag, o);
    };
    await page.click('[data-go="signin"]'); await page.waitForSelector("#auth-form"); await settleDraw(page);
    await toggle("signin");
    await page.click('[data-authmode="signup"]'); await page.waitForSelector("#f-confirmPassword"); await settleDraw(page);
    await toggle("signup");
    await page.fill("#f-name", "عمر"); await page.fill("#f-email", EMAIL); await page.fill("#f-password", "secret12"); await page.fill("#f-confirmPassword", "secret12");
    await toggle("signup-filled");
    const kept = await page.evaluate(() => ({ n: document.getElementById("f-name").value, e: document.getElementById("f-email").value }));
    log("B: what was typed in the form survives a theme change", kept.n === "عمر" && kept.e === EMAIL, JSON.stringify(kept));
    await page.click("#auth-submit"); await page.waitForSelector(".wizard-head", { timeout: 8000 }); await settleDraw(page);
    await toggle("onboarding-1-occupation");
    await page.click("[data-occ]"); await page.click('[data-go="next"]'); await page.waitForSelector("#life-desc"); await settleDraw(page);
    await page.fill("#life-desc", "Student");
    await toggle("onboarding-2-about-you");
    const kept2 = await page.inputValue("#life-desc").catch(() => "");
    log("B: the onboarding text survives a theme change", kept2 === "Student", kept2);
    await page.click('[data-go="next"]'); await page.waitForSelector("#tag-picker"); const c1 = await page.$$("#tag-picker .chip"); if (c1[0]) await c1[0].click();
    await toggle("onboarding-3-skills");
    await page.click('[data-go="next"]'); await page.waitForSelector("#tag-picker"); const c2 = await page.$$("#tag-picker .chip"); if (c2[0]) await c2[0].click();
    await page.click('[data-go="next"]'); await page.waitForSelector("#tag-picker"); const c3 = await page.$$("#tag-picker .chip"); if (c3[0]) await c3[0].click();
    await page.click('[data-go="next"]'); await page.waitForSelector("#challenges"); await page.fill("#challenges", "x");
    await toggle("onboarding-5-challenges");
    await page.click('[data-go="next"]'); await page.waitForSelector("#gate-finish"); await settleDraw(page);
    await toggle("onboarding-summary");
    await page.click("#gate-finish"); await page.waitForSelector("#app:not([hidden]) .hero", { timeout: 8000 }); await settleDraw(page, 400);
    // Settings, from the segmented control
    await page.evaluate(() => REBUILT.Router.navigateTo("settings")); await page.waitForSelector('[data-segmented="pref-theme"]'); await settleDraw(page);
    const stateBefore = await page.evaluate(() => localStorage.getItem("rebuilt_state_v1") || "");
    const cur = await attrTheme(page), target = cur === "dark" ? "light" : "dark";
    await measured(page, '[data-segmented="pref-theme"] [data-value="' + target + '"]', target, "B-settings-" + cur + "-to-" + target, { times: [0, 150, 350, 600] });
    const sel2 = await page.$eval('[data-segmented="pref-theme"] .is-selected', (e) => e.dataset.value);
    log("B: Settings shows the new choice as selected after the redraw", sel2 === target, sel2);
    await measured(page, '[data-segmented="pref-theme"] [data-value="' + cur + '"]', cur, "B-settings-" + target + "-to-" + cur, { times: [0, 350] });
    await page.click('[data-segmented="pref-theme"] [data-value="light"]'); await idle(page); await page.click('[data-segmented="pref-theme"] [data-value="dark"]'); await idle(page);
    const stateAfter = await page.evaluate(() => localStorage.getItem("rebuilt_state_v1") || "");
    log("B: the person's saved data is byte-for-byte the same after all those theme changes", stateBefore.length > 50 && stateBefore === stateAfter, stateBefore.length + " bytes");
    log("B: no errors on any of these screens", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  /* ============================================================
     C. Sign-in and password-recovery screens (connected build at the Developer address)
     ============================================================ */
  {
    const { page, errors, ctx } = await open("pages", { signedIn: false });
    await goPages(page);
    await page.click('[data-go="signin"]'); await page.waitForSelector("#auth-form"); await settleDraw(page);
    await measured(page, "[data-pref-theme]", "light", "C-signin-connected");
    await page.click('[data-go="forgot"]'); await page.waitForSelector("#forgot-form"); await settleDraw(page);
    await measured(page, "[data-pref-theme]", "dark", "C-recovery-forgot");
    await page.fill("#forgot-form input[type=email], #forgot-form input", EMAIL).catch(() => {});
    const typed = await page.$eval("#forgot-form input", (e) => e.value).catch(() => "");
    await measured(page, "[data-pref-theme]", "light", "C-recovery-forgot-filled");
    const typed2 = await page.$eval("#forgot-form input", (e) => e.value).catch(() => "");
    log("C: the e-mail typed on the recovery screen survives the theme change", typed === typed2, typed2);
    log("C: no errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  /* ============================================================
     D. Phone (390 px, touch): welcome, sign-in, and Settings
     ============================================================ */
  {
    const { page, errors, ctx } = await open("local", { mobile: true });
    await goLocal(page);
    await measured(page, ".landing__bar [data-pref-theme]", "light", "D-phone-welcome", { mobile: true, times: [0, 200, 400] });
    await page.tap('[data-go="signin"]'); await page.waitForSelector("#auth-form"); await settleDraw(page);
    await measured(page, "[data-pref-theme]", "dark", "D-phone-signin", { mobile: true });
    await ctx.close();
    const s = await open("pages", { mobile: true, signedIn: true, prefs: { theme: "dark" } });
    await goPages(s.page, "#app:not([hidden]) #page-content");
    await s.page.evaluate(() => REBUILT.Router.navigateTo("settings")); await s.page.waitForSelector('[data-segmented="pref-theme"]'); await settleDraw(s.page);
    const mm = await measured(s.page, '[data-segmented="pref-theme"] [data-value="light"]', "light", "D-phone-settings", { mobile: true, times: [0, 200, 400] });
    log("D: on the phone the scroll position in Settings is kept through the change", mm && mm.y0 > 50 && Math.abs(mm.y1 - mm.y0) <= 2, mm ? mm.y0 + " → " + mm.y1 : "");
    log("D: no errors on the phone", errors.length === 0 && s.errors.length === 0, errors.concat(s.errors).join(" | "));
    await s.ctx.close();
  }

  /* ============================================================
     E. System mode
     ============================================================ */
  {
    // E1: "System" on a dark device while already dark — the colours would not change, so nothing moves
    let s = await open("pages", { signedIn: true, prefs: { theme: "dark" }, colorScheme: "dark" });
    await goPages(s.page, "#app:not([hidden]) #page-content");
    await s.page.evaluate(() => REBUILT.Router.navigateTo("settings")); await s.page.waitForSelector('[data-segmented="pref-theme"]');
    await watchClasses(s.page);
    await s.page.click('[data-segmented="pref-theme"] [data-value="system"]'); await s.page.waitForTimeout(900);
    let sn = await seen(s.page);
    let at = await s.page.evaluate(() => ({ th: document.documentElement.getAttribute("data-theme"), pref: document.documentElement.getAttribute("data-theme-pref"), saved: JSON.parse(localStorage.getItem("rebuilt_prefs_v1") || "{}").theme }));
    log("E: choosing System when the device is dark and the app is dark does not animate at all", !sn.reveal && !sn.fade && at.th === "dark" && at.pref === "system" && at.saved === "system", JSON.stringify(at));
    // E2: the device changes by itself, many times — applied at once, never a circle
    const flips = [];
    for (const scheme of ["light", "dark", "light", "dark", "light"]) {
      await s.page.emulateMedia({ colorScheme: scheme });
      const ok = await s.page.waitForFunction((w) => document.documentElement.getAttribute("data-theme") === w, scheme, { timeout: 1500 }).then(() => true, () => false);
      await s.page.waitForTimeout(80);
      flips.push(ok);
    }
    sn = await seen(s.page);
    const anims = await s.page.evaluate(() => document.getAnimations().filter((a) => a.effect && a.effect.pseudoElement).length);
    log("E: the device switching light/dark five times by itself — followed every time, at once", flips.every(Boolean), JSON.stringify(flips));
    log("E: …and with no circle, no fade, no animation of any kind", !sn.reveal && !sn.fade && anims === 0, "reveal " + sn.reveal + ", fade " + sn.fade + ", animations " + anims);
    // E3: refresh in System mode paints the device's theme before the first frame
    await s.page.emulateMedia({ colorScheme: "light" }); await s.page.waitForTimeout(150);
    await s.page.reload({ waitUntil: "load" }); await s.page.waitForSelector("#app:not([hidden]) #page-content", { timeout: 20000 });
    const fp = await s.page.evaluate(() => ({ first: window.__firstPaint, pref: document.documentElement.getAttribute("data-theme-pref"), th: document.documentElement.getAttribute("data-theme") }));
    log("E: refresh in System mode keeps System and paints the device's theme (light) before the first frame", fp.first === "light" && fp.pref === "system" && fp.th === "light", JSON.stringify(fp));
    // E4: choosing System from an explicit theme that differs from the device DOES reveal, from the tapped segment
    await s.ctx.close();
    s = await open("pages", { signedIn: true, prefs: { theme: "light" }, colorScheme: "dark" });
    await goPages(s.page, "#app:not([hidden]) #page-content");
    await s.page.evaluate(() => REBUILT.Router.navigateTo("settings")); await s.page.waitForSelector('[data-segmented="pref-theme"]'); await settleDraw(s.page);
    await measured(s.page, '[data-segmented="pref-theme"] [data-value="system"]', "dark", "E-system-from-light-on-dark-device", { times: [0, 350] });
    const pref = await s.page.evaluate(() => document.documentElement.getAttribute("data-theme-pref"));
    log("E: …and the preference is now System", pref === "system", pref);
    log("E: no errors", s.errors.length === 0, s.errors.join(" | "));
    await s.ctx.close();
  }

  /* ============================================================
     F. Refresh right after a change — even in the middle of the circle
     ============================================================ */
  {
    const { page, errors, ctx } = await open("local");
    await goLocal(page);
    await page.click(".landing__bar [data-pref-theme]");
    await page.waitForFunction(() => REBUILT.Theme.isAnimating(), null, { timeout: 3000 });
    await page.waitForTimeout(150);
    await page.reload({ waitUntil: "load" }); await page.waitForSelector(".landing");
    let r = await page.evaluate(() => ({ first: window.__firstPaint, th: document.documentElement.getAttribute("data-theme"), saved: JSON.parse(localStorage.getItem("rebuilt_prefs_v1") || "{}").theme, busy: REBUILT.Theme.isAnimating(), cls: document.documentElement.className }));
    log("F: refresh in the MIDDLE of the circle: the saved choice (light) is painted before the first frame, nothing stuck", r.first === "light" && r.th === "light" && r.saved === "light" && !r.busy && !/theme-/.test(r.cls), JSON.stringify(r));
    await page.waitForTimeout(500);
    await page.click(".landing__bar [data-pref-theme]"); await idle(page);
    for (let i = 0; i < 3; i++) { await page.reload({ waitUntil: "load" }); await page.waitForSelector(".landing"); }
    r = await page.evaluate(() => ({ first: window.__firstPaint, th: document.documentElement.getAttribute("data-theme"), logo: document.querySelector(".landing__logo").getAttribute("src") }));
    log("F: dark again, then three refreshes in a row: dark every time, dark logo, no flash", r.first === "dark" && r.th === "dark" && !/-light\.svg$/.test(r.logo), JSON.stringify(r));
    log("F: no errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
    // …and signed in (connected): Settings choice survives a refresh and the sign-out / sign-in round trip
    const s = await open("pages", { signedIn: true, prefs: { theme: "dark" } });
    await goPages(s.page, "#app:not([hidden]) #page-content");
    await s.page.evaluate(() => REBUILT.Router.navigateTo("settings")); await s.page.waitForSelector('[data-segmented="pref-theme"]');
    await s.page.click('[data-segmented="pref-theme"] [data-value="light"]'); await idle(s.page);
    await s.page.reload({ waitUntil: "load" }); await s.page.waitForSelector("#app:not([hidden]) #page-content", { timeout: 20000 });
    r = await s.page.evaluate(() => ({ first: window.__firstPaint, th: document.documentElement.getAttribute("data-theme") }));
    log("F: signed in, Settings → Light, refresh: light before the first frame", r.first === "light" && r.th === "light", JSON.stringify(r));
    await s.ctx.close();
  }

  /* ============================================================
     G. Fast repeated taps: one reveal at a time, always the last choice, the page keeps answering
     ============================================================ */
  {
    const { page, errors, ctx } = await open("local");
    await goLocal(page);
    const sel = ".landing__bar [data-pref-theme]";
    const burst = async (count, gap, label, minTaps) => {
      const c = await centre(page, sel);
      await page.evaluate(() => { if (window.__tapL) document.removeEventListener("click", window.__tapL, true); window.__tap = { n: 0, last: null };
        window.__tapL = (e) => { const b = e.target && e.target.closest && e.target.closest("[data-pref-theme]"); if (b) { window.__tap.n++; window.__tap.last = b.dataset.prefTheme; } };
        document.addEventListener("click", window.__tapL, true); });
      await page.evaluate(() => {
        window.__f = { maxAnims: 0, frames: 0, gaps: [], last: performance.now(), stop: false };
        const tick = () => { const n = document.getAnimations().filter((a) => a.effect && a.effect.pseudoElement === "::view-transition-new(root)").length; const now = performance.now(); window.__f.maxAnims = Math.max(window.__f.maxAnims, n); window.__f.gaps.push(now - window.__f.last); window.__f.last = now; window.__f.frames++; if (!window.__f.stop) requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      for (let i = 0; i < count; i++) { await page.mouse.click(c.x, c.y); await sleep(gap); }
      await idle(page, 6000); await page.waitForTimeout(150);
      const f = await page.evaluate(() => { window.__f.stop = true; return { maxAnims: window.__f.maxAnims, frames: window.__f.frames, maxGap: Math.round(Math.max(...window.__f.gaps)) }; });
      const tap = await page.evaluate(() => window.__tap);
      const expect = tap.last;
      const end = await page.evaluate(() => ({ th: document.documentElement.getAttribute("data-theme"), pref: document.documentElement.getAttribute("data-theme-pref"), cls: document.documentElement.className, anims: document.getAnimations().filter((a) => a.effect && a.effect.pseudoElement).length, busy: REBUILT.Theme.isAnimating(), saved: JSON.parse(localStorage.getItem("rebuilt_prefs_v1") || "{}").theme }));
      // While a view transition runs, Chromium sends pointer events to the page root, not to the buttons: taps during the ~700 ms are
      // ignored (never queued, never half-applied). What matters: the first tap works, nothing breaks, and the taps after it end work.
      log("G: " + label + " — taps during a circle are ignored cleanly (" + tap.n + " of " + count + " arrived, at least " + minTaps + " expected)", tap.n >= minTaps, "");
      log("G: " + label + " — never two reveals at once", f.maxAnims <= 1, "most circles at once: " + f.maxAnims);
      log("G: " + label + " — ends on what the last tap asked for (" + expect + "), saved, nothing stuck", end.th === expect && end.pref === expect && end.saved === expect && !/theme-/.test(end.cls) && end.anims === 0 && !end.busy, JSON.stringify(end));
      log("G: " + label + " — no frozen frame (longest frame gap " + f.maxGap + " ms over " + f.frames + " frames)", f.maxGap < 450, "");
    };
    await burst(10, 60, "10 real mouse taps 60 ms apart", 1);
    await burst(7, 90, "7 real mouse taps 90 ms apart", 1);
    await burst(5, 400, "5 taps 400 ms apart (each lands in the middle of the previous circle)", 3);
    // how long is the page deaf after one tap? (the view transition's lifetime) — poll what a tap at the button's position would hit
    const cc = await centre(page, sel);
    await page.mouse.click(cc.x, cc.y);
    const deaf = await page.evaluate(([x, y]) => new Promise((ok) => { const t0 = performance.now(); const tick = () => { const e = document.elementFromPoint(x, y); if (e && e.closest && e.closest("[data-pref-theme]") && !REBUILT.Theme.isAnimating()) return ok(Math.round(performance.now() - t0)); if (performance.now() - t0 > 3000) return ok(-1); setTimeout(tick, 15); }; tick(); }), [cc.x, cc.y]);
    log("G: the page answers taps again as soon as the circle ends (" + deaf + " ms after the tap; the circle itself is 700 ms)", deaf >= 600 && deaf <= 1400, "");
    await watchClasses(page);
    await page.mouse.click(cc.x, cc.y);
    await page.waitForTimeout(100);
    log("G: after all that, one more tap still makes a normal reveal", (await seen(page)).reveal && (await page.evaluate(() => REBUILT.Theme.isAnimating())));
    await idle(page);
    log("G: no errors, nothing in the console from the theme code", errors.length === 0 && consoleNoise.length === 0, errors.concat(consoleNoise).join(" | "));
    await ctx.close();
    // the Settings control: a quick walk over all three choices, many times
    const s = await open("pages", { signedIn: true, prefs: { theme: "dark" } });
    await goPages(s.page, "#app:not([hidden]) #page-content");
    await s.page.evaluate(() => REBUILT.Router.navigateTo("settings")); await s.page.waitForSelector('[data-segmented="pref-theme"]');
    const order = ["light", "system", "dark", "light", "dark", "system", "light", "dark", "light", "system", "dark"];
    for (const v of order) { await s.page.click('[data-segmented="pref-theme"] [data-value="' + v + '"]'); await sleep(110); }
    await idle(s.page, 6000);
    const e = await s.page.evaluate(() => ({ pref: document.documentElement.getAttribute("data-theme-pref"), th: document.documentElement.getAttribute("data-theme"), sel: document.querySelector('[data-segmented="pref-theme"] .is-selected').dataset.value, saved: JSON.parse(localStorage.getItem("rebuilt_prefs_v1") || "{}").theme, cls: document.documentElement.className, anims: document.getAnimations().filter((a) => a.effect && a.effect.pseudoElement).length }));
    log("G: Settings: 11 quick picks across light / dark / system end on the last one, shown selected, saved, nothing stuck", e.pref === "dark" && e.th === "dark" && e.sel === "dark" && e.saved === "dark" && !/theme-/.test(e.cls) && e.anims === 0, JSON.stringify(e));
    log("G: Settings: no errors", s.errors.length === 0, s.errors.join(" | "));
    await s.ctx.close();
  }

  /* ============================================================
     H. Smoothness of one normal change (real time) and a single, one-way switch of colours
     ============================================================ */
  {
    const { page, errors, ctx } = await open("local");
    await goLocal(page);
    await page.evaluate(() => {
      window.__t = { gaps: [], last: 0, on: false, bgs: [] };
      const tick = () => { if (window.__t.on) { const now = performance.now(); if (window.__t.last) window.__t.gaps.push(now - window.__t.last); window.__t.last = now; window.__t.bgs.push(getComputedStyle(document.body).backgroundColor); } requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await page.evaluate(() => { window.__t.on = true; });
    await page.click(".landing__bar [data-pref-theme]");
    await idle(page); await page.waitForTimeout(100);
    const t = await page.evaluate(() => { window.__t.on = false; const g = window.__t.gaps.slice().sort((a, b) => a - b); const flips = window.__t.bgs.filter((b, i, a) => i && b !== a[i - 1]).length; return { n: g.length, avg: g.reduce((a, b) => a + b, 0) / g.length, p95: g[Math.floor(g.length * 0.95)], max: g[g.length - 1], flips }; });
    log("H: one change in real time — the frames keep coming (no gap over 300 ms)", t.max < 300 && t.n > 25, "frames " + t.n + ", avg " + t.avg.toFixed(1) + " ms, p95 " + Math.round(t.p95) + " ms, max " + Math.round(t.max) + " ms (headless Chromium, software rendering)");
    log("H: the page colour switches exactly once during the change (no flash back and forth)", t.flips === 1, "switches: " + t.flips);
    log("H: no errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  /* ============================================================
     I. Fallback (browser without view transitions) and reduced motion
     ============================================================ */
  {
    const { page, errors, ctx } = await open("local", { noVT: true });
    await goLocal(page);
    log("I: this browser really has no startViewTransition (the fallback is what runs)", (await page.evaluate(() => typeof document.startViewTransition)) === "undefined");
    await watchClasses(page);
    await page.click(".landing__bar [data-pref-theme]");
    const mid = await page.evaluate(() => ({ th: document.documentElement.getAttribute("data-theme"), cls: document.documentElement.className, dur: getComputedStyle(document.body).transitionDuration, busy: REBUILT.Theme.isAnimating() }));
    log("I: fallback — the theme changes at once and the colours cross-fade (class theme-fade, ~0.42 s transitions)", mid.th === "light" && /theme-fade/.test(mid.cls) && /0\.42s/.test(mid.dur) && mid.busy, JSON.stringify(mid));
    await idle(page, 3000); await page.waitForTimeout(100);
    const end = await page.evaluate(() => ({ cls: document.documentElement.className, logo: document.querySelector(".landing__logo").getAttribute("src"), anims: document.getAnimations().filter((a) => a.effect && a.effect.pseudoElement).length }));
    log("I: fallback — ends clean and the page is redrawn with the light logo", !/theme-/.test(end.cls) && /-light\.svg$/.test(end.logo) && end.anims === 0 && !(await seen(page)).reveal, JSON.stringify(end));
    const c = await centre(page, ".landing__bar [data-pref-theme]");
    await page.evaluate(() => { window.__tap = { n: 0, last: null }; document.addEventListener("click", (e) => { const b = e.target && e.target.closest && e.target.closest("[data-pref-theme]"); if (b) { window.__tap.n++; window.__tap.last = b.dataset.prefTheme; } }, true); });
    for (let i = 0; i < 7; i++) { await page.mouse.click(c.x, c.y); await sleep(70); }
    await idle(page, 4000);
    const tap = await page.evaluate(() => window.__tap);
    const fin = await page.evaluate(() => ({ th: document.documentElement.getAttribute("data-theme"), cls: document.documentElement.className, saved: JSON.parse(localStorage.getItem("rebuilt_prefs_v1") || "{}").theme, logo: document.querySelector(".landing__logo").getAttribute("src") }));
    log("I: fallback — 7 quick taps (" + tap.n + " arrived) end on what the last one asked for, saved, logo matching, nothing stuck", tap.n >= 4 && fin.th === tap.last && fin.saved === tap.last && !/theme-/.test(fin.cls) && (/-light\.svg$/.test(fin.logo) === (tap.last === "light")), JSON.stringify(fin) + " last=" + tap.last);
    log("I: fallback — no errors", errors.length === 0, errors.join(" | "));
    await ctx.close();

    const r = await open("local", { reducedMotion: "reduce" });
    await goLocal(r.page); await watchClasses(r.page);
    const out = await r.page.evaluate(() => { const b = document.querySelector(".landing__bar [data-pref-theme]"); b.click(); return { th: document.documentElement.getAttribute("data-theme"), busy: REBUILT.Theme.isAnimating(), cls: document.documentElement.className }; });
    await r.page.waitForTimeout(900);
    const rs = await seen(r.page);
    log("I: prefers-reduced-motion — the theme changes in the same instant as the tap, with no motion at all", out.th === "light" && !out.busy && !/theme-/.test(out.cls) && !rs.reveal && !rs.fade && (await r.page.evaluate(() => document.getAnimations().filter((a) => a.effect && a.effect.pseudoElement).length)) === 0, JSON.stringify(out));
    log("I: prefers-reduced-motion — the logo and the whole screen are in the new theme", /-light\.svg$/.test(await r.page.$eval(".landing__logo", (e) => e.getAttribute("src"))) && (await bgLum(r.page)) > 0.8);
    log("I: prefers-reduced-motion — no errors", r.errors.length === 0, r.errors.join(" | "));
    await r.ctx.close();

    // the in-app "reduce motion" setting (body.reduce-motion, set once signed in)
    const q = await open("pages", { signedIn: true, prefs: { theme: "dark" } });
    await goPages(q.page, "#app:not([hidden]) #page-content");
    await q.page.evaluate(() => { document.body.classList.add("reduce-motion"); REBUILT.Router.navigateTo("settings"); }); await q.page.waitForSelector('[data-segmented="pref-theme"]'); await watchClasses(q.page);
    const o2 = await q.page.evaluate(() => { document.querySelector('[data-segmented="pref-theme"] [data-value="light"]').click(); return { th: document.documentElement.getAttribute("data-theme"), busy: REBUILT.Theme.isAnimating() }; });
    await q.page.waitForTimeout(800);
    const qs = await seen(q.page);
    log("I: the in-app 'reduce motion' setting — instant change, no motion", o2.th === "light" && !o2.busy && !qs.reveal && !qs.fade, JSON.stringify(o2));
    await q.ctx.close();
  }

  /* ============================================================
     J. Language and theme together
     ============================================================ */
  {
    const { page, errors, ctx } = await open("local");
    await goLocal(page);
    const tSel = ".landing__bar [data-pref-theme]", lSel = ".landing__bar [data-pref-lang]";
    const state = () => page.evaluate(() => ({ lang: document.documentElement.getAttribute("lang"), dir: document.documentElement.getAttribute("dir"), th: document.documentElement.getAttribute("data-theme"), cls: document.documentElement.className, busy: REBUILT.Theme.isAnimating(), problems: REBUILT.I18n.problems().length, anims: document.getAnimations().filter((a) => a.effect && a.effect.pseudoElement).length, saved: JSON.parse(localStorage.getItem("rebuilt_prefs_v1") || "{}") }));
    // J1: language switch in the MIDDLE of a reveal
    await page.click(tSel); await page.waitForFunction(() => REBUILT.Theme.isAnimating()); await page.waitForTimeout(150);
    await page.click(lSel); await idle(page); await page.waitForTimeout(200);
    let s = await state();
    log("J: language switched in the middle of a reveal — English, LTR, light, nothing stuck", s.lang === "en" && s.dir === "ltr" && s.th === "light" && !/theme-/.test(s.cls) && !s.busy && s.anims === 0 && s.problems === 0 && s.saved.lang === "en" && s.saved.theme === "light", JSON.stringify(s));
    // J2: theme right after a language change
    await page.click(lSel); await page.click(tSel); await idle(page); await page.waitForTimeout(200);
    s = await state();
    log("J: language switched, then the theme at once — Arabic, RTL, dark, nothing stuck", s.lang === "ar" && s.dir === "rtl" && s.th === "dark" && !/theme-/.test(s.cls) && !s.busy && s.anims === 0 && s.saved.lang === "ar" && s.saved.theme === "dark", JSON.stringify(s));
    // J3: alternate quickly, six times each
    for (let i = 0; i < 6; i++) { await page.click(tSel); await sleep(70); await page.click(lSel); await sleep(70); }
    await idle(page, 5000); await page.waitForTimeout(250);
    s = await state();
    const keys = await bodyHasKeys(page);
    log("J: six quick theme + language taps each, interleaved — both end where an even number of taps leaves them", s.lang === "ar" && s.th === "dark" && s.dir === "rtl" && !/theme-/.test(s.cls) && s.anims === 0 && s.problems === 0, JSON.stringify(s));
    log("J: …the screen shows no translation key and the dictionaries are complete", keys.length === 0 && s.problems === 0, keys.join(","));
    // J4: switching language while the theme change is finished: the logo / colours agree
    await page.click(tSel); await idle(page); await page.click(lSel); await page.waitForTimeout(300);
    const logo = await page.$eval(".landing__logo", (e) => e.getAttribute("src"));
    log("J: after a theme change then a language change the logo is still the light variant and the page is English LTR", /-light\.svg$/.test(logo) && (await state()).dir === "ltr", logo);
    log("J: no errors, nothing from the theme code in the console", errors.length === 0 && consoleNoise.length === 0, errors.concat(consoleNoise).join(" | "));
    await ctx.close();
  }

  /* ============================================================
     K. Signed in (connected): the account and the data are untouched; every page changes theme and ends complete
     ============================================================ */
  {
    const { page, errors, ctx } = await open("pages", { signedIn: true, prefs: { theme: "dark" } });
    await goPages(page, "#app:not([hidden]) #page-content");
    const before = await page.evaluate(() => localStorage.getItem("__fakesb"));
    srv.resetHits();
    await page.evaluate(() => REBUILT.Router.navigateTo("settings")); await page.waitForSelector('[data-segmented="pref-theme"]');
    const bad = [];
    let want = "light";
    for (const pg of PAGES) {
      await page.evaluate((p) => { REBUILT.Router.navigateTo(p); }, pg); await page.waitForTimeout(350);
      await page.evaluate((w) => { REBUILT.Theme.setPref(w, { origin: { x: 640, y: 40 } }); }, want);
      await page.waitForFunction((w) => document.documentElement.getAttribute("data-theme") === w, want, { timeout: 2500 });
      await idle(page, 4000); await page.waitForTimeout(80);
      const r = await page.evaluate(() => ({ th: document.documentElement.getAttribute("data-theme"), content: document.querySelector("#page-content").innerText.trim().length, ov: document.documentElement.scrollWidth - document.documentElement.clientWidth, anims: document.getAnimations().filter((a) => a.effect && a.effect.pseudoElement).length }));
      const L = await bgLum(page);
      if (r.th !== want || r.content < 20 || r.ov > 1 || r.anims !== 0 || (want === "light" ? L < 0.8 : L > 0.05)) bad.push(pg + ":" + JSON.stringify(r) + " L" + L.toFixed(2));
      want = want === "light" ? "dark" : "light";
    }
    log("K: on each of the 10 pages a theme change ends complete — right colours, content drawn, no overflow, nothing left running", bad.length === 0, bad.join(" | "));
    const after = await page.evaluate(() => localStorage.getItem("__fakesb"));
    const api = srv.hits.filter((h) => h.host === PS.HOSTS[4]).length;
    log("K: the account / database double is byte-for-byte unchanged by all those theme changes, and no request went to the backend", before === after && api === 0, "backend requests: " + api);
    log("K: no errors", errors.length === 0, errors.join(" | "));
    await ctx.close();
  }

  await browserLocal.close(); await browserPages.close(); await srv.close(); local.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log("FAILED:\n" + failed.map((f) => " - " + f.name).join("\n")); process.exit(1); }
})().catch((e) => { console.error("HARNESS", e); process.exit(2); });
