// Local-mode (no Supabase) end-to-end run with screenshots + assertions.
const { launch, ROOT, OUT, TESTS } = require('./_env');
const http = require('http'), fs = require('fs'), path = require('path');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json', '.webmanifest':'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const results = []; const log = (name, ok, detail) => { results.push({ name, ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };

const VIEWPORTS = { desktop: { width: 1440, height: 900 }, tablet: { width: 820, height: 1180 }, mobile: { width: 390, height: 844 } };

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await launch();

  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport: vp, locale: 'ar-EG', timezoneId: 'Africa/Cairo', deviceScaleFactor: vpName === 'mobile' ? 2 : 1, hasTouch: vpName === 'mobile' });
    const page = await ctx.newPage();
    const errors = [], badReq = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push('console: ' + m.text()); });
    page.on('dialog', d => { errors.push('native dialog: ' + d.type()); d.dismiss(); });
    await page.route('**/*', route => {
      const u = route.request().url();
      if (u.startsWith(base)) return route.continue();
      if (/anthropic|ai-chat|openai|generativelanguage/i.test(u)) badReq.push(u);
      return route.abort();
    });
    const shot = (n) => page.screenshot({ path: `${OUT}/${vpName}-${n}.png`, fullPage: true });
    const overflow = async (n) => {
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
      log(`${vpName}: no horizontal overflow on ${n}`, o.sw <= o.iw + 1, `scrollWidth=${o.sw} innerWidth=${o.iw}`);
    };

    await page.goto(base + '/', { waitUntil: 'load' });
    await page.waitForSelector('.landing', { timeout: 8000 });
    await page.waitForTimeout(400);
    await shot('01-welcome'); await overflow('welcome');

    // --- sign-up with validation ---
    await page.click('[data-go="signup"]');
    await page.waitForSelector('#auth-form');
    await shot('02-signup');
    await page.click('#auth-submit');
    await page.waitForTimeout(200);
    const invalid = await page.$$eval('.field.is-invalid', e => e.length);
    log(`${vpName}: empty sign-up shows field errors`, invalid >= 1, `invalid fields=${invalid}`);
    await shot('03-signup-errors');
    await page.fill('#f-name', 'عمر الزناتي');
    await page.fill('#f-email', 'omar@example.com');
    await page.fill('#f-password', 'secret1');
    await page.dispatchEvent('#f-password', 'input');
    await page.fill('#f-confirmPassword', 'secret1');
    // boundary: 7 characters must be refused inline (minimum is 8), nothing submitted
    await page.click('#auth-submit'); await page.waitForTimeout(250);
    const short7 = await page.$eval('[data-field=password]', e => ({ bad: e.classList.contains('is-invalid'), msg: e.textContent }));
    log(`${vpName}: 7-character password is refused inline and the message says 8`, short7.bad && /8/.test(short7.msg), short7.msg.replace(/\s+/g, ' ').trim().slice(0, 80));
    log(`${vpName}: sign-up password hint states the 8-character minimum`, /8 حروف/.test(await page.$eval('[data-field=password]', e => e.textContent)));
    await page.fill('#f-password', 'secret12'); await page.dispatchEvent('#f-password', 'input'); await page.fill('#f-confirmPassword', 'secret12');
    await shot('04-signup-filled');
    // sign-in + forgot screens
    await page.click('[data-authmode="signin"]');
    await page.waitForSelector('#auth-form');
    await shot('05-signin');
    await page.click('[data-go="forgot"]');
    await page.waitForSelector('.gate__state');
    await shot('06-forgot-local');
    await page.click('[data-go="signin"]'); await page.waitForSelector('#auth-form'); await page.click('.gate__tabs [data-authmode="signup"]'); await page.waitForSelector('#f-name');
    await page.fill('#f-name', 'عمر الزناتي'); await page.fill('#f-email', 'omar@example.com');
    await page.fill('#f-password', 'secret12'); await page.fill('#f-confirmPassword', 'secret12');
    await page.click('#auth-submit');
    await page.waitForSelector('.wizard-head', { timeout: 8000 });
    log(`${vpName}: local sign-up reaches onboarding`, true);

    // --- onboarding ---
    await shot('07-onb-1'); await overflow('onboarding-1');
    await page.click('[data-occ]'); 
    await page.click('[data-go="next"]'); await page.waitForSelector('#life-desc');
    await page.fill('#life-desc', 'طالب وبشتغل بعد الجامعة');
    await shot('08-onb-2');
    await page.click('[data-go="next"]'); await page.waitForSelector('#tag-picker');
    const chips = await page.$$('#tag-picker .chip'); if (chips[0]) await chips[0].click(); if (chips[1]) await chips[1].click();
    await shot('09-onb-skills');
    await page.click('[data-go="next"]'); await page.waitForSelector('#tag-picker');
    const hc = await page.$$('#tag-picker .chip'); if (hc[0]) await hc[0].click();
    await page.click('[data-go="next"]'); await page.waitForSelector('#tag-picker');
    const gc = await page.$$('#tag-picker .chip'); if (gc[0]) await gc[0].click(); if (gc[1]) await gc[1].click();
    await shot('10-onb-goals');
    await page.click('[data-go="next"]'); await page.waitForSelector('#challenges');
    await page.fill('#challenges', 'بابدأ حاجات كتير وما بكملهاش');
    await shot('11-onb-challenges');
    await page.click('[data-go="next"]'); await page.waitForSelector('#gate-finish');
    await shot('12-onb-summary'); await overflow('onboarding-summary');
    await page.click('#gate-finish');
    await page.waitForSelector('#app:not([hidden]) .hero', { timeout: 8000 });
    await page.waitForTimeout(500);
    log(`${vpName}: onboarding completes and lands on dashboard`, true);
    await shot('13-dashboard-fresh'); await overflow('dashboard (fresh)');

    // goals were persisted from onboarding?
    const goalCount = await page.evaluate(() => REBUILT.App.state.goals.length);
    log(`${vpName}: onboarding goals became real goals`, goalCount === 2, `goals=${goalCount}`);

    // --- add habit via UI ---
    await page.click('[data-action="open-add-habit"]');
    await page.waitForSelector('#habit-form');
    await shot('14-habit-modal');
    await page.fill('#m-title', 'قراءة 20 دقيقة');
    await page.click('#habit-form button[type=submit]');
    await page.waitForSelector('.row--habit');
    log(`${vpName}: habit added from dashboard`, true);
    // add task
    await page.evaluate(() => REBUILT.Router.navigateTo('tasks'));
    await page.waitForSelector('[data-action="open-add-task"]');
    await page.click('[data-action="open-add-task"]');
    await page.waitForSelector('#task-form');
    await shot('15-task-modal');
    await page.fill('#m-title', 'تسليم التقرير');
    await page.click('#task-form button[type=submit]');
    await page.waitForTimeout(400);
    await page.evaluate(() => REBUILT.Router.navigateTo('tasks'));
    await page.waitForTimeout(300);
    await shot('16-tasks'); await overflow('tasks');

    // goals page
    await page.evaluate(() => REBUILT.Router.navigateTo('goals'));
    await page.waitForSelector('.goal');
    await shot('17-goals'); await overflow('goals');
    await page.fill('.goal [name=step]', 'اقرا أول كتاب');
    await page.press('.goal [name=step]', 'Enter');
    await page.waitForSelector('.step');
    const pctBefore = await page.$eval('.goal__pct', e => e.textContent);
    await page.click('.step__check');
    await page.waitForTimeout(300);
    const pctAfter = await page.$eval('.goal__pct', e => e.textContent);
    log(`${vpName}: ticking a goal step moves progress`, pctBefore !== pctAfter, `${pctBefore} -> ${pctAfter}`);
    await shot('18-goals-progress');
    await page.click('[data-action="open-add-goal"]');
    await page.waitForSelector('#goal-form');
    await shot('19-goal-modal');
    await page.keyboard.press('Escape');

    // planner
    await page.evaluate(() => REBUILT.Router.navigateTo('planner'));
    await page.waitForSelector('.daybar');
    await shot('20-planner-empty');
    await page.click('[data-action="open-add-schedule-item"]');
    await page.waitForSelector('#schedule-form');
    await page.fill('#m-title', 'محاضرة');
    await page.fill('#m-startTime', '10:00');
    await shot('21-schedule-modal');
    await page.click('#schedule-form button[type=submit]');
    await page.waitForSelector('.timeline');
    await shot('22-planner'); await overflow('planner');

    // habits page, toggling
    await page.evaluate(() => REBUILT.Router.navigateTo('habits'));
    await page.waitForSelector('.row--habit');
    await page.click('.row--habit .row__check');
    await page.waitForTimeout(500);
    await shot('23-habits-done'); await overflow('habits');
    // analytics (not enough history)
    await page.evaluate(() => REBUILT.Router.navigateTo('analytics'));
    await page.waitForTimeout(300);
    await shot('24-analytics-empty'); await overflow('analytics (empty)');
    await page.evaluate(() => REBUILT.Router.navigateTo('achievements'));
    await page.waitForTimeout(300);
    await shot('25-achievements'); await overflow('achievements');
    await page.evaluate(() => REBUILT.Router.navigateTo('profile'));
    await page.waitForTimeout(300);
    await shot('26-profile'); await overflow('profile');
    await page.evaluate(() => REBUILT.Router.navigateTo('settings'));
    await page.waitForTimeout(300);
    await shot('27-settings'); await overflow('settings');
    await page.evaluate(() => REBUILT.Router.navigateTo('ai'));
    await page.waitForSelector('.ai-soon');
    await shot('28-ai-soon'); await overflow('ai');
    const aiText = await page.$eval('.ai-soon', e => e.textContent);
    log(`${vpName}: AI page shows Coming Soon copy`, /قريبًا/.test(aiText) && /مساعدك الذكي قريبًا/.test(aiText) && /العودة إلى الرئيسية/.test(aiText));
    await page.evaluate(() => REBUILT.Router.navigateTo('dashboard'));
    await page.waitForTimeout(300);
    await shot('29-dashboard-active'); await overflow('dashboard (active)');
    if (vpName === 'mobile') {
      // More sheet
      const more = await page.$('[data-more], #more-btn, .tab-item[data-more]');
      if (more) { await more.click(); await page.waitForTimeout(400); await shot('30-more-sheet'); }
    }

    // demo data → analytics + active dashboard
    await page.evaluate(() => REBUILT.Router.navigateTo('settings'));
    await page.click('#load-demo-btn');
    await page.waitForSelector('.modal');
    await shot('31-confirm-demo');
    await page.click('.modal .btn--primary');
    await page.waitForSelector('.hero');
    await page.waitForTimeout(500);
    await shot('32-dashboard-demo'); await overflow('dashboard (demo)');
    for (const pg of ['analytics', 'habits', 'tasks', 'goals', 'achievements', 'profile', 'planner']) {
      await page.evaluate(p => REBUILT.Router.navigateTo(p), pg);
      await page.waitForTimeout(350);
      await shot('33-demo-' + pg); await overflow(pg + ' (demo)');
    }

    log(`${vpName}: no console/page errors, no native dialogs`, errors.length === 0, errors.join(' | '));
    log(`${vpName}: zero AI/model network requests`, badReq.length === 0, badReq.join(' | '));
    await ctx.close();
  }
  await browser.close(); server.close();
  const fails = results.filter(r => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  fs.writeFileSync(OUT + '/local-results.json', JSON.stringify(results, null, 1));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
