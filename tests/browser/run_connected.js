// Connected-mode run against an in-memory Supabase test double (tests/fake-supabase.js).
// Checks real flows end to end: sign-up/confirm/sign-in, onboarding commit, habit/goal sync,
// undo-delete ordering, reload persistence, password change, recovery (request, ready, expired), sign-out.
const { launch, ROOT, OUT, TESTS } = require('./_env');
const fs = require('fs'), path = require('path');
const FAKE = fs.readFileSync(TESTS + '/fake-supabase.js', 'utf8');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json', '.webmanifest':'application/manifest+json' };
const results = [];
const log = (name, ok, detail) => { results.push({ name, ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } };
const EMAIL = 'omar.test@example.com', PW1 = 'secret123', PW2 = 'newsecret456';

(async () => {
  // Connected mode exists only on the STABLE channel (supabaseClient.js picks the backend from the address), so the app is
  // served under the stable GitHub Pages address, files supplied by the route handlers below — nothing real is reached.
  const base = 'https://omarelzanaty1.github.io/rebuilt0.4';
  const serveLocal = (route) => {
    const u = new URL(route.request().url());
    let p = decodeURIComponent(u.pathname.slice('/rebuilt0.4'.length)); if (p === '' || p === '/') p = '/index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
    return route.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  };
  const browser = await launch();

  for (const [vp, size] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport: size, locale: 'ar-EG', timezoneId: 'Africa/Cairo', deviceScaleFactor: vp === 'mobile' ? 2 : 1, hasTouch: vp === 'mobile' });
    const page = await ctx.newPage();
    const errors = [], external = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) errors.push('console: ' + m.text()); });
    page.on('dialog', d => { errors.push('native dialog: ' + d.type()); d.dismiss(); });
    await page.route('**/*', route => {
      const u = route.request().url();
      if (u.startsWith(base)) return serveLocal(route);
      if (/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/.test(u)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE });
      if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.abort();
      external.push(u); return route.abort();
    });
    const shot = (n) => page.screenshot({ path: `${OUT}/conn-${vp}-${n}.png`, fullPage: true });
    const T = (n) => `${vp}: ${n}`;
    const sbEval = (fn, arg) => page.evaluate(fn, arg);
    const settle = (ms = 450) => page.waitForTimeout(ms);
    const logOps = () => sbEval(() => window.__sb.log.filter(l => l.phase === 'start').map(l => `${l.op}:${l.table}`));
    const authCalls = () => sbEval(() => window.__sb.authCalls);

    // ---------- 1. welcome in connected mode ----------
    await page.goto(base + '/'); await page.waitForSelector('.landing');
    log(T('connected mode hides the local-mode notice'), (await page.$('.landing__mode')) === null);

    // ---------- 2. sign-up requires e-mail confirmation ----------
    await page.click('[data-go="signup"]'); await page.waitForSelector('#auth-form');
    await page.fill('#f-name', 'عمر الزناتي'); await page.fill('#f-email', EMAIL);
    await page.fill('#f-password', 'abcdefg'); await page.fill('#f-confirmPassword', 'abcdefg');   // 7 characters
    await page.click('#auth-submit'); await settle(250);
    log(T('sign-up: 7-character password refused inline, no request reaches the server'),
        (await page.$eval('[data-field=password]', e => e.classList.contains('is-invalid'))) && (await authCalls()).filter(c => c.fn === 'signUp').length === 0);
    await page.fill('#f-password', PW1); await page.fill('#f-confirmPassword', PW1);
    await page.click('#auth-submit');
    await page.waitForSelector('.gate__state');
    const t1 = await page.$eval('.gate__title', e => e.textContent);
    log(T('sign-up shows the check-your-email state (no fake sign-in)'), /إيميلك/.test(t1), t1);
    await shot('01-confirm-email');
    // trying to sign in before confirming is refused with an Egyptian-Arabic message
    await page.click('[data-go="signin-after-confirm"]'); await page.waitForSelector('#auth-form');
    await page.fill('#f-email', EMAIL); await page.fill('#f-password', PW1);
    await page.click('#auth-submit'); await page.waitForSelector('#gate-notice .notice--danger');
    const unconfirmed = await page.$eval('#gate-notice', e => e.textContent);
    log(T('sign-in before confirming is refused'), /لازم تأكد بريدك الإلكتروني/.test(unconfirmed) && /ابعت رسالة التأكيد تاني/.test(unconfirmed), unconfirmed.trim());
    // wrong password
    await sbEval((e) => window.__sb.confirm(e), EMAIL);
    await page.fill('#f-password', 'wrongpass'); await page.click('#auth-submit'); await settle(300);
    const wrong = await page.$eval('#gate-notice', e => e.textContent);
    log(T('wrong password gives a clear error'), /غلط/.test(wrong), wrong.trim());
    await shot('02-signin-error');

    // ---------- 3. sign-in → onboarding → commit ----------
    await page.fill('#f-password', PW1); await page.click('#auth-submit');
    await page.waitForSelector('.wizard-head', { timeout: 8000 });
    log(T('confirmed user signs in and reaches onboarding'), true);
    await page.fill('#f-name', 'عمر الزناتي');
    await page.click('[data-occ]'); await page.click('[data-go="next"]'); await page.waitForSelector('#life-desc');
    await page.click('[data-go="next"]'); await page.waitForSelector('#tag-picker');
    let chips = await page.$$('#tag-picker .chip'); await chips[0].click();
    await page.click('[data-go="next"]'); await page.waitForSelector('#tag-picker');
    await (await page.$$('#tag-picker .chip'))[0].click();
    await page.click('[data-go="next"]'); await page.waitForSelector('#tag-picker');
    chips = await page.$$('#tag-picker .chip'); await chips[0].click(); await chips[1].click();
    await page.click('[data-go="next"]'); await page.waitForSelector('#challenges');
    await page.click('[data-go="next"]'); await page.waitForSelector('#gate-finish');
    await page.click('#gate-finish');
    await page.waitForSelector('#app:not([hidden]) .hero', { timeout: 8000 }); await settle();
    const srv = await sbEval(() => ({ onboarded: window.__sb.db.tables.profiles[0].is_onboarded, goals: window.__sb.db.tables.user_profiles[0].goals, skills: window.__sb.db.tables.user_profiles[0].skills }));
    log(T('onboarding is committed to the server'), srv.onboarded === true && srv.skills.length === 1, JSON.stringify({ onboarded: srv.onboarded, skills: srv.skills.length }));
    log(T('onboarding goals stored as encoded goal entries'), srv.goals.length === 2 && srv.goals.every(g => g.startsWith('rbg1:')), srv.goals.map(g => g.slice(0, 18)).join(' | '));

    // ---------- 4. add a habit and complete it ----------
    await page.click('[data-action="open-add-habit"]'); await page.waitForSelector('#habit-form');
    await page.fill('#m-title', 'قراءة 20 دقيقة');
    await page.click('#habit-form button[type=submit]'); await page.waitForSelector('.row--habit'); await settle();
    await page.click('.row--habit .row__check'); await settle(700);
    const habitRows = await sbEval(() => ({ habits: window.__sb.db.tables.habits.length, comps: window.__sb.db.tables.habit_completions.length, hist: window.__sb.db.tables.daily_history.length, userOk: window.__sb.db.tables.habits[0] && window.__sb.db.tables.habits[0].user_id === window.__sb.db.users[0].id }));
    log(T('habit + completion + daily history synced with the right user_id'), habitRows.habits === 1 && habitRows.comps === 1 && habitRows.hist >= 1 && habitRows.userOk, JSON.stringify(habitRows));
    const xpShown = await page.$eval('.stat__value', e => e.textContent.trim());
    // The "early bird" achievement (+30 XP) unlocks when a habit is completed before 08:00 local time, so the expected total depends on the hour the test runs.
    const earlyHour = await page.evaluate(() => new Date().getHours() < 8);
    log(T('XP total updates after completing a habit (20 + first-habit achievement bonus' + (earlyHour ? ' + early-bird bonus, it is before 08:00' : '') + ')'), new RegExp('^' + (earlyHour ? 65 : 35) + '$').test(xpShown), xpShown);
    await shot('03-dashboard-after-habit');

    // ---------- 5. delete → undo: no confirm dialog; restore waits for the delete ----------
    await sbEval(() => { window.__sb.cfg.deleteDelay = 500; window.__sb.log.length = 0; window.__sb.errors.length = 0; });
    await page.click('.row--habit [data-action="edit-habit"].row__body, .row--habit .row__body');
    await page.waitForSelector('#habit-form');
    const xpBefore = await page.$eval('.stat__value', e => e.textContent.trim());
    await page.click('.modal [data-action="delete-habit"]');
    await page.waitForSelector('.toast__action');
    await settle(500);
    const dialogOpen = await page.$('.modal-overlay');
    log(T('deleting a habit shows an undo toast, not a confirm dialog'), dialogOpen === null, 'modal open after delete: ' + !!dialogOpen);
    await shot('04-undo-toast');
    const rowGone = (await page.$('.row--habit')) === null;
    await page.click('.toast__action'); // undo immediately, while the server delete (500 ms) is still in flight
    await settle(1800);
    const ops = await sbEval(() => window.__sb.log.map(l => `${l.phase}:${l.op}:${l.table}`));
    const iDelEnd = ops.indexOf('end:delete:habits'), iInsStart = ops.indexOf('start:insert:habits');
    log(T('undo: habit row removed from the list first'), rowGone);
    log(T('undo: restore is sent only after the delete finished'), iDelEnd >= 0 && iInsStart > iDelEnd, ops.join(' > '));
    const after = await sbEval(() => ({ habits: window.__sb.db.tables.habits.length, comps: window.__sb.db.tables.habit_completions.length, errors: window.__sb.errors }));
    log(T('undo: habit and its completion are back on the server, no constraint errors'), after.habits === 1 && after.comps === 1 && after.errors.length === 0, JSON.stringify(after));
    const xpAfter = await page.$eval('.stat__value', e => e.textContent.trim());
    log(T('undo: XP restored to the value before deleting'), xpAfter === xpBefore, xpBefore + ' -> ' + xpAfter);

    // a delete that is NOT undone really deletes on the server
    await sbEval(() => { window.__sb.cfg.deleteDelay = 0; });
    await page.click('.row--habit .row__body'); await page.waitForSelector('#habit-form');
    await page.click('.modal [data-action="delete-habit"]'); await page.waitForSelector('.toast__action'); await settle(700);
    const gone = await sbEval(() => window.__sb.db.tables.habits.length);
    log(T('delete without undo reaches the server'), gone === 0, 'habits on server=' + gone);
    // recreate one for the reload check
    await page.click('[data-action="open-add-habit"]'); await page.waitForSelector('#habit-form');
    await page.fill('#m-title', 'شرب المياه'); await page.click('#habit-form button[type=submit]'); await settle();

    // ---------- 6. goals: add a step, tick it, persistence across reload ----------
    await page.evaluate(() => REBUILT.Router.navigateTo('goals')); await page.waitForSelector('.goal');
    await page.fill('.goal [name=step]', 'اقرا أول كتاب'); await page.press('.goal [name=step]', 'Enter'); await page.waitForSelector('.step');
    await page.click('.step__check'); await settle(600);
    const goalRow = await sbEval(() => window.__sb.db.tables.user_profiles[0].goals);
    const decoded = await page.evaluate((g) => REBUILT.Goals.decodeAll(g), goalRow);
    const withStep = decoded.find(g => g.steps && g.steps.length && g.steps.some(x => x.done));
    log(T('goal step + tick are stored on the server'), !!withStep, withStep ? `"${withStep.title}" steps=${withStep.steps.length} done=${withStep.steps.filter(x => x.done).length}` : JSON.stringify(goalRow).slice(0, 200));
    await shot('05-goals-connected');
    await page.reload(); await page.waitForSelector('#app:not([hidden]) .goal', { timeout: 8000 }); await settle();
    log(T('reload keeps the session (straight back to the same page, no gate)'), (await page.$('.gate__card')) === null);
    const pctText = await page.$$eval('.goal__pct', els => els.map(e => e.textContent.trim()));
    log(T('goal progress survives a reload (loaded from the server)'), pctText.includes('100%'), pctText.join(','));
    const habitsAfterReload = await page.evaluate(() => REBUILT.App.state.habits.map(h => h.title));
    log(T('habits survive a reload'), habitsAfterReload.includes('شرب المياه'), habitsAfterReload.join(','));

    // ---------- 7. settings (connected): change password ----------
    await page.evaluate(() => REBUILT.Router.navigateTo('settings')); await page.waitForSelector('#password-form'); await settle();
    log(T('settings: import/demo/wipe hidden for a connected account'), (await page.$('#load-demo-btn')) === null && (await page.$('#reset-empty-btn')) === null && (await page.$('.notice--info')) !== null);
    await shot('06-settings-connected');
    log(T('settings: password hint states the 8-character minimum'), /8 حروف/.test(await page.$eval('#password-form [data-field=password]', e => e.textContent)));
    await page.fill('#password-form [name=password]', 'abcdefg'); await page.fill('#password-form [name=confirmPassword]', 'abcdefg');
    await page.click('#pw-submit'); await settle(200);
    log(T('settings: 7-character new password refused inline, no server call'),
        (await page.$eval('#password-form [data-field=password]', e => e.classList.contains('is-invalid'))) && (await authCalls()).filter(c => c.fn === 'updateUser').length === 0);
    await page.fill('#password-form [name=password]', PW2); await page.fill('#password-form [name=confirmPassword]', 'different');
    await page.click('#pw-submit'); await settle(200);
    const mismatch = await page.$eval('[data-field=confirmPassword]', e => e.classList.contains('is-invalid'));
    log(T('settings: mismatched confirmation is rejected before any request'), mismatch && !(await authCalls()).some(c => c.fn === 'updateUser'));
    await page.fill('#password-form [name=confirmPassword]', PW2); await page.click('#pw-submit'); await settle(600);
    log(T('settings: valid password change calls the auth API once'), (await authCalls()).filter(c => c.fn === 'updateUser').length === 1);
    const pwNow = await sbEval(() => window.__sb.db.users[0].password);
    log(T('settings: new password is the one stored'), pwNow === PW2);
    // the server is the second line of defence: if a short password ever reached it, its error is shown in Arabic with the real minimum
    const serverRefusal = await page.evaluate(() => REBUILT.Auth.updatePassword('1234567'));
    log(T('server-side refusal of a short password maps to the Arabic 8-character message'), serverRefusal.ok === false && /8/.test(serverRefusal.error), serverRefusal.error);

    // ---------- 8. sign out: no confirm; local cache wiped ----------
    await page.click('#sign-out-btn'); await page.waitForSelector('.landing', { timeout: 8000 });
    const cache = await page.evaluate(() => { const raw = localStorage.getItem(REBUILT.Data.STORAGE_KEY); if (!raw) return null; const st = JSON.parse(raw); return { email: st.user && st.user.email, habits: (st.habits || []).length, goals: (st.goals || []).length, tasks: (st.tasks || []).length }; });
    log(T('sign-out: no confirm dialog, lands on welcome, previous account data not left on the device'), cache === null || (!cache.email && !cache.habits && !cache.goals && !cache.tasks), JSON.stringify(cache));

    // ---------- 9. forgot password (request) ----------
    await page.click('[data-go="signin"]'); await page.waitForSelector('#auth-form'); await page.click('[data-go="forgot"]'); await page.waitForSelector('#forgot-form');
    await shot('07-forgot');
    await page.click('#forgot-submit'); await settle(150);
    log(T('forgot: empty e-mail is rejected inline'), await page.$eval('[data-field=email]', e => e.classList.contains('is-invalid')));
    await page.fill('#f-email', EMAIL); await page.click('#forgot-submit'); await page.waitForSelector('#resend-btn');
    const calls = (await authCalls()).filter(c => c.fn === 'resetPasswordForEmail');
    log(T('forgot: recovery code requested once, with NO redirect link (nothing in this flow opens a link)'), calls.length === 1 && calls[0].redirectTo === undefined, JSON.stringify(calls[0]));
    log(T('forgot: resend is on cooldown'), await page.$eval('#resend-btn', e => e.disabled));
    await shot('08-forgot-sent');

    // ---------- 10. recovery link (ready) ----------
    await page.goto('about:blank'); await page.goto(base + '/#access_token=fake&refresh_token=fake&expires_in=3600&token_type=bearer&type=recovery');
    await page.waitForSelector('#reset-form', { timeout: 8000 });
    log(T('recovery link opens the new-password screen (not the app)'), (await page.$('#app:not([hidden])')) === null);
    log(T('recovery tokens are removed from the address bar'), (await page.evaluate(() => location.hash)) === '');
    await shot('09-reset');
    await page.fill('#f-password', 'abc'); await page.fill('#f-confirmPassword', 'abc'); await page.click('#reset-submit'); await settle(200);
    log(T('reset: too-short password is rejected inline'), await page.$eval('[data-field=password]', e => e.classList.contains('is-invalid')));
    await page.fill('#f-password', 'Another-pass-789'); await page.fill('#f-confirmPassword', 'Another-pass-789');
    await page.click('#reset-submit'); await page.waitForSelector('.gate__state-ico--ok', { timeout: 6000 });
    await shot('10-reset-done');
    const upd = (await authCalls()).filter(c => c.fn === 'updateUser');
    log(T('reset: password updated through the auth API'), upd.length >= 1);
    await page.click('[data-go="continue"]'); await page.waitForSelector('#app:not([hidden]) .hero, #app:not([hidden]) .page-content', { timeout: 8000 });
    log(T('reset: continue lands inside the app'), true);

    // ---------- 11. recovery link (expired) ----------
    const page2 = await ctx.newPage();
    page2.on('pageerror', e => errors.push('pageerror(2): ' + e.message));
    await page2.route('**/*', route => {
      const u = route.request().url();
      if (u.startsWith(base)) return serveLocal(route);
      if (/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/.test(u)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE });
      return route.abort();
    });
    await page2.evaluate(() => 0);
    await page2.goto(base + '/'); await page2.evaluate(() => { window.__sb.db.sessionUserId = null; localStorage.setItem('__fakesb', JSON.stringify(window.__sb.db)); });
    await page2.goto('about:blank'); await page2.goto(base + '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await page2.waitForSelector('.gate__state', { timeout: 8000 });
    const expTitle = await page2.$eval('.gate__title', e => e.textContent);
    log(T('expired recovery link shows a clear recovery state'), /مش شغال/.test(expTitle), expTitle);
    await page2.screenshot({ path: `${OUT}/conn-${vp}-11-reset-expired.png`, fullPage: true });
    await page2.click('[data-go="forgot"]'); await page2.waitForSelector('#forgot-form');
    log(T('expired link: "request a new one" goes to the request form'), true);
    await page2.close();

    log(T('no console/page errors, no native dialogs'), errors.length === 0, errors.join(' | '));
    log(T('no requests to any AI/model endpoint or other external host'), external.length === 0, external.join(' | '));
    await ctx.close();
  }
  await browser.close();
  const fails = results.filter(r => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} passed`);
  fs.writeFileSync(OUT + '/connected-results.json', JSON.stringify(results, null, 1));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
