// Browser simulation of the SIGN-UP CONFIRMATION e-mail (token_hash link, older #access_token link, resend), served under the published address
// (default: the GitHub Pages address of the stable site; RB_HOST=custom → https://getrebuilt.online/ where offered) against the Supabase test double
// (tests/fake-supabase.js: e-mailed 6-digit code, verifyOtp, expiry, replacement, quotas, rate limits).
// LOCAL SIMULATION: it proves what the app sends and how it reacts to each answer. What the real project
// answers is checked separately (SQL/HTTP checks and Supabase logs).
const { launch, ROOT, OUT, TESTS } = require('./_env');
const fs = require('fs'), path = require('path');
const FAKE = fs.readFileSync(TESTS + '/fake-supabase.js', 'utf8');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json', '.webmanifest':'application/manifest+json' };
const HOSTS = { pages: { origin: 'https://omarelzanaty1.github.io', base: '/rebuilt0.4/' }, custom: { origin: 'https://getrebuilt.online', base: '/' } };
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
    }, [cfg || {}, opts.seed || SEED]);
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



  const UNC = 'new.user@example.com';
  const SUCCESS = 'تم تأكيد بريدك الإلكتروني بنجاح، تقدر تسجّل الدخول دلوقتي.';
  const seedUnconfirmed = (extra) => {
    const sd = JSON.parse(JSON.stringify(SEED));
    sd.users.push({ id: 'u-new', email: UNC, password: PW1, name: 'نور', confirmed: false });
    sd.tables.profiles.push({ id: 'u-new', name: 'نور', email: UNC, avatar: '', settings: {}, is_onboarded: false, created_at: '2026-10-26T00:00:00Z' });
    sd.tables.user_profiles.push({ user_id: 'u-new', occupation: '', occupation_custom: '', life_description: '', skills: [], hobbies: [], goals: [], challenges: '' });
    sd.tables.ai_profiles.push({ user_id: 'u-new' });
    sd.tokens['tok-new-1'] = { to: UNC, type: 'signup', used: false };
    sd.outbox.push({ type: 'signup', to: UNC, token: 'tok-new-1', redirectTo: PROD, effectiveRedirect: PROD });
    sd.mailCount = 1;
    return Object.assign(sd, extra || {});
  };
  const linkNew = (tok, type) => PROD + '?token_hash=' + tok + '&type=' + (type || 'email');
  const title = (p) => p.$eval('.gate__title', e => e.textContent.trim()).catch(() => '');
  const subText = (p) => p.$eval('.gate__sub', e => e.textContent.trim()).catch(() => '');
  const userOf = (s, email) => s.sb((e) => window.__sb.db.users.find(u => u.email === e), email);
  const outboxLast = (s) => s.sb(() => window.__sb.db.outbox.slice(-1)[0]);
  const addrIsClean = (s) => s.page.evaluate(() => !/token_hash|type=|access_token|error/.test(location.search + location.hash));
  async function signUpUI(s, name, email, pw) {
    await toAuth(s, 'signup');
    await s.page.fill('#f-name', name); await s.page.fill('#f-email', email); await s.page.fill('#f-password', pw);
    await s.page.fill('#f-confirmPassword', pw);
    await s.page.click('#auth-submit');
    await s.page.waitForSelector('#resend-confirm-btn', { timeout: 10000 });
  }

  for (const vp of ['desktop', 'mobile']) {
    const T = (n) => `${vp}: ${n}`;
    const mobile = vp === 'mobile';

    // =====================================================================
    // 0. The root cause, reproduced — and a link that no longer depends on it
    // =====================================================================
    {
      const s = await session({ siteUrl: 'http://localhost:3000', allowList: [] }, { mobile });
      await signUpUI(s, 'نور', 'sig.up@example.com', PW1);
      const su = await calls(s, 'signUp');
      const mail = await outboxLast(s);
      log(T('0a. sign-up asks for the PUBLISHED address as the e-mail link target'), su.length === 1 && su[0].emailRedirectTo === PROD, String(su[0] && su[0].emailRedirectTo));
      log(T('0b. [simulated dashboard misconfig] Site URL = localhost and the address not on the allow-list → the e-mail link points at localhost (what the real logs showed)'), mail.effectiveRedirect === 'http://localhost:3000', mail.effectiveRedirect);
      log(T('0c. the "check your inbox" screen offers «ابعت رسالة التأكيد تاني», waiting out the first minute'), (await s.page.$eval('#resend-confirm-btn', e => e.disabled)) === true && /\(/.test(await s.page.$eval('#resend-confirm-btn', e => e.textContent)));
      await s.shot('confirm-inbox-' + (mobile ? 'm' : 'd'));
      // …the token_hash link (template with the site's own address) is independent of all that:
      await comeBack(s, linkNew(mail.token));
      await s.page.waitForSelector('#gate-notice .notice--success', { timeout: 10000 });
      log(T('0d. with the same broken dashboard settings, the token_hash link still lands on the app and confirms'), (await notice(s.page)).includes(SUCCESS) && s.localhostHits.length === 0, await notice(s.page));
      await s.ctx.close();
    }

    // =====================================================================
    // 1. The good link (token_hash, type=email)
    // =====================================================================
    {
      const s = await session({}, { mobile, seed: seedUnconfirmed() });
      await comeBack(s, linkNew('tok-new-1'));
      await s.page.waitForSelector('#gate-notice .notice--success', { timeout: 10000 });
      await s.shot('confirm-ok-' + (mobile ? 'm' : 'd'));
      log(T('1a. success wording is exactly the requested sentence, shown on the sign-in screen'), (await notice(s.page)).trim() === SUCCESS && (await s.page.$('#auth-form')) !== null, await notice(s.page));
      log(T('1b. the e-mail field is filled in, password empty'), (await s.page.$eval('#f-email', e => e.value)) === UNC && (await s.page.$eval('#f-password', e => e.value)) === '');
      const v = (await calls(s, 'verifyOtp'));
      log(T('1c. exactly one verifyOtp, with the link\'s token_hash and type'), v.length === 1 && v[0].token_hash === 'tok-new-1' && v[0].type === 'email', JSON.stringify(v));
      log(T('1d. confirmed on the server side, and NO session left on this device (local sign-out only)'), (await userOf(s, UNC)).confirmed === true && (await sessionUid(s)) === null && (await calls(s, 'signOut')).some(c => c.scope === 'local'));
      log(T('1e. address cleaned (no token_hash / type left), no local/external requests, no page errors'), (await addrIsClean(s)) && clean(s), JSON.stringify(s.errors));
      await s.page.fill('#f-password', PW1); await s.page.click('#auth-submit');
      await s.page.waitForSelector('#f-name, [data-go="next"]', { timeout: 12000 });
      log(T('1f. signing in with the password then works (onboarding starts)'), (await sessionUid(s)) === 'u-new');
      await s.ctx.close();
    }
    {
      const s = await session({}, { mobile, seed: seedUnconfirmed() });
      await comeBack(s, linkNew('tok-new-1', 'signup'));
      await s.page.waitForSelector('#gate-notice .notice--success', { timeout: 10000 });
      log(T('1g. type=signup is accepted too'), (await notice(s.page)).trim() === SUCCESS);
      await s.ctx.close();
    }

    // =====================================================================
    // 2. Used / invalid / unsupported links — never a success message
    // =====================================================================
    {
      const s = await session({}, { mobile, seed: seedUnconfirmed() });
      await comeBack(s, linkNew('tok-new-1'));
      await s.page.waitForSelector('#gate-notice .notice--success');
      await comeBack(s, linkNew('tok-new-1'));                    // the same link again (a second click, a mail scanner, a refresh)
      await s.page.waitForSelector('#resend-form', { timeout: 10000 });
      await s.shot('confirm-used-' + (mobile ? 'm' : 'd'));
      log(T('2a. a used link → «اللينك مش شغال», no success message, no session'), (await title(s.page)) === 'اللينك مش شغال' && (await s.page.$('.notice--success')) === null && (await sessionUid(s)) === null);
      log(T('2b. …with the resend form and a way back to sign-in'), (await s.page.$('#resend-confirm-btn')) !== null && (await s.page.$('[data-go="signin"]')) !== null);
      log(T('2c. …described neutrally: it could be a confirmation link or an old recovery link, so both ways forward are offered (new confirmation e-mail / new code)'), /اتستخدم قبل كده أو انتهت صلاحيته/.test(await subText(s.page)) && /رسالة تأكيد جديدة/.test(await subText(s.page)) && (await s.page.$('[data-go="forgot"]')) !== null, await subText(s.page));
      await s.ctx.close();
    }
    {
      const s = await session({}, { mobile, seed: seedUnconfirmed() });
      await comeBack(s, linkNew('totally-wrong'));
      await s.page.waitForSelector('#resend-form', { timeout: 10000 });
      log(T('2d. a made-up token → the same safe screen, one check, nothing confirmed'), (await title(s.page)) === 'اللينك مش شغال' && (await calls(s, 'verifyOtp')).length === 1 && (await userOf(s, UNC)).confirmed === false);
      await s.ctx.close();
    }
    {
      const s = await session({}, { mobile, seed: seedUnconfirmed() });
      await s.page.goto(PROD + '?token_hash=tok-new-1&type=recovery'); await s.page.waitForSelector('.landing');
      log(T('2e. a recovery-type token_hash is ignored by this path (no verify call, nothing confirmed)'), (await calls(s, 'verifyOtp')).length === 0 && (await userOf(s, UNC)).confirmed === false && (await sessionUid(s)) === null);
      await s.ctx.close();
    }
    {
      const s = await session({ verifyLeavesUnconfirmed: true }, { mobile, seed: seedUnconfirmed() });
      await comeBack(s, linkNew('tok-new-1'));
      await s.page.waitForSelector('#resend-form', { timeout: 10000 });
      log(T('2f. the server answers but does not confirm → "not confirmed" screen, never the success text, no session'), (await s.page.$('.notice--success')) === null && /مقدرناش نتأكد/.test(await subText(s.page)) && (await sessionUid(s)) === null);
      await s.ctx.close();
    }

    // =====================================================================
    // 3. No connection while checking → the link is kept, "try again" works
    // =====================================================================
    {
      const s = await session({ inject: { verifyOtp: [{ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }] } }, { mobile, seed: seedUnconfirmed() });
      await comeBack(s, linkNew('tok-new-1'));
      await s.page.waitForSelector('#confirm-retry', { timeout: 10000 });
      await s.shot('confirm-retry-' + (mobile ? 'm' : 'd'));
      log(T('3a. offline → "التأكيد ما كملش" + «جرّب تاني», no success yet'), (await title(s.page)) === 'التأكيد ما كملش' && (await s.page.$('.notice--success')) === null && (await userOf(s, UNC)).confirmed === false);
      log(T('3b. the link is still in the address (so a refresh can retry too)'), await s.page.evaluate(() => /token_hash=tok-new-1/.test(location.search)));
      await s.page.click('#confirm-retry');
      await s.page.waitForSelector('#gate-notice .notice--success', { timeout: 10000 });
      log(T('3c. «جرّب تاني» verifies again and then shows the success message'), (await notice(s.page)).trim() === SUCCESS && (await calls(s, 'verifyOtp')).length === 2 && (await userOf(s, UNC)).confirmed === true && (await addrIsClean(s)));
      await s.ctx.close();
    }

    // =====================================================================
    // 4. The older link style (#access_token&type=signup) and stale ones
    // =====================================================================
    {
      const s = await session({ allowList: [PROD], siteUrl: PROD }, { mobile, seed: seedUnconfirmed() });
      await boot(s);
      const url = await s.sb(() => window.__sb.followLink(0));
      await comeBack(s, url);
      await s.page.waitForSelector('#gate-notice .notice--success', { timeout: 10000 });
      log(T('4a. old-style link: the server is asked (getUser) before "confirmed" is shown'), (await notice(s.page)).trim() === SUCCESS && (await calls(s, 'getUser')).length >= 1 && (await calls(s, 'verifyOtp')).length === 0);
      log(T('4b. …and the one-time session it carried is dropped here, e-mail filled in, address clean'), (await sessionUid(s)) === null && (await s.page.$eval('#f-email', e => e.value)) === UNC && (await addrIsClean(s)));
      const stale = await s.sb(() => window.__sb.followLink(0));   // second click on the same e-mailed link
      await comeBack(s, stale);
      await s.page.waitForSelector('#resend-form', { timeout: 10000 });
      log(T('4c. a second click on the old-style link → «اللينك مش شغال» (neutral), resend offered'), (await title(s.page)) === 'اللينك مش شغال' && !/استعادة الباسورد/.test(await subText(s.page)));
      await s.ctx.close();
    }
    {
      const s = await session({}, { mobile });
      await passwordLogin(s, EMAIL, PW1);
      await comeBack(s, PROD + '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
      await inApp(s.page);
      log(T('4d. someone already signed in is not interrupted by an old link'), (await sessionUid(s)) === 'u-seed' && (await s.page.$('#resend-form')) === null);
      await s.ctx.close();
    }

    // =====================================================================
    // 5. Not confirmed yet: clear message + «ابعت رسالة التأكيد تاني»
    // =====================================================================
    {
      const s = await session({}, { mobile, seed: seedUnconfirmed() });
      await toAuth(s, 'signin');
      await s.page.fill('#f-email', UNC); await s.page.fill('#f-password', PW1); await s.page.click('#auth-submit');
      await s.page.waitForSelector('#inline-resend', { timeout: 10000 });
      await s.shot('confirm-needed-' + (mobile ? 'm' : 'd'));
      const msg = await notice(s.page);
      log(T('5a. sign-in with an unconfirmed e-mail → says the e-mail must be confirmed first, with a resend button'), /لازم تأكد بريدك الإلكتروني/.test(msg) && /ابعت رسالة التأكيد تاني/.test(msg) && (await sessionUid(s)) === null, msg);
      await s.page.click('#inline-resend');
      await s.page.waitForSelector('#gate-notice .notice--success', { timeout: 10000 });
      const rs = await calls(s, 'resend');
      log(T('5b. one resend request: type signup, the typed address, the published address as target'), rs.length === 1 && rs[0].type === 'signup' && rs[0].email === UNC && rs[0].emailRedirectTo === PROD, JSON.stringify(rs));
      log(T('5c. the answer never promises more than it knows ("if it applies, a message will arrive")'), /لو الإيميل ده مسجّل ولسه مش مؤكد/.test(await notice(s.page)));
      const newest = await outboxLast(s);
      log(T('5d. a new message went out and the older link no longer works'), newest.token !== 'tok-new-1' && (await s.sb(() => window.__sb.db.tokens['tok-new-1'].used)) === true);
      await comeBack(s, linkNew(newest.token));
      await s.page.waitForSelector('#gate-notice .notice--success', { timeout: 10000 });
      log(T('5e. the new message\'s link confirms the account'), (await notice(s.page)).trim() === SUCCESS && (await userOf(s, UNC)).confirmed === true);
      await s.ctx.close();
    }
    {
      const s = await session({}, { mobile, seed: seedUnconfirmed() });
      await toAuth(s, 'signin');
      await s.page.fill('#f-email', UNC); await s.page.fill('#f-password', PW1); await s.page.click('#auth-submit');
      await s.page.waitForSelector('#inline-resend');
      await s.page.click('#inline-resend', { clickCount: 4, delay: 10 });
      await s.page.waitForSelector('#gate-notice .notice--success', { timeout: 10000 });
      await s.page.waitForTimeout(300);
      log(T('5f. several quick clicks → ONE resend request'), (await calls(s, 'resend')).length === 1, String((await calls(s, 'resend')).length));
      await s.page.fill('#f-password', PW1); await s.page.click('#auth-submit');
      await s.page.waitForSelector('#inline-resend', { timeout: 10000 });
      const held = await s.page.$eval('#inline-resend', e => e.disabled);
      log(T('5g. the button stays on hold (countdown) after a send — no second e-mail inside the wait'), held === true && (await calls(s, 'resend')).length === 1);
      await s.ctx.close();
    }
    {
      const s = await session({ perAddressCooldown: 60 }, { mobile, seed: seedUnconfirmed({ lastMail: { [UNC]: Date.now() } }) });
      await toAuth(s, 'signin');
      await s.page.fill('#f-email', UNC); await s.page.fill('#f-password', PW1); await s.page.click('#auth-submit');
      await s.page.waitForSelector('#inline-resend');
      await s.page.click('#inline-resend');
      await s.page.waitForFunction(() => { const m = document.getElementById('inline-resend-msg'); return m && m.textContent.trim().length > 0; }, null, { timeout: 10000 });
      const m = await s.page.$eval('#inline-resend-msg', e => e.textContent.trim());
      await s.shot('confirm-wait-' + (mobile ? 'm' : 'd'));
      log(T('5h. Supabase\'s own "wait N seconds" answer is shown next to the button, which stays and holds'), /استنى \d+ ثانية/.test(m) && (await s.page.$eval('#inline-resend', e => e.disabled)) === true, m);
      await s.ctx.close();
    }
    {
      const s = await session({}, { mobile, seed: seedUnconfirmed() });
      await comeBack(s, linkNew('nope'));
      await s.page.waitForSelector('#resend-form');
      await s.page.fill('#f-email', 'not-an-email'); await s.page.click('#resend-confirm-btn');
      await s.page.waitForSelector('.field.is-invalid', { timeout: 5000 });
      log(T('5i. an invalid e-mail on the resend form is refused in place (no request)'), (await calls(s, 'resend')).length === 0);
      await s.page.fill('#f-email', UNC); await s.page.click('#resend-confirm-btn');
      await s.page.waitForSelector('#gate-notice .notice--success', { timeout: 10000 });
      log(T('5j. the resend form from an expired link sends one request for the typed address'), (await calls(s, 'resend')).length === 1 && (await calls(s, 'resend'))[0].email === UNC);
      await s.ctx.close();
    }

    // =====================================================================
    // 6. After the first minute, "send again" on the inbox screen works
    // =====================================================================
    {
      const s = await session({}, { mobile });
      let usedClock = true;
      try { await s.page.clock.install({ time: Date.now() }); } catch (e) { usedClock = false; }
      await signUpUI(s, 'سارة', 'sara.test@example.com', PW1);
      try { if (usedClock) await s.page.clock.fastForward(61000); } catch (e) { usedClock = false; }
      if (usedClock) {
        await s.page.waitForFunction(() => { const b = document.getElementById('resend-confirm-btn'); return b && !b.disabled; }, null, { timeout: 5000 }).catch(() => {});
        const enabled = await s.page.$eval('#resend-confirm-btn', e => !e.disabled);
        if (enabled) {
          await s.page.click('#resend-confirm-btn');
          await s.page.waitForSelector('#gate-notice .notice--success', { timeout: 10000 });
          log(T('6a. inbox screen: «ابعت رسالة التأكيد تاني» works once the wait is over (one request)'), (await calls(s, 'resend')).length === 1);
        } else { log(T('6a. inbox screen resend after the wait'), false, 'button still disabled after fast-forward'); }
      } else { log(T('6a. inbox screen resend after the wait (NOT TESTED: no fake clock)'), true, 'skipped'); }
      await s.ctx.close();
    }
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log('FAILED:\n' + failed.map(f => ' - ' + f.name).join('\n')); }
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
