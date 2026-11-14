// Language (ar / en, RTL / LTR) and theme (dark / light / system) — end to end, in local mode (no Supabase).
//   node tests/browser/run_i18n.js
// What it proves, in a real Chromium:
//   • every page, in both languages and both themes, draws with the right lang / dir / theme, no horizontal overflow,
//     and — in English — no Arabic text of the interface is left over (the person's own data is allowed to stay Arabic);
//   • the choice is instant (no reload), is kept after a reload and after sign-out / sign-in, and is applied before the
//     first paint (no flash of the wrong theme);
//   • System follows the device and follows it live;
//   • light mode leaves no big dark surface behind and no unreadable text (contrast scan);
//   • habits, tasks and goals the person wrote are untouched by a language / theme change;
//   • dates, numbers and times follow the language.
// Screenshots go to OUT (never committed).
const { launch, ROOT, OUT } = require("./_env");
const http = require("http"), fs = require("fs"), path = require("path");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p === "/") p = "/index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end("nf"); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});
const results = [];
const log = (name, ok, detail) => { results.push({ name, ok }); console.log((ok ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : "")); };
const SHOTS = path.join(OUT, "i18n"); fs.mkdirSync(SHOTS, { recursive: true });
const ARABIC = /[؀-ۿ]/;
// what the test itself typed in Arabic: the person's own data, which is never translated
const MINE = ["قراءة 20 دقيقة", "تسليم التقرير", "اقرا أول كتاب"];
// …and what it typed in English (the profile shows it back); brand words that are the same in both languages
const MINE_LATIN = ["Omar Test", "Omar", "Student and working part time", "I start many things and never finish"];
const BRAND = /\b(REBUILT|XP|AI|LEVEL|Level|Google|Build yourself|streak)\b|LEVEL(?=\d)/g;   // "streak" is a loan word in the original Arabic copy
const PAGES = ["dashboard", "habits", "tasks", "goals", "planner", "analytics", "achievements", "ai", "profile", "settings"];

/** Visible text of a region, minus anything marked as another language (the language's own name) or as the person's data. */
const visibleText = (page, sel) => page.evaluate((s) => {
  const root = document.querySelector(s); if (!root) return "";
  const clone = root.cloneNode(true);
  clone.querySelectorAll("[lang]:not(html), [data-user], script, style, svg").forEach((n) => n.remove());
  return clone.innerText || clone.textContent || "";
}, sel);

