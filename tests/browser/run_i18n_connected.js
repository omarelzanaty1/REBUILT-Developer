// ENGLISH + LIGHT in connected mode (Supabase test double): Google sign-in / linking, e-mail sign-in, data untouched.
// (harness copied from run_google.js; the scenarios below are new)
// Original header: Browser simulation of GOOGLE sign-in and account LINKING, served under the published address
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
      try { if (!localStorage.getItem('__seededprefs')) { localStorage.setItem('rebuilt_prefs_v1', JSON.stringify({ lang: 'en', theme: 'light' })); localStorage.setItem('__seededprefs', '1'); } } catch (e) { /* about:blank */ }
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



  const ARABIC = /[؀-ۿ]/;
  const MINE = ['قراءة 10 صفحات', 'مراجعة الخطة', 'عمر', 'ع'];   // …and the initial of the person's name in the avatar
const uiText = (p, sels) => p.evaluate((q) => q.map((x) => { const n = document.querySelector(x); if (!n) return ''; const c = n.cloneNode(true); c.querySelectorAll('[lang], script, style, svg').forEach((e) => e.remove()); return c.innerText || ''; }).join('\n'), sels);   // the person's own data (Arabic in the test double): never translated
  const strip = (t) => { MINE.forEach((m) => { t = t.split(m).join(''); }); return t; };
  const attrsOf = (p) => p.evaluate(() => { const h = document.documentElement; return h.getAttribute('lang') + '|' + h.getAttribute('dir') + '|' + h.getAttribute('data-theme'); });

  for (const vp of ['desktop', 'mobile']) {
    const T = (n) => `${vp}: ${n}`;
    const mobile = vp === 'mobile';

    // 1. the sign-in screen in English
    {
      const s = await session({ google: google() }, { mobile });
      await toAuth(s, 'signin');
      log(T('1. the app starts English / LTR / light from the saved choice'), (await attrsOf(s.page)) === 'en|ltr|light', await attrsOf(s.page));
      for (const mode of ['signin', 'signup']) {
        if (mode === 'signup') { await s.page.click('[data-authmode="signup"]'); await s.page.waitForSelector('#f-confirmPassword'); }
        const info = await s.page.evaluate(() => { const b = document.getElementById('google-btn'); const svg = b.querySelector('svg'); const r = b.getBoundingClientRect(); return { text: b.textContent.trim(), fills: [...svg.querySelectorAll('path')].map(p => p.getAttribute('fill')), w: r.width, overflow: document.documentElement.scrollWidth > window.innerWidth + 1 }; });
        log(T(`1. ${mode}: the Google button reads «Continue with Google», with the four-colour G untouched`), info.text === 'Continue with Google' && info.fills.join() === '#EA4335,#4285F4,#FBBC05,#34A853' && !info.overflow, JSON.stringify(info));
        log(T(`1. ${mode}: the whole screen is English`), !ARABIC.test(await uiText(s.page, ['#gate-root'])));
        await s.page.screenshot({ path: `${OUT}/i18n-connected-${vp}-${mode}.png` });
      }
      await s.page.click('[data-authmode="signin"]'); await s.page.waitForSelector('[data-go="forgot"]');
      await s.page.fill('#f-email', EMAIL); await s.page.fill('#f-password', 'wrong-password'); await s.page.click('#auth-submit'); await s.page.waitForSelector('#gate-notice .notice--danger');
      const hint = await notice(s.page);
      log(T('1. wrong password: an English message, with the same generic Google hint'), !ARABIC.test(hint) && /Google/.test(hint) && /password|incorrect|wrong/i.test(hint), hint);
      log(T('1. clean (no page errors, no local/other requests)'), clean(s));
      await s.ctx.close();
    }

    // 2. Google sign-in in English: the same call as in Arabic; onboarding opens in English
    {
      const s = await session({ google: google({ choose: 'g-new' }) }, { mobile });
      await toAuth(s, 'signup');
      await s.page.click('#google-btn');
      await s.page.waitForSelector('[data-go="next"]', { timeout: 12000 });
      const oc = await calls(s, 'signInWithOAuth');
      log(T('2. Google sign-in in English: ONE signInWithOAuth call, provider google, redirectTo = the published address'), oc.length === 1 && oc[0].provider === 'google' && oc[0].redirectTo === PROD, JSON.stringify(oc[0]));
      log(T('2. coming back from Google keeps English / light'), (await attrsOf(s.page)) === 'en|ltr|light', await attrsOf(s.page));
      const t = strip(await uiText(s.page, ['#gate-root']));
      log(T('2. onboarding after Google is English (the name Google sent is the only non-English text)'), !ARABIC.test(t.replace('نور', '')), t.replace(/\s+/g, ' ').slice(0, 90));
      log(T('2. clean'), clean(s));
      await s.ctx.close();
    }

    // 3. an existing person: language / theme changes touch nothing in the database
    {
      const s = await session({ google: google() }, { mobile });
      await passwordLogin(s, EMAIL, PW1);
      log(T('3. signed in: the app is English / light'), (await attrsOf(s.page)) === 'en|ltr|light');
      const uid = await sessionUid(s);
      await s.page.waitForTimeout(500);
      const dbBefore = await s.sb(() => JSON.stringify(window.__sb.db.tables));
      const names = ['dashboard', 'habits', 'tasks', 'goals', 'planner', 'analytics', 'achievements', 'ai', 'profile', 'settings'];
      for (const [lang, theme] of [['ar', 'dark'], ['en', 'dark'], ['ar', 'light'], ['en', 'light']]) {
        await s.page.evaluate(([l, th]) => { REBUILT.I18n.setLang(l); REBUILT.Theme.setPref(th); }, [lang, theme]);
        for (const n of names) {
          await s.page.evaluate((x) => REBUILT.Router.navigateTo(x), n); await s.page.waitForTimeout(150);
          if (lang === 'en') {
            let txt = await uiText(s.page, ['#page-content', '#sidebar', '#topbar', '#bottom-nav']);
            txt = strip(txt);
            if (ARABIC.test(txt)) log(T(`3. ${n} · ${lang} · ${theme}: no Arabic left`), false, txt.split('\n').filter((l) => ARABIC.test(l)).join(' ¦ ').slice(0, 120));
          }
        }
      }
      log(T('3. every page in English (dark and light) had no Arabic interface text left'), true);
      await s.page.waitForTimeout(600);
      const dbAfter = await s.sb(() => JSON.stringify(window.__sb.db.tables));
      log(T('3. the database rows (habits, tasks, profiles, settings…) are byte-identical after 40 page views in both languages and themes'), dbBefore === dbAfter);
      const habit = await s.page.evaluate(() => { REBUILT.I18n.setLang('en'); REBUILT.Router.navigateTo('habits'); return new Promise((r) => setTimeout(() => r([...document.querySelectorAll('.row--habit')].map((e) => e.textContent)), 250)); });
      log(T('3. the habit written in Arabic is shown exactly as written, in the English interface'), habit.some((x) => x.includes('قراءة 10 صفحات')));
      // linking Google in English: the same single linkIdentity call
      await openSettings(s);
      const mt = await methodsText(s);
      log(T('3. Settings → sign-in methods is English'), !ARABIC.test(mt) && /Google/.test(mt), mt.slice(0, 120));
      await s.page.click('#link-google-btn'); await s.page.waitForTimeout(600);
      const lc = await calls(s, 'linkIdentity'), oc = await calls(s, 'signInWithOAuth');
      log(T('3. linking Google in English: ONE linkIdentity call (provider google), never signInWithOAuth'), lc.length === 1 && lc[0].provider === 'google' && oc.length === 0, JSON.stringify(lc[0] || null));
      log(T('3. clean'), clean(s));
      await s.ctx.close();
    }

    // 4. sign out and in: the choice stays
    {
      const s = await session({ google: google() }, { mobile });
      await passwordLogin(s, EMAIL, PW1);
      await s.page.evaluate(() => { REBUILT.I18n.setLang('ar'); REBUILT.Theme.setPref('system'); });
      await signOut(s);
      log(T('4. after sign-out: Arabic + System are still chosen and the sign-in screen is Arabic'), (await s.page.evaluate(() => document.documentElement.getAttribute('lang') + '|' + document.documentElement.getAttribute('data-theme-pref'))) === 'ar|system' && ARABIC.test(await s.page.evaluate(() => document.getElementById('gate-root').innerText)));
      await toAuth(s, 'signin'); await s.page.fill('#f-email', EMAIL); await s.page.fill('#f-password', PW1); await s.page.click('#auth-submit'); await inApp(s.page);
      log(T('4. after signing in again: still Arabic + System'), (await s.page.evaluate(() => document.documentElement.getAttribute('lang') + '|' + document.documentElement.getAttribute('data-theme-pref'))) === 'ar|system');
      await s.ctx.close();
    }
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log('FAILED:\n' + failed.map((f) => ' - ' + f.name).join('\n')); process.exit(1); }
})().catch((e) => { console.error('HARNESS', e); process.exit(2); });
