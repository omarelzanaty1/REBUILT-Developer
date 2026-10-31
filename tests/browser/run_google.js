// Browser simulation of GOOGLE sign-in and account LINKING, served under the published address
// (default: the GitHub Pages address of the stable site; RB_HOST=custom → https://getrebuilt.online/ where offered) against the Supabase test double
// (tests/fake-supabase.js: e-mailed 6-digit code, verifyOtp, expiry, replacement, quotas, rate limits).
// LOCAL SIMULATION: it proves what the app sends and how it reacts to each answer. What the real project
// answers is checked separately (SQL/HTTP checks and Supabase logs).
const { launch, ROOT, OUT, TESTS } = require('./_env');
const fs = require('fs'), path = require('path');
const FAKE = fs.readFileSync(TESTS + '/fake-supabase.js', 'utf8');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json', '.webmanifest':'application/manifest+json' };
const HOSTS = { pages: { origin: 'https://omarelzanaty1.github.io', base: '/rebuilt0.4/' } };
const HOST = HOSTS[process.env.RB_HOST || 'pages'];
const ORIGIN = HOST.origin, BASE = HOST.base, PROD = ORIGIN + BASE;
console.log('HOST UNDER TEST: ' + PROD);
const EMAIL = 'omar.test@example.com', PW1 = 'secret123', PW2 = 'newsecret456';
const results = [];
const log = (name, ok, detail) => { results.push({ name, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };


const HAB = '11111111-1111-4111-8111-111111111111', TSK = '22222222-2222-4222-8222-222222222222', TSK2 = '33333333-3333-4333-8333-333333333333';
const ACCOUNTS = [
  { sub: 'g-omar-same', email: EMAIL, name: 'Omar G', verified: true },               // same verified e-mail as the existing password account
  { sub: 'g-omar-alt', email: 'omar.alt@gmail.com', name: 'Omar Alt', verified: true }, // a different e-mail: only manual linking can attach it
  { sub: 'g-new', email: 'noor.new@gmail.com', name: 'نور', verified: true },           // nobody in REBUILT yet
  { sub: 'g-other', email: 'other@example.com', name: 'Ahmed', verified: true },        // already attached to someone else's account
];
const SEED = { users: [
    { id: 'u-seed', email: EMAIL, password: PW1, name: 'عمر', confirmed: true },
    { id: 'u-other', email: 'other@example.com', password: 'otherpass1', name: 'أحمد', confirmed: true,
      identities: [{ provider: 'email', email: 'other@example.com' }, { provider: 'google', email: 'other@example.com', sub: 'g-other' }] } ],
  sessionUserId: null, tokens: {}, otps: {}, outbox: [], mailCount: 0, lastMail: {},
  tables: {
    profiles: [{ id: 'u-seed', name: 'عمر', email: EMAIL, avatar: '', settings: {}, is_onboarded: true, created_at: '2026-10-01T00:00:00Z' },
               { id: 'u-other', name: 'أحمد', email: 'other@example.com', avatar: '', settings: {}, is_onboarded: true, created_at: '2026-10-01T00:00:00Z' }],
    user_profiles: [{ user_id: 'u-seed', occupation: '', occupation_custom: '', life_description: '', skills: [], hobbies: [], goals: [], challenges: '' },
                    { user_id: 'u-other', occupation: '', occupation_custom: '', life_description: '', skills: [], hobbies: [], goals: [], challenges: '' }],
    ai_profiles: [{ user_id: 'u-seed' }, { user_id: 'u-other' }],
    habits: [{ id: HAB, user_id: 'u-seed', title: 'قراءة 10 صفحات', description: '', icon: 'book', xp: 15, frequency: 'daily', target_days: [], time: null, created_at: '2026-10-01T00:00:00' }],
    tasks: [{ id: TSK, user_id: 'u-seed', title: 'مراجعة الخطة', description: '', priority: 'high', date: '2026-10-26', time: null, xp: 20, completed: false, completed_at: null, xp_awarded: 0, created_at: '2026-10-01T00:00:00' },
            { id: TSK2, user_id: 'u-other', title: 'مهمة أحمد', description: '', priority: 'low', date: '2026-10-26', time: null, xp: 10, completed: false, completed_at: null, xp_awarded: 0, created_at: '2026-10-01T00:00:00' }],
  } };
const google = (extra) => Object.assign({ enabled: true, manualLinking: true, accounts: ACCOUNTS, choose: null, manualReturn: false }, extra || {});

(async () => {
  const browser = await launch();
  async function session(cfg, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, locale: 'ar-EG', timezoneId: 'Africa/Cairo' });
    await ctx.addInitScript(([c, seed]) => {
      window.__SB_CFG = c;
      try { if (!localStorage.getItem('__fakesb')) localStorage.setItem('__fakesb', JSON.stringify(seed)); } catch (e) { /* about:blank */ }
    }, [cfg || {}, SEED]);
    const page = await ctx.newPage();
    const s = { ctx, page, errors: [], external: [], localhostHits: [], dialogs: [], settingsReqs: [] };
    page.on('pageerror', e => s.errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) s.errors.push('console: ' + m.text()); });
    page.on('dialog', d => { s.dialogs.push(d.type()); d.dismiss(); });
    await page.route('**/*', route => {
      const u = new URL(route.request().url());
      if (u.origin === ORIGIN && u.pathname.startsWith(BASE.replace(/\/$/, '') || '/')) {
        let p = u.pathname.slice(BASE.length).replace(/^\//, '');
        if (BASE !== '/' && u.pathname === BASE.replace(/\/$/, '')) p = '';
        if (p === '' || p === 'index.html') p = 'index.html';
        const f = path.join(ROOT, decodeURIComponent(p));
        if (!f.startsWith(ROOT) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
        return route.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
      }
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') { s.localhostHits.push(u.href); return route.abort('connectionrefused'); }
      if (/\.supabase\.co$/.test(u.hostname) && u.pathname === '/auth/v1/settings') {
        // Supabase's public settings endpoint, as the preflight sees it (cfg.settings: on | off | live | http500 | garbage | down | hang)
        const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey, authorization, content-type, x-client-info', 'access-control-allow-methods': 'GET, OPTIONS' };
        const rq = route.request();
        if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
        const h = rq.headers(); s.settingsReqs.push({ method: rq.method(), apikey: h['apikey'] || '', auth: h['authorization'] || '' });
        const mode = (cfg && cfg.settings) || 'on';   // default: the endpoint answers “Google on”, so the older scenarios exercise the client-side paths as before
        if (mode === 'down') return route.abort('connectionreset');
        if (mode === 'hang') return;                                                  // never answers → the 4 s timeout must let the redirect go ahead
        if (mode === 'http500') return route.fulfill({ status: 500, headers: cors, contentType: 'application/json', body: '{"msg":"boom"}' });
        if (mode === 'garbage') return route.fulfill({ status: 200, headers: cors, contentType: 'text/html', body: '<html>not json</html>' });
        const on = mode === 'on' || (mode === 'live' && !(cfg.google && cfg.google.enabled === false));
        return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ external: { email: true, google: on, github: false }, disable_signup: false, mailer_autoconfirm: false }) });
      }
      if (/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/.test(u.href)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE });
      if (/fonts\.(googleapis|gstatic)\.com/.test(u.hostname)) return route.abort();
      s.external.push(u.href); return route.abort();
    });
    s.sb = (fn, arg) => page.evaluate(fn, arg);
    s.calls = (name) => page.evaluate((n) => window.__sb.authCalls.filter(c => !n || c.fn === n), name);
    s.shot = (n) => page.screenshot({ path: `${OUT}/otp-${n}.png`, fullPage: true });
    return s;
  }
  const settle = (p, ms) => p.waitForTimeout(ms || 400);
  const notice = (p) => p.$eval('#gate-notice', e => e.textContent.trim()).catch(() => '');
  const calls = (s, fn) => s.calls(fn);
  const dbq = (s, fn, arg) => s.sb(fn, arg);
  const snapshotOf = (s, uid) => s.sb((id) => JSON.stringify({ habits: window.__sb.db.tables.habits.filter(r => r.user_id === id), tasks: window.__sb.db.tables.tasks.filter(r => r.user_id === id), profile: window.__sb.db.tables.profiles.filter(r => r.id === id), up: window.__sb.db.tables.user_profiles.filter(r => r.user_id === id) }), uid);
  const counts = (s) => s.sb(() => ({ users: window.__sb.db.users.length, profiles: window.__sb.db.tables.profiles.length, user_profiles: window.__sb.db.tables.user_profiles.length, ai_profiles: window.__sb.db.tables.ai_profiles.length }));
  const sessionUid = (s) => s.sb(() => window.__sb.db.sessionUserId);
  const inApp = (p) => p.waitForSelector('#app:not([hidden])', { timeout: 12000 });
  const identitiesOf = (s, uid) => s.sb((id) => (window.__sb.db.users.find(u => u.id === id).identities || [{ provider: 'email' }]).map(i => i.provider), uid);

  // the way back from Google is a full page load (the tab really leaves), not a change of #hash on the same page
  async function comeBack(s, url) { await s.page.goto('about:blank'); await s.page.goto(url); }
  async function boot(s) { await s.page.goto(PROD); await s.page.waitForSelector('.landing'); }
  async function toAuth(s, mode) {
    await s.page.goto(PROD); await s.page.waitForSelector('.landing');
    await s.page.click(`[data-go="${mode || 'signin'}"]`); await s.page.waitForSelector('#auth-form');
  }
  async function passwordLogin(s, email, pw) {
    await toAuth(s, 'signin');
    await s.page.fill('#f-email', email); await s.page.fill('#f-password', pw); await s.page.click('#auth-submit');
    await inApp(s.page);
  }
  async function signOut(s) {
    await s.page.evaluate(() => REBUILT.Router.navigateTo('settings')); await s.page.waitForSelector('#sign-out-btn');
    await s.page.click('#sign-out-btn'); await s.page.waitForSelector('.landing', { timeout: 8000 });
  }
  async function openSettings(s) {
    await s.page.evaluate(() => REBUILT.Router.navigateTo('settings')); await s.page.waitForSelector('#signin-methods:not([aria-busy])', { timeout: 8000 });
  }
  const methodsText = (s) => s.page.$eval('#signin-methods', e => e.textContent.replace(/\s+/g, ' ').trim());
  const clean = (s) => s.errors.length === 0 && s.localhostHits.length === 0 && s.external.length === 0 && s.dialogs.length === 0;
  const hashOf = (s) => s.page.evaluate(() => location.hash + '|' + location.search);


  for (const vp of ['desktop', 'mobile']) {
    const T = (n) => `${vp}: ${n}`;
    const mobile = vp === 'mobile';

    // =====================================================================
    // 1. The screen: official Google button, both modes, both widths
    // =====================================================================
    {
      const s = await session({ google: google() }, { mobile });
      await toAuth(s, 'signin');
      for (const mode of ['signin', 'signup']) {
        if (mode === 'signup') { await s.page.click('[data-authmode="signup"]'); await s.page.waitForSelector('#f-confirmPassword'); }
        const info = await s.page.evaluate(() => { const b = document.getElementById('google-btn'); const r = b.getBoundingClientRect(); const svg = b.querySelector('svg'); return { text: b.textContent.trim(), fills: [...svg.querySelectorAll('path')].map(p => p.getAttribute('fill')), w: Math.round(r.width), bg: getComputedStyle(b).backgroundColor, overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, divider: !!document.querySelector('.gate__divider'), above: b.getBoundingClientRect().top < document.getElementById('f-email').getBoundingClientRect().top }; });
        log(T(`1. ${mode}: «المتابعة باستخدام Google» with the four-colour Google G, above the e-mail form, with a divider`), info.text === 'المتابعة باستخدام Google' && info.fills.join() === '#EA4335,#4285F4,#FBBC05,#34A853' && info.divider && info.above, JSON.stringify(info.fills));
        log(T(`1. ${mode}: no horizontal scroll, button fills the card`), !info.overflow && info.w > 250, `w=${info.w}`);
        await s.shot(`google-${vp}-1-${mode}`);
      }
      log(T('1. "forgot password" and "create account" links are still there'), !!(await s.page.$('[data-authmode="signin"]')));
      await s.page.click('[data-authmode="signin"]'); await s.page.waitForSelector('[data-go="forgot"]');
      log(T('1. sign-in keeps «نسيت الباسورد؟»'), true);
      await s.page.fill('#f-email', EMAIL); await s.page.fill('#f-password', 'wrong-password'); await s.page.click('#auth-submit'); await s.page.waitForSelector('#gate-notice .notice--danger');
      const hint = await notice(s.page);
      log(T('1. wrong password: clear message plus a generic hint about Google (reveals nothing about the account)'), /غلط/.test(hint) && /Google/.test(hint), hint);
      log(T('1. clean (no page errors, no local/other requests)'), clean(s));
      await s.ctx.close();
    }

    // =====================================================================
    // 2. Google sign-in: a brand-new person, then the same person again
    // =====================================================================
    {
      const s = await session({ google: google({ choose: 'g-new' }) }, { mobile });
      await boot(s);
      const before = await counts(s);
      await toAuth(s, 'signup');
      await s.page.click('#google-btn');
      await s.page.waitForSelector('[data-go="next"]', { timeout: 12000 });   // onboarding, first step (only exists after the trip to Google)
      const oc = await calls(s, 'signInWithOAuth');
      log(T('2. ONE signInWithOAuth call: provider google, redirectTo = the app\'s own published address'), oc.length === 1 && oc[0].provider === 'google' && oc[0].redirectTo === PROD, JSON.stringify(oc[0]));
      log(T('2. no linkIdentity during a plain sign-in'), (await calls(s, 'linkIdentity')).length === 0);
      const after = await counts(s);
      log(T('2. a new person → exactly one new account and one row in each profile table'), after.users === before.users + 1 && after.profiles === before.profiles + 1 && after.user_profiles === before.user_profiles + 1 && after.ai_profiles === before.ai_profiles + 1, JSON.stringify(after));
      log(T('2. onboarding starts with the name Google sent'), (await s.page.$eval('#f-name', e => e.value)) === 'نور');
      log(T('2. the address is clean afterwards (no token, no error left in it)'), (await hashOf(s)).indexOf('access_token') < 0 && !/error|provider_token/.test(await hashOf(s)), await hashOf(s));
      log(T('2. the Google marker is gone after use'), (await s.page.evaluate(() => sessionStorage.getItem('rebuilt.oauth'))) === null);
      await s.shot(`google-${vp}-2-onboarding`);
      const uid = await sessionUid(s);
      await s.sb((id) => { window.__sb.db.tables.profiles.find(p => p.id === id).is_onboarded = true; localStorage.setItem('__fakesb', JSON.stringify(window.__sb.db)); }, uid);
      await s.page.goto(PROD); await inApp(s.page);
      await signOut(s);
      // …and again: the same Google identity returns to the SAME account
      await toAuth(s, 'signin'); await s.page.click('#google-btn'); await inApp(s.page);
      const again = await counts(s);
      log(T('2. signing in with Google again → the same account, straight into the app (no onboarding), nothing created'), (await sessionUid(s)) === uid && again.users === after.users && again.profiles === after.profiles && again.user_profiles === after.user_profiles && again.ai_profiles === after.ai_profiles);
      log(T('2. clean'), clean(s));
      await s.ctx.close();
    }

    // =====================================================================
    // 3. Google with the e-mail of an existing password account (Supabase's automatic link) — same account, data intact
    // =====================================================================
    {
      const s = await session({ google: google({ choose: 'g-omar-same' }) }, { mobile });
      await boot(s);
      const before = await snapshotOf(s, 'u-seed'), c0 = await counts(s);
      await toAuth(s, 'signin'); await s.page.click('#google-btn'); await inApp(s.page);
      log(T('3. same verified e-mail → the person lands in the EXISTING account (same id), no second account'), (await sessionUid(s)) === 'u-seed' && (await counts(s)).users === c0.users);
      log(T('3. their habits, tasks and profile are exactly as they were'), (await snapshotOf(s, 'u-seed')) === before);
      log(T('3. no extra profile rows were created by the sign-in'), JSON.stringify(await counts(s)) === JSON.stringify(c0));
      log(T('3. (the server linked the Google identity to that account: now e-mail + google)'), (await identitiesOf(s, 'u-seed')).join() === 'email,google');
      await signOut(s);
      await passwordLogin(s, EMAIL, PW1);
      log(T('3. the password still works afterwards'), (await sessionUid(s)) === 'u-seed');
      await s.ctx.close();
    }

    // =====================================================================
    // 4. Linking Google to the account you are signed in to
    // =====================================================================
    {
      const s = await session({ google: google({ choose: 'g-omar-alt' }) }, { mobile });
      await passwordLogin(s, EMAIL, PW1);
      const before = await snapshotOf(s, 'u-seed'), c0 = await counts(s);
      await openSettings(s);
      const m0 = await methodsText(s);
      log(T('4. Settings → «طرق تسجيل الدخول»: e-mail is on, Google offers «ربط حساب Google»'), /الإيميل والباسورد.*مفعّل/.test(m0) && /ربط حساب Google/.test(m0), m0);
      await s.shot(`google-${vp}-3-settings-before`);
      const overflow = await s.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      log(T('4. settings page has no horizontal scroll'), !overflow);
      await s.page.click('#link-google-btn');
      await s.page.waitForSelector('#link-notice .notice--success', { timeout: 12000 });
      const lc = await calls(s, 'linkIdentity'), oc = await calls(s, 'signInWithOAuth');
      log(T('4. linking uses linkIdentity ONCE and never signInWithOAuth (so no second user can be created)'), lc.length === 1 && lc[0].provider === 'google' && lc[0].redirectTo === PROD && oc.length === 0, JSON.stringify(lc[0]));
      log(T('4. back on Settings with a clear success message'), (await s.page.evaluate(() => REBUILT.Router.getCurrent())) === 'settings' && /اتربط حساب Google/.test(await s.page.$eval('#link-notice', e => e.textContent)));
      const m1 = await methodsText(s);
      log(T('4. the list now shows Google as linked, with the Google account\'s e-mail'), /Google.*omar\.alt@gmail\.com.*مرتبط/.test(m1) && !/ربط حساب Google/.test(m1), m1);
      await s.shot(`google-${vp}-4-settings-linked`);
      log(T('4. still the SAME account: same id, same number of accounts and profile rows'), (await sessionUid(s)) === 'u-seed' && JSON.stringify(await counts(s)) === JSON.stringify(c0));
      log(T('4. habits, tasks, profile unchanged after linking'), (await snapshotOf(s, 'u-seed')) === before);
      log(T('4. the Google marker is gone and the address is clean'), (await s.page.evaluate(() => sessionStorage.getItem('rebuilt.oauth'))) === null && !/access_token|error|provider_token/.test(await hashOf(s)));
      // sign out, then sign in with the LINKED Google account (different e-mail) → same account
      await signOut(s);
      await toAuth(s, 'signin'); await s.page.click('#google-btn'); await inApp(s.page);
      log(T('4. later, "continue with Google" using the linked account → the same account again (not a new one)'), (await sessionUid(s)) === 'u-seed' && JSON.stringify(await counts(s)) === JSON.stringify(c0));
      log(T('4. data still intact after signing in through Google'), (await snapshotOf(s, 'u-seed')) === before);
      // refreshing Settings keeps showing it as linked and offers no second link
      await openSettings(s);
      log(T('4. nothing offers to link it a second time'), !/ربط حساب Google/.test(await methodsText(s)));
      log(T('4. clean'), clean(s));
      await s.ctx.close();
    }

    // =====================================================================
    // 5. A Google account that already belongs to another REBUILT account
    // =====================================================================
    {
      const s = await session({ google: google({ choose: 'g-other' }) }, { mobile });
      await passwordLogin(s, EMAIL, PW1);
      const mine = await snapshotOf(s, 'u-seed'), theirs = await snapshotOf(s, 'u-other'), c0 = await counts(s);
      const theirIds = await identitiesOf(s, 'u-other');
      await openSettings(s);
      await s.page.click('#link-google-btn');
      await s.page.waitForSelector('#link-notice .notice--danger', { timeout: 12000 });
      const msg = await s.page.$eval('#link-notice', e => e.textContent.replace(/\s+/g, ' ').trim());
      log(T('5. refused with a clear, safe message that says what to do'), /مرتبط بحساب REBUILT تاني/.test(msg) && /مش هندمج/.test(msg) && /سجّل خروج/.test(msg), msg);
      log(T('5. still signed in to MY account; nothing was merged or moved'), (await sessionUid(s)) === 'u-seed' && (await snapshotOf(s, 'u-seed')) === mine && (await snapshotOf(s, 'u-other')) === theirs && (await identitiesOf(s, 'u-other')).join() === theirIds.join());
      log(T('5. no account created or removed'), JSON.stringify(await counts(s)) === JSON.stringify(c0));
      log(T('5. the list still offers to link (nothing was attached)'), /ربط حساب Google/.test(await methodsText(s)));
      log(T('5. the library never saw the error (it would have signed the user out)'), !(await s.sb(() => !!window.__sb.libraryErrorReached)));
      await s.shot(`google-${vp}-5-conflict`);
      log(T('5. clean'), clean(s));
      await s.ctx.close();
    }

    // =====================================================================
    // 6. Cancelling at Google never damages the session or the data
    // =====================================================================
    {
      // 6a: while signed out
      const s = await session({ google: google({ choose: 'cancel' }) }, { mobile });
      await boot(s);
      const snap = await snapshotOf(s, 'u-seed'), c0 = await counts(s);
      await toAuth(s, 'signin'); await s.page.click('#google-btn');
      await s.page.waitForSelector('#gate-notice .notice--danger', { timeout: 12000 });
      const msg = await notice(s.page);
      log(T('6a. cancelled sign-in: back on the sign-in screen with a calm message, no "expired link" screen'), /لغيت الدخول بـ Google/.test(msg) && !!(await s.page.$('#auth-form')) && !(await s.page.$('.gate__state')), msg);
      log(T('6a. no session, no accounts created, data untouched, address clean'), (await sessionUid(s)) === null && JSON.stringify(await counts(s)) === JSON.stringify(c0) && (await snapshotOf(s, 'u-seed')) === snap && !/access_token|error|provider_token/.test(await hashOf(s)));
      await s.shot(`google-${vp}-6-cancel-signin`);
      await s.page.fill('#f-email', EMAIL); await s.page.fill('#f-password', PW1); await s.page.click('#auth-submit'); await inApp(s.page);
      log(T('6a. e-mail + password sign-in works right after'), (await sessionUid(s)) === 'u-seed');
      await s.ctx.close();
    }
    {
      // 6b: while signed in (linking)
      const s = await session({ google: google({ choose: 'cancel' }) }, { mobile });
      await passwordLogin(s, EMAIL, PW1);
      const snap = await snapshotOf(s, 'u-seed'), c0 = await counts(s);
      await openSettings(s); await s.page.click('#link-google-btn');
      await s.page.waitForSelector('#link-notice .notice--danger', { timeout: 12000 });
      const msg = await s.page.$eval('#link-notice', e => e.textContent.trim());
      log(T('6b. cancelled link: message says nothing changed'), /لغيت ربط Google/.test(msg) && /زي ما هو/.test(msg), msg);
      log(T('6b. STILL signed in to the same account (the session survived)'), (await sessionUid(s)) === 'u-seed' && (await s.page.$eval('#app', e => !e.hidden)));
      log(T('6b. data and account counts untouched; Google still not linked'), (await snapshotOf(s, 'u-seed')) === snap && JSON.stringify(await counts(s)) === JSON.stringify(c0) && (await identitiesOf(s, 'u-seed')).join() === 'email');
      log(T('6b. the error never reached the library (so it could not end the session)'), !(await s.sb(() => !!window.__sb.libraryErrorReached)));
      await s.page.reload(); await inApp(s.page);
      log(T('6b. after a reload the person is still signed in'), (await sessionUid(s)) === 'u-seed');
      await s.ctx.close();
    }

    // =====================================================================
    // 7. Google not switched on / linking not allowed on the server → honest messages, nothing breaks
    // =====================================================================
    {
      const s = await session({ google: google({ enabled: false, choose: 'g-new' }) }, { mobile });
      await toAuth(s, 'signin'); await s.page.click('#google-btn');
      await s.page.waitForSelector('#gate-notice .notice--danger');
      const msg = await notice(s.page);
      log(T('7a. Google not enabled on the server → says so plainly, stays on the screen, button usable again'), /لسه مش متفعّل/.test(msg) && !(await s.page.$eval('#google-btn', e => e.disabled)), msg);
      log(T('7a. nothing left behind (no marker, no session)'), (await s.page.evaluate(() => sessionStorage.getItem('rebuilt.oauth'))) === null && (await sessionUid(s)) === null);
      await s.page.fill('#f-email', EMAIL); await s.page.fill('#f-password', PW1); await s.page.click('#auth-submit'); await inApp(s.page);
      log(T('7a. password sign-in unaffected'), (await sessionUid(s)) === 'u-seed');
      await s.ctx.close();
    }
    {
      const s = await session({ google: google({ manualLinking: false, choose: 'g-omar-alt' }) }, { mobile });
      await passwordLogin(s, EMAIL, PW1);
      await openSettings(s); await s.page.click('#link-google-btn');
      await s.page.waitForSelector('#link-notice .notice--danger');
      const msg = await s.page.$eval('#link-notice', e => e.textContent.trim());
      log(T('7b. manual linking switched off on the server → clear message, account untouched, still signed in'), /مش متفعّل في إعدادات السيرفر/.test(msg) && (await sessionUid(s)) === 'u-seed' && (await identitiesOf(s, 'u-seed')).join() === 'email', msg);
      log(T('7b. the button works again afterwards'), !(await s.page.$eval('#link-google-btn', e => e.disabled)));
      await s.ctx.close();
    }

    // =====================================================================
    // 8. Coming back in an unexpected way
    // =====================================================================
    {
      const s = await session({ google: google({ choose: 'g-omar-alt', manualReturn: true }) }, { mobile });
      await passwordLogin(s, EMAIL, PW1);
      await openSettings(s); await s.page.click('#link-google-btn');
      await s.page.waitForFunction(() => !!window.__sb.googleReturnUrl);
      const back = await s.sb(() => window.__sb.googleReturnUrl);
      // the marker says the link was started by someone else: the return must not be reported as a success
      await s.page.evaluate(() => { const m = JSON.parse(sessionStorage.getItem('rebuilt.oauth')); m.uid = 'someone-else'; sessionStorage.setItem('rebuilt.oauth', JSON.stringify(m)); });
      await comeBack(s, back); await inApp(s.page); await s.page.waitForSelector('#link-notice .notice--danger', { timeout: 8000 });
      const msg = await s.page.$eval('#link-notice', e => e.textContent.trim());
      log(T('8a. a return that belongs to a different account is NOT reported as linked'), /مختلف عن الحساب اللي بدأت منه/.test(msg) && !(await s.page.$('#link-notice .notice--success')), msg);
      await s.ctx.close();
    }
    {
      const s = await session({ google: google({ choose: 'g-omar-alt', manualReturn: true }) }, { mobile });
      await passwordLogin(s, EMAIL, PW1);
      await openSettings(s); await s.page.click('#link-google-btn');
      await s.page.waitForFunction(() => !!window.__sb.googleReturnUrl);
      const back = await s.sb(() => window.__sb.googleReturnUrl);
      await s.page.evaluate(() => sessionStorage.removeItem('rebuilt.oauth'));   // e.g. the browser dropped tab storage
      await comeBack(s, back); await inApp(s.page);
      await s.page.waitForTimeout(500);
      log(T('8b. a return without our marker still signs in normally and claims nothing'), (await sessionUid(s)) === 'u-seed' && !(await s.page.$('.toast--success')) && !(await s.page.$('#link-notice .notice--success')));
      await s.ctx.close();
    }
    {
      // an old marker (older than 15 minutes) is ignored
      const s = await session({ google: google({ choose: 'g-new' }) }, { mobile });
      await s.page.goto(PROD); await s.page.waitForSelector('.landing');
      await s.page.evaluate(() => sessionStorage.setItem('rebuilt.oauth', JSON.stringify({ mode: 'link', uid: 'u-seed', t: Date.now() - 20 * 60 * 1000 })));
      await s.page.reload(); await s.page.waitForSelector('.landing');
      const r = await s.page.evaluate(() => REBUILT.Auth.parseAuthReturn({ hash: '#access_token=x', search: '' }, null));
      log(T('8c. a stale marker is ignored (no marker → nothing claimed)'), r.kind === 'none');
      await s.ctx.close();
    }

    // =====================================================================
    // 9. Double clicks
    // =====================================================================
    {
      const s = await session({ latency: 700, google: google({ choose: 'g-new', manualReturn: true }) }, { mobile });
      await toAuth(s, 'signin');
      await s.page.click('#google-btn', { clickCount: 4, delay: 15 });
      await s.page.waitForFunction(() => !!window.__sb.googleReturnUrl, null, { timeout: 8000 });
      await s.page.waitForTimeout(400); await s.page.click('#google-btn', { force: true }).catch(() => {});
      await s.page.waitForTimeout(900);
      log(T('9a. several clicks on «المتابعة باستخدام Google» → ONE request'), (await calls(s, 'signInWithOAuth')).length === 1, String((await calls(s, 'signInWithOAuth')).length));
      await s.ctx.close();
    }
    {
      const s = await session({ latency: 700, google: google({ choose: 'g-omar-alt', manualReturn: true }) }, { mobile });
      await passwordLogin(s, EMAIL, PW1); await openSettings(s);
      await s.page.click('#link-google-btn', { clickCount: 4, delay: 15 });
      await s.page.waitForFunction(() => !!window.__sb.googleReturnUrl, null, { timeout: 8000 });
      await s.page.waitForTimeout(900);
      log(T('9b. several clicks on «ربط حساب Google» → ONE request'), (await calls(s, 'linkIdentity')).length === 1, String((await calls(s, 'linkIdentity')).length));
      await s.ctx.close();
    }

    // =====================================================================
    // 10. Allow-list: the return address is exactly the published one
    // =====================================================================
    {
      const s = await session({ siteUrl: 'http://localhost:3000', allowList: [PROD], google: google({ choose: 'g-new' }) }, { mobile });
      await toAuth(s, 'signin'); await s.page.click('#google-btn');
      await s.page.waitForSelector('[data-go="next"]', { timeout: 12000 });
      log(T('10. with the published address on the allow-list, Google returns to it (never to a local address)'), s.localhostHits.length === 0 && (await calls(s, 'signInWithOAuth'))[0].redirectTo === PROD);
      await s.ctx.close();
    }

    // =====================================================================
    // 11. Preflight: Supabase's public settings say Google is OFF → never leave the app for the raw JSON error page
    // =====================================================================
    {
      const s = await session({ settings: 'off', google: google({ choose: 'g-new' }) }, { mobile });
      await toAuth(s, 'signin'); await s.page.click('#google-btn');
      await s.page.waitForSelector('#gate-notice .notice--danger');
      const msg = await notice(s.page);
      await s.shot('google-off-' + (mobile ? 'm' : 'd'));
      log(T('11a. settings say Google is OFF → plain Egyptian message inside the app'), /لسه مش متفعّل/.test(msg) && !/Unsupported|provider is not enabled/i.test(msg), msg);
      log(T('11a. …and the browser never left for /auth/v1/authorize (no OAuth call at all, no marker, no session)'), (await calls(s, 'signInWithOAuth')).length === 0 && (await s.page.evaluate(() => sessionStorage.getItem('rebuilt.oauth'))) === null && (await sessionUid(s)) === null && s.page.url().startsWith(PROD.replace(/\/$/, '')));
      log(T('11a. the button is usable again, e-mail sign-in still works'), !(await s.page.$eval('#google-btn', e => e.disabled)));
      await s.page.fill('#f-email', EMAIL); await s.page.fill('#f-password', PW1); await s.page.click('#auth-submit'); await inApp(s.page);
      log(T('11a. password sign-in unaffected'), (await sessionUid(s)) === 'u-seed');
      const r = s.settingsReqs[0] || {};
      log(T('11a. the settings call is a plain GET with the PUBLISHABLE key only (no session token, no secret)'), s.settingsReqs.length >= 1 && s.settingsReqs.every(q => q.method === 'GET' && /^sb_publishable_/.test(q.apikey) && q.auth === ''), JSON.stringify(r).slice(0, 80));
      await s.ctx.close();
    }
    {
      const s = await session({ settings: 'on', google: google({ choose: 'g-new' }) }, { mobile });
      await toAuth(s, 'signin'); await s.page.click('#google-btn');
      await s.page.waitForSelector('[data-go="next"]', { timeout: 12000 });
      const c = await calls(s, 'signInWithOAuth');
      log(T('11b. settings say Google is ON → normal flow, ONE OAuth call to the published address'), c.length === 1 && c[0].provider === 'google' && c[0].redirectTo === PROD, JSON.stringify(c));
      await s.ctx.close();
    }
    for (const mode of ['http500', 'garbage', 'down', 'hang']) {
      const s = await session({ settings: mode, google: google({ choose: 'g-new' }) }, { mobile });
      await toAuth(s, 'signin'); await s.page.click('#google-btn');
      await s.page.waitForSelector('[data-go="next"]', { timeout: 15000 });
      const c = await calls(s, 'signInWithOAuth');
      log(T(`11c. settings unavailable (${mode}) → unknown, so the normal flow still goes ahead (fail-open)`), c.length === 1 && (await sessionUid(s)) !== null, String(c.length));
      await s.ctx.close();
    }
    {
      const s = await session({ settings: 'off', google: google({ choose: 'g-omar-alt' }) }, { mobile });
      await passwordLogin(s, EMAIL, PW1); await openSettings(s);
      await s.page.click('#link-google-btn');
      await s.page.waitForSelector('#link-notice .notice--danger, #link-notice .notice', { timeout: 8000 });
      await s.page.waitForTimeout(400);
      const txt = await s.page.$eval('#link-notice', e => e.textContent.trim());
      log(T('11d. linking while Google is OFF → clear message, zero linkIdentity calls, still signed in, identities untouched'), /لسه مش متفعّل/.test(txt) && (await calls(s, 'linkIdentity')).length === 0 && (await sessionUid(s)) === 'u-seed' && (await identitiesOf(s, 'u-seed')).join() === 'email' && (await s.page.evaluate(() => sessionStorage.getItem('rebuilt.oauth'))) === null, txt);
      await s.ctx.close();
    }
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log('FAILED:\n' + failed.map(f => ' - ' + f.name).join('\n')); }
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