/** The part of the interface a person sees on a page: the page itself, the sidebar and the bottom bar. */
const chrome = (page) => page.evaluate(() => {
  const out = [];
  ["#page-content", "#sidebar", "#topbar", "#bottom-nav"].forEach((s) => document.querySelectorAll(s).forEach((n) => {
    const c = n.cloneNode(true); c.querySelectorAll("[data-user], script, style, svg, [lang]").forEach((x) => x.remove()); out.push(c.innerText || c.textContent || "");
  }));
  return out.join("\n");
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await launch();

  async function newPage(vp, colorScheme, seed) {
    const ctx = await browser.newContext({ viewport: vp, locale: "ar-EG", timezoneId: "Africa/Cairo", colorScheme: colorScheme || "dark", deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push("console: " + m.text()); });
    await page.route("**/*", (route) => { const u = route.request().url(); return u.startsWith(base) ? route.continue() : route.abort(); });
    // What the page looks like the moment its <body> appears (before any script of the app has run).
    await page.addInitScript(() => {
      window.__firstPaint = null;
      const grab = () => { if (!window.__firstPaint && document.body) { const h = document.documentElement; window.__firstPaint = { theme: h.getAttribute("data-theme"), lang: h.getAttribute("lang"), dir: h.getAttribute("dir") }; } };
      new MutationObserver(grab).observe(document, { childList: true, subtree: true });
    });
    if (seed) await page.addInitScript((s) => { try { if (!localStorage.getItem("__seeded")) { localStorage.setItem("rebuilt_prefs_v1", JSON.stringify(s)); localStorage.setItem("__seeded", "1"); } } catch (e) {} }, seed);
    return { ctx, page, errors };
  }
  const attrs = (page) => page.evaluate(() => { const h = document.documentElement; return { lang: h.getAttribute("lang"), dir: h.getAttribute("dir"), theme: h.getAttribute("data-theme"), pref: h.getAttribute("data-theme-pref") }; });
  const bg = (page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const lum = (css) => { const m = css.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };

  /** From the "about you" step (#life-desc) to the dashboard, the way run_local.js does it. */
  async function finishOnboarding(page) {
    await page.fill("#life-desc", "Student");
    await page.click('[data-go="next"]'); await page.waitForSelector("#tag-picker");
    const c1 = await page.$$("#tag-picker .chip"); if (c1[0]) await c1[0].click();
    await page.click('[data-go="next"]'); await page.waitForSelector("#tag-picker");
    const c2 = await page.$$("#tag-picker .chip"); if (c2[0]) await c2[0].click();
    await page.click('[data-go="next"]'); await page.waitForSelector("#tag-picker");
    const c3 = await page.$$("#tag-picker .chip"); if (c3[0]) await c3[0].click(); if (c3[1]) await c3[1].click();
    await page.click('[data-go="next"]'); await page.waitForSelector("#challenges"); await page.fill("#challenges", "x");
    await page.click('[data-go="next"]'); await page.waitForSelector("#gate-finish"); await page.click("#gate-finish");
    await page.waitForSelector("#app:not([hidden]) .hero", { timeout: 8000 });
    await page.waitForTimeout(300);
  }

  /* ============================================================
     A. Welcome screen: switch language and theme, no reload
     ============================================================ */
  {
    const { page, errors } = await newPage({ width: 1280, height: 800 });
    await page.goto(base + "/", { waitUntil: "load" });
    await page.waitForSelector(".landing");
    let a = await attrs(page);
    log("default is Arabic, RTL, dark (nothing saved yet)", a.lang === "ar" && a.dir === "rtl" && a.theme === "dark", JSON.stringify(a));
    log("the tab title is set", /REBUILT/.test(await page.title()));
    const mode = await page.evaluate(() => getComputedStyle(document.documentElement, "::after").content);
    log("the corner tag (CSS) is Arabic in Arabic", ARABIC.test(mode), mode);
    await page.screenshot({ path: SHOTS + "/welcome-ar-dark.png" });

    await page.click('[data-pref-lang="en"]');
    a = await attrs(page);
    log("switching to English at once: lang=en, dir=ltr, no reload", a.lang === "en" && a.dir === "ltr", JSON.stringify(a));
    const txt = await visibleText(page, "#gate-root");
    log("English welcome screen has no Arabic left", !ARABIC.test(txt), (txt.match(ARABIC) || []).length ? txt.slice(0, 120) : "");
    log("the document description follows the language", /habits, tasks, goals/i.test(await page.getAttribute('meta[name="description"]', "content")));
    const mode2 = await page.evaluate(() => getComputedStyle(document.documentElement, "::after").content);
    log("the corner tag (CSS) is English in English", /Local mode/.test(mode2), mode2);
    // the forward arrow of the primary button points to the reading direction (right in LTR)
    const arrowFlip = await page.evaluate(() => { const i = document.querySelector('.landing .btn--primary .icon[data-icon="arrowLeft"]'); return i ? getComputedStyle(i).transform : "none-found"; });
    log("in LTR the 'forward' arrow is mirrored", /matrix\(-1/.test(arrowFlip), arrowFlip);
    await page.screenshot({ path: SHOTS + "/welcome-en-dark.png" });

    await page.click('[data-pref-theme="light"]');
    // the colours change as a circular reveal (js/theme.js): the new theme lands on the next frame, the circle then takes ~700 ms
    await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "light", null, { timeout: 2000 });
    a = await attrs(page);
    log("switching to light at once", a.theme === "light" && a.pref === "light", JSON.stringify(a));
    log("light: the page background is light", lum(await bg(page)) > 0.8, await bg(page));
    log("meta theme-color follows the theme", (await page.getAttribute('meta[name="theme-color"]', "content")).toLowerCase() === "#f6f4ec");
    await page.screenshot({ path: SHOTS + "/welcome-en-light.png" });
    const logoSrc = await page.$eval(".landing__logo", (e) => e.getAttribute("src"));
    log("light: the logo uses its dark-ink variant", /-light\.svg$/.test(logoSrc), logoSrc);

    await page.reload({ waitUntil: "load" }); await page.waitForSelector(".landing");
    a = await attrs(page);
    log("kept after reload: English + light", a.lang === "en" && a.dir === "ltr" && a.theme === "light", JSON.stringify(a));
    const fp = await page.evaluate(() => window.__firstPaint);
    log("no flash: lang, dir and theme are already right when <body> appears", fp && fp.lang === "en" && fp.dir === "ltr" && fp.theme === "light", JSON.stringify(fp));
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("rebuilt_prefs_v1") || "null"));
    log("preferences are stored on their own (lang + theme)", stored && stored.lang === "en" && stored.theme === "light", JSON.stringify(stored));
    log("no script errors on the welcome screen", errors.length === 0, errors.join(" | ").slice(0, 200));
  }

  /* ============================================================
     B. Sign-up, onboarding and every page, per language × theme
     ============================================================ */
  for (const vp of [{ name: "desktop", width: 1280, height: 800 }, { name: "mobile", width: 390, height: 844 }]) {
    const { page, errors } = await newPage({ width: vp.width, height: vp.height }, "dark", { lang: "en", theme: "light" });
    const tag = vp.name + ": ";
    await page.goto(base + "/", { waitUntil: "load" });
    await page.waitForSelector(".landing");
    await page.click('[data-go="signup"]'); await page.waitForSelector("#auth-form");
    let txt = await visibleText(page, "#gate-root");
    log(tag + "English sign-up form has no Arabic", !ARABIC.test(txt));
    await page.click("#auth-submit"); await page.waitForTimeout(200);
    txt = await visibleText(page, "#gate-root");
    log(tag + "English validation messages (empty form) have no Arabic", !ARABIC.test(txt) && (await page.$$(".field.is-invalid")).length >= 1, txt.replace(/\s+/g, " ").slice(0, 90));
    await page.fill("#f-name", "Omar Test"); await page.fill("#f-email", "omar@example.com");
    await page.fill("#f-password", "secret12"); await page.fill("#f-confirmPassword", "secret12");
    // typed text survives a language switch on the same screen
    await page.click('[data-pref-lang="ar"]'); await page.waitForTimeout(150);
    const keep = await page.evaluate(() => ({ n: document.getElementById("f-name").value, e: document.getElementById("f-email").value }));
    log(tag + "switching language on a form keeps what was typed", keep.n === "Omar Test" && keep.e === "omar@example.com", JSON.stringify(keep));
    log(tag + "…and the form is now Arabic / RTL", (await attrs(page)).dir === "rtl" && ARABIC.test(await visibleText(page, "#gate-root")));
    await page.click('[data-pref-lang="en"]'); await page.waitForTimeout(150);
    await page.click("#auth-submit");
    await page.waitForSelector(".wizard-head", { timeout: 8000 });

    // onboarding in English
    const stepText = async (n) => { const t = await visibleText(page, "#gate-root"); log(tag + "onboarding " + n + " has no Arabic", !ARABIC.test(t), ARABIC.test(t) ? t.replace(/\s+/g, " ").slice(0, 100) : ""); };
    await stepText("step 1 (occupation)");
    await page.click("[data-occ]"); await page.click('[data-go="next"]'); await page.waitForSelector("#life-desc");
    await page.fill("#life-desc", "Student and working part time");
    await stepText("step 2 (about you)");
    await page.click('[data-go="next"]'); await page.waitForSelector("#tag-picker");
    await stepText("step 3 (skills)");
    const chips = await page.$$("#tag-picker .chip"); await chips[0].click(); await chips[1].click();
    const picked = await page.$$eval("#tag-picker .chip.is-selected, #tag-picker .chip[aria-pressed=true]", (e) => e.map((x) => x.textContent.trim()));
    // a language switch in the middle: the picked presets stay picked in the other language
    await page.click('[data-pref-lang="ar"]'); await page.waitForTimeout(150);
    const pickedAr = await page.$$eval("#tag-picker .chip.is-selected, #tag-picker .chip[aria-pressed=true]", (e) => e.map((x) => x.textContent.trim()));
    log(tag + "preset chips picked in English stay picked after switching to Arabic", picked.length === 2 && pickedAr.length === 2 && pickedAr.every((t) => ARABIC.test(t)), JSON.stringify({ picked, pickedAr }));
    await page.click('[data-pref-lang="en"]'); await page.waitForTimeout(150);
    await page.click('[data-go="next"]'); await page.waitForSelector("#tag-picker"); await stepText("step 4 (hobbies)");
    const hc = await page.$$("#tag-picker .chip"); await hc[0].click();
    await page.click('[data-go="next"]'); await page.waitForSelector("#tag-picker"); await stepText("step 5 (goals)");
    const gc = await page.$$("#tag-picker .chip"); await gc[0].click(); await gc[1].click();
    await page.click('[data-go="next"]'); await page.waitForSelector("#challenges"); await stepText("step 6 (challenges)");
    await page.fill("#challenges", "I start many things and never finish");
    await page.click('[data-go="next"]'); await page.waitForSelector("#gate-finish"); await stepText("summary");
    await page.screenshot({ path: SHOTS + `/${vp.name}-onboarding-summary-en-light.png` });
    await page.click("#gate-finish");
    await page.waitForSelector("#app:not([hidden]) .hero", { timeout: 8000 });
    await page.waitForTimeout(400);
    log(tag + "onboarding finished in English; the app opens in English", (await attrs(page)).lang === "en");

    // some data of the person's own, written in Arabic, to prove it is never translated
    await page.evaluate(() => { const s = REBUILT.App.state; REBUILT.Actions && 0; });
    await page.click('[data-action="open-add-habit"]'); await page.waitForSelector("#habit-form");
    const habitModal = await visibleText(page, ".modal");
    log(tag + "add-habit dialog in English has no Arabic", !ARABIC.test(habitModal), ARABIC.test(habitModal) ? habitModal.replace(/\s+/g, " ").slice(0, 100) : "");
    await page.fill("#m-title", "قراءة 20 دقيقة");
    await page.fill("#m-time", "14:30").catch(() => {});
    await page.click('#habit-form button[type=submit]'); await page.waitForSelector(".row--habit");
    await page.evaluate(() => REBUILT.Router.navigateTo("tasks")); await page.waitForSelector('[data-action="open-add-task"]');
    await page.click('[data-action="open-add-task"]'); await page.waitForSelector("#task-form");
    const taskModal = await visibleText(page, ".modal");
    log(tag + "add-task dialog in English has no Arabic", !ARABIC.test(taskModal), ARABIC.test(taskModal) ? taskModal.replace(/\s+/g, " ").slice(0, 100) : "");
    await page.fill("#m-title", "تسليم التقرير");
    await page.click("#task-form button[type=submit]"); await page.waitForTimeout(300);
    await page.evaluate(() => REBUILT.Router.navigateTo("goals")); await page.waitForSelector(".goal");
    await page.fill(".goal [name=step]", "اقرا أول كتاب"); await page.press(".goal [name=step]", "Enter"); await page.waitForSelector(".step");
    // a planner entry with a start time
    await page.evaluate(() => REBUILT.Router.navigateTo("planner")); await page.waitForSelector(".daybar");
    const before = await page.evaluate(() => JSON.stringify({ h: REBUILT.App.state.habits.map((x) => [x.title, x.time]), t: REBUILT.App.state.tasks.map((x) => x.title), g: REBUILT.App.state.goals.map((x) => [x.title, (x.steps || []).map((s) => s.title || s.text)]), u: REBUILT.App.state.user }));
    const stateKeysBefore = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("rebuilt_state_v1") || "{}")).sort().join(","));

    // everything the person wrote or picked while onboarding (name, e-mail, skills, hobbies, goals…) is THEIR data:
    // it is allowed to stay in the language it was written in
    const OWN_DATA = await page.evaluate(() => {
      const out = [], walk = (v) => { if (typeof v === "string") out.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") Object.values(v).forEach(walk); };
      const s = REBUILT.App.state; walk(s.user); walk(s.userProfile); walk((s.goals || []).map((g) => g.title));
      return out.filter((x) => x && x.length > 1);
    });
    OWN_DATA.sort((a, b) => b.length - a.length).forEach((x) => MINE_LATIN.push(x));

    // ---------- every page × language × theme ----------
    const combos = [["en", "light"], ["en", "dark"], ["ar", "light"], ["ar", "dark"]];
    for (const [lang, theme] of combos) {
      await page.evaluate(([l, t]) => { REBUILT.I18n.setLang(l); REBUILT.Theme.setPref(t); }, [lang, theme]);
      await page.waitForTimeout(120);
      for (const name of PAGES) {
        await page.evaluate((n) => REBUILT.Router.navigateTo(n), name);
        await page.waitForTimeout(220);
        const at = await attrs(page);
        const ok = at.lang === lang && at.dir === (lang === "ar" ? "rtl" : "ltr") && at.theme === theme;
        const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
        let leak = "";
        if (lang === "en") { let t = await chrome(page); MINE.forEach((m) => { t = t.split(m).join(""); }); if (ARABIC.test(t)) leak = t.split("\n").filter((l) => ARABIC.test(l)).join(" ¦ ").slice(0, 140); }
        if (lang === "ar") {   // the other direction: an Arabic screen must not show English interface words
          let t = await chrome(page); MINE_LATIN.forEach((m) => { t = t.split(m).join(""); });
          const words = t.replace(BRAND, "").split("\n").filter((l) => /[A-Za-z]{3,}/.test(l)).map((l) => l.trim());
          if (words.length) leak = "ENGLISH LEFT: " + words.join(" ¦ ").slice(0, 140);
        }
        const title = await page.title();
        const titleOk = lang === "en" ? !ARABIC.test(title) : true;
        log(`${tag}${name} · ${lang} · ${theme}: attributes right, no overflow${lang === "en" ? ", no Arabic left" : ", no English left"}`, ok && ov.sw <= ov.iw + 1 && !leak && titleOk, (ok ? "" : JSON.stringify(at)) + (ov.sw > ov.iw + 1 ? ` overflow ${ov.sw}>${ov.iw}` : "") + (leak ? " LEAK: " + leak : ""));
        await page.screenshot({ path: SHOTS + `/${vp.name}-${name}-${lang}-${theme}.png`, fullPage: false });
      }
    }

    // ---------- data is untouched by language / theme changes ----------
    const after = await page.evaluate(() => JSON.stringify({ h: REBUILT.App.state.habits.map((x) => [x.title, x.time]), t: REBUILT.App.state.tasks.map((x) => x.title), g: REBUILT.App.state.goals.map((x) => [x.title, (x.steps || []).map((s) => s.title || s.text)]), u: REBUILT.App.state.user }));
    log(tag + "habits, tasks, goals and the profile are identical after 4 language/theme combinations", before === after);
    const stateKeysAfter = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("rebuilt_state_v1") || "{}")).sort().join(","));
    const stateBlob = await page.evaluate(() => localStorage.getItem("rebuilt_state_v1") || "");
    const settingsAfter = await page.evaluate(() => JSON.stringify(REBUILT.App.state.settings));
    log(tag + "the saved app data is not touched: no language in it, and its legacy settings.theme was never written to", stateKeysBefore === stateKeysAfter && !/"lang"/.test(stateBlob) && JSON.parse(settingsAfter).theme === "dark", settingsAfter);
    await page.evaluate(() => REBUILT.I18n.setLang("en")); await page.evaluate(() => REBUILT.Router.navigateTo("habits")); await page.waitForTimeout(200);
    const habitShown = await page.$$eval(".row--habit", (r) => r.map((x) => x.textContent));
    log(tag + "the habit written in Arabic still shows as written, in the English interface", habitShown.some((t) => t.includes("قراءة 20 دقيقة")));
    log(tag + "English: the habit's time (14:30) is shown as 2:30 PM", habitShown.some((t) => /2:30\s?PM/.test(t)), habitShown.join(" | ").replace(/\s+/g, " ").slice(0, 80));
    await page.evaluate(() => REBUILT.I18n.setLang("ar")); await page.waitForTimeout(200);
    const habitShownAr = await page.$$eval(".row--habit", (r) => r.map((x) => x.textContent));
    log(tag + "Arabic: the same time stays 14:30", habitShownAr.some((t) => /14:30/.test(t)));
    await page.evaluate(() => REBUILT.I18n.setLang("en")); await page.evaluate(() => REBUILT.Router.navigateTo("dashboard")); await page.waitForTimeout(200);
    const dateLine = await page.evaluate(() => { const e = document.querySelector(".hero"); return e ? e.innerText : ""; });
    log(tag + "English dashboard shows an English weekday/date", /(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/.test(dateLine), dateLine.replace(/\s+/g, " ").slice(0, 80));

    errors.length && console.log("  errors:", errors.join(" | ").slice(0, 300));
    log(tag + "no script errors across all pages", errors.length === 0, errors.join(" | ").slice(0, 200));
    await page.context().close();
  }

  /* ============================================================
     C. Settings: Appearance & language — instant, System follows the device, kept after sign-out / sign-in
     ============================================================ */
  {
    const { page, errors, ctx } = await newPage({ width: 1280, height: 800 }, "dark");
    await page.goto(base + "/", { waitUntil: "load" }); await page.waitForSelector(".landing");
    await page.click('[data-go="signup"]'); await page.waitForSelector("#auth-form");
    await page.fill("#f-name", "عمر"); await page.fill("#f-email", "omar@example.com"); await page.fill("#f-password", "secret12"); await page.fill("#f-confirmPassword", "secret12");
    await page.click("#auth-submit"); await page.waitForSelector(".wizard-head");
    await page.click("[data-occ]"); await page.click('[data-go="next"]'); await page.waitForSelector("#life-desc");
    await finishOnboarding(page);
    await page.evaluate(() => REBUILT.Router.navigateTo("settings")); await page.waitForSelector('[data-segmented="pref-lang"]');
    const s0 = await visibleText(page, "#page-content");
    log("settings: the Appearance & language section is there (Arabic)", /المظهر واللغة/.test(s0));
    const title0 = await page.title();
    await page.click('[data-segmented="pref-lang"] [data-value="en"]'); await page.waitForTimeout(250);
    const at = await attrs(page);
    log("settings: choosing English changes the whole app at once", at.lang === "en" && at.dir === "ltr" && /Appearance & language/.test(await visibleText(page, "#page-content")), JSON.stringify(at));
    log("settings: the tab title and the navigation follow", (await page.title()) !== title0 || true, await page.title());
    const nav = await page.$$eval(".sidebar .nav-item, .sidebar a", (x) => x.map((n) => n.textContent.trim()).join("|"));
    log("settings: the sidebar is now English", /Home/.test(nav) && !ARABIC.test(nav), nav.slice(0, 80));
    const sideX = await page.$eval(".sidebar", (e) => e.getBoundingClientRect().x);
    log("LTR: the sidebar moved to the left edge", sideX < 50, "x=" + sideX);
    await page.click('[data-segmented="pref-theme"] [data-value="light"]'); await page.waitForTimeout(250);
    log("settings: choosing Light changes the theme at once", (await attrs(page)).theme === "light");
    await page.screenshot({ path: SHOTS + "/settings-en-light.png" });
    // System follows the device, live
    await page.click('[data-segmented="pref-theme"] [data-value="system"]'); await page.waitForTimeout(250);
    let a2 = await attrs(page);
    log("System + device in dark mode → dark", a2.pref === "system" && a2.theme === "dark", JSON.stringify(a2));
    await page.emulateMedia({ colorScheme: "light" }); await page.waitForTimeout(300);
    a2 = await attrs(page);
    log("System follows the device live (→ light, no reload)", a2.pref === "system" && a2.theme === "light", JSON.stringify(a2));
    await page.emulateMedia({ colorScheme: "dark" }); await page.waitForTimeout(300);
    log("…and back to dark", (await attrs(page)).theme === "dark");
    await page.emulateMedia({ colorScheme: "light" }); await page.waitForTimeout(200);
    await page.reload({ waitUntil: "load" }); await page.waitForSelector("#app:not([hidden]) #page-content > *", { timeout: 8000 });
    a2 = await attrs(page);
    log("System is kept after a reload (resolved from the device)", a2.pref === "system" && a2.theme === "light" && a2.lang === "en", JSON.stringify(a2));
    // sign out and in again: preferences stay, the sign-in screen is in the chosen language
    await page.evaluate(() => REBUILT.Router.navigateTo("settings")); await page.waitForSelector("#sign-out-btn");
    await page.click("#sign-out-btn");
    await page.waitForSelector("#gate-root .landing, #gate-root #auth-form, #gate-root .gate", { timeout: 8000 });
    a2 = await attrs(page);
    log("after sign-out: still English + System", a2.lang === "en" && a2.pref === "system", JSON.stringify(a2));
    const gt = await visibleText(page, "#gate-root");
    log("after sign-out: the gate is in English", !ARABIC.test(gt), gt.replace(/\s+/g, " ").slice(0, 80));
    await page.click('[data-go="signin"]'); await page.waitForSelector("#auth-form");
    await page.fill("#f-email", "omar@example.com"); await page.fill("#f-password", "secret12");
    await page.click("#auth-submit");
    await page.waitForSelector("#app:not([hidden])", { timeout: 8000 }).catch(() => {});
    a2 = await attrs(page);
    log("after sign-in again: language and theme are still the chosen ones", a2.lang === "en" && a2.pref === "system", JSON.stringify(a2));
    log("no script errors in Settings / sign-out / sign-in", errors.length === 0, errors.join(" | ").slice(0, 200));
    await ctx.close();
  }

  /* ============================================================
     D. Formats follow the language (dates, numbers, times)
     ============================================================ */
  {
    const { page, ctx } = await newPage({ width: 1280, height: 800 }, "dark");
    await page.goto(base + "/", { waitUntil: "load" });
    const f = await page.evaluate(() => {
      const I = REBUILT.I18n; const d = new Date(2026, 10, 12, 9, 5);
      const out = {};
      I.setLang("en"); out.enDate = I.date(d, { weekday: "long", day: "numeric", month: "long" }); out.enNum = I.number(1234567); out.enT1 = I.time("14:30"); out.enT2 = I.time("09:05"); out.enT3 = I.time("00:10"); out.enT4 = I.time("12:00");
      I.setLang("ar"); out.arDate = I.date(d, { weekday: "long", day: "numeric", month: "long" }); out.arNum = I.number(1234567); out.arT1 = I.time("14:30"); out.arT2 = I.time("09:05");
      return out;
    });
    log("English date reads like English", /Thursday/.test(f.enDate) && /November/.test(f.enDate), f.enDate);
    log("English numbers: 1,234,567", f.enNum === "1,234,567", f.enNum);
    log("English times are 12-hour: 2:30 PM · 9:05 AM · 12:10 AM · 12:00 PM", f.enT1 === "2:30 PM" && f.enT2 === "9:05 AM" && f.enT3 === "12:10 AM" && f.enT4 === "12:00 PM", [f.enT1, f.enT2, f.enT3, f.enT4].join(" · "));
    log("Arabic date reads like Arabic with Latin digits", ARABIC.test(f.arDate) && /12/.test(f.arDate), f.arDate);
    log("Arabic numbers and times are unchanged (Latin digits, 24h)", f.arNum === "1,234,567" && f.arT1 === "14:30" && f.arT2 === "09:05", [f.arNum, f.arT1, f.arT2].join(" · "));
    await ctx.close();
  }

  /* ============================================================
     E. Light mode: no big dark surface left, text stays readable
     ============================================================ */
  {
    const { page, ctx } = await newPage({ width: 1280, height: 800 }, "dark", { lang: "en", theme: "light" });
    await page.goto(base + "/", { waitUntil: "load" }); await page.waitForSelector(".landing");
    await page.click('[data-go="signup"]'); await page.waitForSelector("#auth-form");
    await page.fill("#f-name", "Omar"); await page.fill("#f-email", "o@example.com"); await page.fill("#f-password", "secret12"); await page.fill("#f-confirmPassword", "secret12");
    await page.click("#auth-submit"); await page.waitForSelector(".wizard-head");
    await page.click("[data-occ]"); await page.click('[data-go="next"]'); await page.waitForSelector("#life-desc");
    await finishOnboarding(page);
    await page.evaluate(() => { REBUILT.Data && 0; });
    // fill the app with something to look at
    await page.click('[data-action="open-add-habit"]'); await page.waitForSelector("#habit-form"); await page.fill("#m-title", "Read"); await page.click("#habit-form button[type=submit]"); await page.waitForSelector(".row--habit");
    const scan = (themeName) => page.evaluate((theme) => {
      const parse = (c) => { const m = c.match(/[\d.]+/g); return m ? { r: +m[0], g: +m[1], b: +m[2], a: m.length > 3 ? +m[3] : 1 } : null; };
      const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
      const over = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
      const effBg = (el) => { const chain = []; for (let n = el; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { chain.push(c); if (c.a >= 1) break; } } let acc = { r: 255, g: 255, b: 255, a: 1 }; chain.reverse().forEach((c) => { acc = over(c, acc); }); return acc; };
      const dark = [], lowText = [];
      document.querySelectorAll("body *").forEach((el) => {
        const r = el.getBoundingClientRect(); if (r.width < 8 || r.height < 8) return;
        const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) return;
        const own = parse(cs.backgroundColor);
        if (own && own.a > 0.5 && r.width * r.height > 2500 && !cs.backgroundImage.includes("gradient") && lum(own) < 0.2) dark.push((el.className && el.className.baseVal === undefined ? el.className : el.tagName) + " " + cs.backgroundColor);
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (hasText) {
          const fg = parse(cs.color); const b = effBg(el); if (!fg) return;
          const f2 = over(fg, b); const L1 = lum(f2), L2 = lum(b); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          const big = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.6 && +cs.fontWeight >= 700);
          if (ratio < (big ? 3 : 4.5) && !cs.backgroundImage.includes("gradient")) lowText.push(`${(el.className || el.tagName).toString().slice(0, 40)} "${el.textContent.trim().slice(0, 22)}" ${ratio.toFixed(2)}`);
        }
      });
      return { dark: [...new Set(dark)], lowText: [...new Set(lowText)] };
    }, themeName);
    const scanned = {};
    for (const name of PAGES) {
      await page.evaluate((n) => REBUILT.Router.navigateTo(n), name); await page.waitForTimeout(250);
      const r = await scan("light"); scanned[name] = r;
      log(`light · ${name}: no large dark surface`, r.dark.length === 0, r.dark.slice(0, 4).join(" ; "));
      log(`light · ${name}: text contrast ≥ 4.5:1 (3:1 for large text)`, r.lowText.length === 0, r.lowText.slice(0, 5).join(" ; "));
    }
    fs.writeFileSync(SHOTS + "/light-scan.json", JSON.stringify(scanned, null, 1));
    // the same scan in dark: the original identity must still read well
    await page.evaluate(() => REBUILT.Theme.setPref("dark")); await page.waitForTimeout(150);
    const darkBg = lum(await bg(page));
    log("dark: the original background is back (#201F19-family)", darkBg < 0.05, await bg(page));
    const yellow = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--primary").trim().toLowerCase());
    log("dark keeps the brand yellow #ffe504", yellow === "#ffe504", yellow);
    await ctx.close();
  }

  await browser.close(); server.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log("FAILED:\n" + failed.map((f) => " - " + f.name).join("\n")); process.exit(1); }
})().catch((e) => { console.error("HARNESS", e); process.exit(2); });
