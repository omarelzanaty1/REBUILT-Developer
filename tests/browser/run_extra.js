// Local-mode regression + breadth checks: XP/streak/undo, destructive confirms, export/import, routing,
// no emoji/native dialogs, accessibility names, and overflow at many widths for every screen.
const { launch, ROOT, OUT, TESTS } = require('./_env');
const http = require('http'), fs = require('fs'), path = require('path');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json', '.webmanifest':'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const results = [];
const log = (name, ok, detail) => { results.push({ name, ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };
const PAGES = ['dashboard', 'habits', 'tasks', 'goals', 'planner', 'analytics', 'achievements', 'ai', 'profile', 'settings'];
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2B06}\u{2705}\u{2728}\u{274C}\u{2764}]/u;

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await launch();

  async function newPage(vp, extra) {
    const ctx = await browser.newContext(Object.assign({ viewport: vp, locale: 'ar-EG', timezoneId: 'Africa/Cairo', acceptDownloads: true }, extra || {}));
    const page = await ctx.newPage();
    page.__errors = []; page.__external = [];
    page.on('pageerror', e => page.__errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) page.__errors.push('console: ' + m.text()); });
    page.on('dialog', d => { page.__errors.push('native dialog: ' + d.type()); d.dismiss(); });
    await page.route('**/*', route => {
      const u = route.request().url();
      if (u.startsWith(base)) return route.continue();
      if (!/fonts\.(googleapis|gstatic)|jsdelivr/.test(u)) page.__external.push(u);
      return route.abort();
    });
    return { ctx, page };
  }
  async function seed(page, kind) {
    await page.goto(base + '/'); await page.waitForSelector('.landing');
    await page.evaluate((kind) => {
      const s = kind === 'demo' ? REBUILT.Data.buildDemoState() : REBUILT.Data.buildEmptyState();
      s.meta.hasLocalAccount = true; s.meta.isOnboarded = true; s.user.name = 'عمر'; s.user.email = 'omar@example.com';
      localStorage.setItem(REBUILT.Data.STORAGE_KEY, JSON.stringify(s));
    }, kind);
    await page.goto('about:blank'); await page.goto(base + '/#dashboard'); await page.waitForSelector('#app:not([hidden]) .page-content');
    await page.waitForTimeout(300);
  }
  const st = (page) => page.evaluate(() => JSON.parse(JSON.stringify(REBUILT.App.state)));

  /* ================= A. functional (desktop) ================= */
  {
    const { ctx, page } = await newPage({ width: 1440, height: 900 });
    await seed(page, 'empty');

    // XP / streak / achievements on a habit
    await page.click('[data-action="open-add-habit"]'); await page.waitForSelector('#habit-form');
    await page.fill('#m-title', 'مشي'); await page.click('#habit-form button[type=submit]'); await page.waitForSelector('.row--habit');
    let s = await st(page); const habitXP = s.habits[0].xp; const xp0 = s.xp.total;
    await page.click('.row--habit .row__check'); await page.waitForTimeout(400);
    s = await st(page); const xp1 = s.xp.total;
    log('XP: completing a habit adds its XP (plus any achievement bonus)', xp1 >= xp0 + habitXP, `${xp0} -> ${xp1} (habit=${habitXP})`);
    log('streak: all habits done today => current streak counts today', s.streak.current === 1, 'streak=' + s.streak.current);
    log('achievements: first completion unlocks at least one', s.achievements.some(a => a.unlocked), s.achievements.filter(a => a.unlocked).map(a => a.id).join(','));
    await page.click('.row--habit .row__check'); await page.waitForTimeout(400);
    s = await st(page);
    log('XP: un-completing removes exactly that habit\'s XP', s.xp.total === xp1 - habitXP, `${xp1} -> ${s.xp.total}`);
    log('streak: un-completing today drops the streak back', s.streak.current === 0, 'streak=' + s.streak.current);

    // tasks: complete, delete, undo
    await page.evaluate(() => REBUILT.Router.navigateTo('tasks')); await page.waitForSelector('[data-action="open-add-task"]');
    await page.click('[data-action="open-add-task"]'); await page.waitForSelector('#task-form');
    await page.fill('#m-title', 'تسليم'); await page.click('#task-form button[type=submit]'); await page.waitForTimeout(400);
    await page.evaluate(() => REBUILT.Router.navigateTo('tasks')); await page.waitForSelector('.row--task');
    log('tasks: a new task defaults to today and is visible right away', (await page.$$('.row--task')).length === 1);
    await page.click('.row--task .row__check'); await page.waitForTimeout(400);
    s = await st(page); const xpTask = s.xp.total; const taskXP = s.tasks[0].xp;
    log('XP: completing a task adds its XP', s.tasks[0].completed && xpTask >= xp1 - habitXP + taskXP, `xp=${xpTask}`);
    await page.click('.tabs [data-tab="completed"]'); await page.waitForSelector('.row--task');
    await page.hover('.row--task'); await page.click('.row--task [data-action="delete-task"]');
    await page.waitForSelector('.toast__action'); await page.waitForTimeout(500);
    s = await st(page);
    log('delete task: immediate, no dialog, XP revoked', s.tasks.length === 0 && (await page.$('.modal-overlay')) === null && s.xp.total === xpTask - taskXP, `xp=${s.xp.total}`);
    await page.click('.toast__action'); await page.waitForTimeout(500);
    s = await st(page);
    log('undo delete task: task and XP are back', s.tasks.length === 1 && s.tasks[0].completed && s.xp.total === xpTask, `xp=${s.xp.total}`);

    // goal: create via UI with steps, delete from modal, undo
    await page.evaluate(() => REBUILT.Router.navigateTo('goals')); await page.waitForSelector('[data-action="open-add-goal"]');
    await page.click('[data-action="open-add-goal"]'); await page.waitForSelector('#goal-form');
    await page.fill('#m-title', 'قراءة 12 كتاب'); await page.click('#step-add'); await page.fill('[data-step-index="0"]', 'كتاب 1'); await page.click('#step-add'); await page.fill('[data-step-index="1"]', 'كتاب 2');
    await page.click('#goal-form button[type=submit]'); await page.waitForSelector('.goal');
    s = await st(page);
    log('goal: created with its steps', s.goals.length === 1 && s.goals[0].steps.length === 2, JSON.stringify(s.goals[0].steps.map(x => x.title)));
    await page.click('.step__check'); await page.waitForTimeout(300);
    const pct = await page.$eval('.goal__pct', e => e.textContent.trim());
    log('goal: ticking 1 of 2 steps shows 50%', pct === '50%', pct);
    await page.click('[data-action="edit-goal"]'); await page.waitForSelector('#goal-form');
    await page.click('.modal [data-action="delete-goal"]'); await page.waitForSelector('.toast__action'); await page.waitForTimeout(500);
    s = await st(page); log('delete goal: immediate with undo (no dialog)', s.goals.length === 0 && (await page.$('.modal-overlay')) === null);
    await page.click('.toast__action'); await page.waitForTimeout(500);
    s = await st(page); log('undo delete goal: goal and its ticked step are back', s.goals.length === 1 && s.goals[0].steps.filter(x => x.done).length === 1);
    // goal with no steps can be finished
    await page.click('[data-action="open-add-goal"]'); await page.waitForSelector('#goal-form'); await page.fill('#m-title', 'هدف بدون خطوات'); await page.click('#goal-form button[type=submit]'); await page.waitForTimeout(300);
    await page.locator('.goal', { hasText: 'هدف بدون خطوات' }).locator('[data-action="complete-goal"]').click(); await page.waitForTimeout(300);
    s = await st(page); log('goal: a goal without steps can be marked achieved', s.goals.some(g => g.title === 'هدف بدون خطوات' && g.status === 'done'));

    // persistence
    await page.reload(); await page.waitForSelector('#app:not([hidden]) .page-content'); await page.waitForTimeout(300);
    s = await st(page);
    log('local persistence across reload (habit, task, goals)', s.habits.length === 1 && s.tasks.length === 1 && s.goals.length === 2);

    // routing
    await page.goto('about:blank'); await page.goto(base + '/#nonsense'); await page.waitForSelector('#app:not([hidden]) .page-content'); await page.waitForTimeout(200);
    log('routing: unknown hash falls back to the dashboard', (await page.$('.hero')) !== null);
    await page.goto('about:blank'); await page.goto(base + '/#goals'); await page.waitForSelector('#app:not([hidden]) .page-content'); await page.waitForTimeout(200);
    log('routing: deep link #goals opens Goals', (await page.$('.goal-grid, .goal')) !== null);

    // planner: no day shift
    await page.evaluate(() => REBUILT.Router.navigateTo('planner')); await page.waitForSelector('.daybar');
    await page.click('#planner-next'); await page.waitForTimeout(200);
    const dayCheck = await page.evaluate(() => { const chip = document.querySelector('.day-chip.is-selected') || document.querySelector('.day-chip'); const d = new Date(chip.dataset.day + 'T00:00:00'); return { shown: chip.querySelector('strong').textContent.trim(), actual: String(d.getDate()), sameWeekday: new Date(chip.dataset.day + 'T00:00:00').getDay() }; });
    log('planner: next-week shows the matching calendar days (no UTC day shift)', dayCheck.shown === dayCheck.actual, JSON.stringify(dayCheck));

    // settings: motion toggle persists; export
    await page.evaluate(() => REBUILT.Router.navigateTo('settings')); await page.waitForSelector('#motion-toggle');
    await page.evaluate(() => document.getElementById('motion-toggle').click()); await page.waitForTimeout(250);
    log('settings: reduce-motion switch applies immediately', await page.evaluate(() => document.body.classList.contains('reduce-motion')));
    await page.reload(); await page.waitForSelector('#app:not([hidden]) .page-content'); await page.waitForTimeout(200);
    log('settings: reduce-motion survives reload', await page.evaluate(() => document.body.classList.contains('reduce-motion')));
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#export-data-btn')]);
    const exported = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
    log('export: downloads a valid JSON backup with the user\'s data', Array.isArray(exported.habits) && exported.habits.length === 1 && Array.isArray(exported.goals), dl.suggestedFilename());

    // import: invalid then valid (valid needs an in-app confirm because it replaces data)
    fs.writeFileSync(OUT + '/bad.json', '{"nope":1}'); fs.writeFileSync(OUT + '/good.json', JSON.stringify(Object.assign({}, exported, { habits: [], goals: [] })));
    await page.setInputFiles('#import-data-input', OUT + '/bad.json'); await page.waitForSelector('.toast');
    log('import: an incompatible file is refused with a message, data untouched', (await st(page)).habits.length === 1);
    await page.setInputFiles('#import-data-input', OUT + '/good.json'); await page.waitForSelector('.modal');
    log('import: replacing data asks in-app first (not a native dialog)', (await page.$('[role=alertdialog] [data-confirm-yes]')) !== null);
    await page.click('.modal [data-confirm-no]'); await page.waitForTimeout(400);
    log('import: cancelling keeps current data', (await st(page)).habits.length === 1);

    await page.setInputFiles('#import-data-input', OUT + '/good.json'); await page.waitForSelector('.modal');
    await page.click('.modal [data-confirm-yes]'); await page.waitForTimeout(800);
    s = await st(page);
    log('import: confirming replaces the data with the file\'s content', s.habits.length === 0 && s.goals.length === 0 && s.tasks.length === 1, `habits=${s.habits.length} goals=${s.goals.length} tasks=${s.tasks.length}`);
    await page.reload(); await page.waitForSelector('#app:not([hidden]) .page-content'); await page.waitForTimeout(300);
    s = await st(page); log('import: imported data survives a reload', s.habits.length === 0 && s.tasks.length === 1);
    await page.evaluate(() => REBUILT.Router.navigateTo('settings')); await page.waitForSelector('#reset-empty-btn');

    // wipe: in-app confirm, cancel keeps, confirm wipes and returns to onboarding
    await page.click('#reset-empty-btn'); await page.waitForSelector('.modal');
    await page.click('.modal [data-confirm-no]'); await page.waitForTimeout(400);
    log('wipe: cancel keeps everything', (await st(page)).tasks.length === 1);
    await page.click('#reset-empty-btn'); await page.waitForSelector('.modal');
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }).catch(() => null), page.click('.modal [data-confirm-yes]')]);
    await page.waitForSelector('.wizard-head, .landing', { timeout: 8000 });
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem(REBUILT.Data.STORAGE_KEY) || 'null'));
    log('wipe: confirm erases data and restarts onboarding', after && after.habits.length === 0 && after.goals.length === 0 && after.meta.isOnboarded === false);

    log('A: no console/page errors, no native dialogs', page.__errors.length === 0, page.__errors.join(' | '));
    log('A: zero AI/model or other external requests', page.__external.length === 0, page.__external.join(' | '));
    await ctx.close();
  }

  /* ================= B. every screen, many widths ================= */
  const WIDTHS = [[320, 640], [360, 740], [390, 844], [768, 1024], [1024, 768], [1280, 720], [1440, 900], [1920, 1080]];
  for (const [w, h] of WIDTHS) {
    const { ctx, page } = await newPage({ width: w, height: h }, { hasTouch: w < 720 });
    await seed(page, 'demo');
    const bad = [], clipped = [], emoji = [], unnamed = [];
    for (const pg of PAGES) {
      await page.evaluate(p => REBUILT.Router.navigateTo(p), pg); await page.waitForTimeout(550);
      const r = await page.evaluate(() => {
        const out = { sw: document.documentElement.scrollWidth, iw: window.innerWidth, clipped: [], unnamed: [], text: document.body.innerText };
        document.querySelectorAll('#page-content *').forEach(e => {
          const b = e.getBoundingClientRect(); if (!b.width || !b.height) return;
          let p = e.parentElement, scroller = false; while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') { scroller = true; break; } p = p.parentElement; }
          if (!scroller && (b.right > window.innerWidth + 1 || b.left < -1)) out.clipped.push(e.tagName.toLowerCase() + '.' + String(e.className && e.className.baseVal === undefined ? e.className : '').split(' ')[0]);
        });
        document.querySelectorAll('button, a[href], [role=button]').forEach(e => { const t = (e.textContent || '').trim(); if (!t && !e.getAttribute('aria-label') && !e.getAttribute('title') && !e.querySelector('img[alt]:not([alt=""])')) out.unnamed.push(e.className || e.tagName); });
        document.querySelectorAll('input:not([type=hidden]):not([type=file]), textarea, select').forEach(e => { if (!(e.labels && e.labels.length) && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby')) out.unnamed.push('input#' + (e.id || e.name)); });
        document.querySelectorAll('img').forEach(i => { if (!i.hasAttribute('alt')) out.unnamed.push('img ' + i.src.split('/').pop()); });
        return out;
      });
      if (r.sw > r.iw + 1) bad.push(`${pg}(${r.sw}>${r.iw})`);
      if (r.clipped.length) clipped.push(pg + ':' + [...new Set(r.clipped)].slice(0, 4).join('/'));
      if (EMOJI.test(r.text)) emoji.push(pg);
      if (r.unnamed.length) unnamed.push(pg + ':' + [...new Set(r.unnamed)].slice(0, 4).join('/'));
      if (w === 1280 || w === 1024 || w === 320) await page.screenshot({ path: `${OUT}/w${w}-${pg}.png`, fullPage: true });
    }
    // modals at this width
    await page.evaluate(() => REBUILT.Router.navigateTo('habits')); await page.waitForTimeout(400);
    await page.click('[data-action="open-add-habit"]'); await page.waitForSelector('#habit-form'); await page.waitForTimeout(350);
    const m = await page.evaluate(() => { const b = document.querySelector('.modal').getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, bt: b.bottom, iw: innerWidth, ih: innerHeight, emoji: document.querySelector('.modal').innerText }; });
    if (m.l < -1 || m.r > m.iw + 1 || m.t < -1 || m.bt > m.ih + 1) bad.push(`habit-modal(${Math.round(m.l)},${Math.round(m.t)},${Math.round(m.r)},${Math.round(m.bt)})`);
    if (EMOJI.test(m.emoji)) emoji.push('habit-modal');
    if (w === 320 || w === 1280) await page.screenshot({ path: `${OUT}/w${w}-habit-modal.png` });
    log(`width ${w}: every screen + the habit dialog fit with no horizontal overflow`, bad.length === 0, bad.join(', '));
    log(`width ${w}: no element clipped outside the viewport`, clipped.length === 0, clipped.join(' | '));
    log(`width ${w}: no emoji in any screen text`, emoji.length === 0, emoji.join(','));
    log(`width ${w}: every button/link/input has an accessible name`, unnamed.length === 0, unnamed.join(' | '));
    log(`width ${w}: no console/page errors, no external requests`, page.__errors.length === 0 && page.__external.length === 0, page.__errors.concat(page.__external).join(' | '));
    await ctx.close();
  }

  await browser.close(); server.close();
  const fails = results.filter(r => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  fs.writeFileSync(OUT + '/extra-results.json', JSON.stringify(results, null, 1));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
