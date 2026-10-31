// Browser simulation of the e-mail-link flows UNDER THE PUBLISHED ADDRESS (https://omarelzanaty1.github.io/rebuilt0.4/),
// against the Supabase test double (tests/fake-supabase.js) extended with GoTrue's Site-URL / Redirect-URL / quota rules.
// This is a LOCAL SIMULATION: it proves what the app asks for and how it behaves when each answer comes back.
// It cannot prove what the real Supabase project is configured to do — that is checked separately (logs / dashboard).
const { launch, ROOT, OUT, TESTS } = require('./_env');
const fs = require('fs'), path = require('path');
const FAKE = fs.readFileSync(TESTS + '/fake-supabase.js', 'utf8');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json', '.webmanifest':'application/manifest+json' };
// Default: the app is served as the STABLE site (GitHub Pages, /rebuilt0.4/) — the only channel that has a backend. The development channel is covered by run_channels.js.
const HOSTS = { pages: { origin: 'https://omarelzanaty1.github.io', base: '/rebuilt0.4/' } };
const HOST = HOSTS[process.env.RB_HOST || 'pages'];
const ORIGIN = HOST.origin, BASE = HOST.base, PROD = ORIGIN + BASE;
console.log('HOST UNDER TEST: ' + PROD);
const EMAIL = 'omar.test@example.com', PW1 = 'secret123', PW2 = 'newsecret456';
const results = [];
const log = (name, ok, detail) => { results.push({ name, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };

const SEED = { users: [{ id: 'u-seed', email: EMAIL, password: PW1, name: 'عمر', confirmed: true }], sessionUserId: null, tokens: {}, outbox: [], mailCount: 0, lastMail: {},
  tables: { profiles: [{ id: 'u-seed', name: 'عمر', email: EMAIL, avatar: '', settings: {}, is_onboarded: true, created_at: '2026-10-01T00:00:00Z' }],
            user_profiles: [{ user_id: 'u-seed', occupation: '', occupation_custom: '', life_description: '', skills: [], hobbies: [], goals: [], challenges: '' }],
            ai_profiles: [{ user_id: 'u-seed' }] } };

(async () => {
  const browser = await launch();

  /** A fresh browser profile at the published origin. cfg → window.__SB_CFG (read by the test double). */
  async function session(cfg, opts) {
    opts = opts || {};
    const ctx = await browser.newContext({ viewport: opts.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, locale: 'ar-EG', timezoneId: 'Africa/Cairo' });
    await ctx.addInitScript(([c, seed, doSeed]) => {
      window.__SB_CFG = c;
      try { if (doSeed && !localStorage.getItem('__fakesb')) localStorage.setItem('__fakesb', JSON.stringify(seed)); } catch (e) { /* about:blank has no storage */ }
    }, [cfg || {}, SEED, opts.seed !== false]);
    const page = await ctx.newPage();
    const s = { ctx, page, errors: [], external: [], localhostHits: [], dialogs: [] };
    page.on('pageerror', e => s.errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|net::/.test(m.text())) s.errors.push('console: ' + m.text()); });
    page.on('dialog', d => { s.dialogs.push(d.type()); d.dismiss(); });
    await page.route('**/*', route => {
      const u = new URL(route.request().url());
      if (u.origin === ORIGIN && u.pathname.startsWith(BASE.replace(/\/$/, '') || '/')) {
        let p = u.pathname.slice(BASE.length - (BASE.endsWith('/') ? 0 : 0)).replace(/^\//, '');
        if (BASE !== '/' && u.pathname === BASE.replace(/\/$/, '')) p = '';
        if (p === '' || p === 'index.html') p = 'index.html';
        const f = path.join(ROOT, decodeURIComponent(p));
        if (!f.startsWith(ROOT) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
        return route.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
      }
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') { s.localhostHits.push(u.href); return route.abort('connectionrefused'); }
      if (/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/.test(u.href)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE });
      if (/fonts\.(googleapis|gstatic)\.com/.test(u.hostname)) return route.abort();
      s.external.push(u.href); return route.abort();
    });
    s.sb = (fn, arg) => page.evaluate(fn, arg);
    s.calls = (name) => page.evaluate((n) => window.__sb.authCalls.filter(c => !n || c.fn === n), name);
    s.shot = (n) => page.screenshot({ path: `${OUT}/rec-${n}.png`, fullPage: true });
    return s;
  }
  const settle = (p, ms) => p.waitForTimeout(ms || 400);
  const notice = (p) => p.$eval('#gate-notice', e => e.textContent.trim()).catch(() => '');
  const CORRECT = { siteUrl: PROD, allowList: [PROD] };

  async function openForgot(s, url) {
    await s.page.goto(url || PROD); await s.page.waitForSelector('.landing');
    await s.page.click('[data-go="signin"]'); await s.page.waitForSelector('#auth-form');
    await s.page.click('[data-go="forgot"]'); await s.page.waitForSelector('#forgot-form');
  }

  for (const vp of ['desktop', 'mobile']) {
    const T = (n) => `${vp}: ${n}`;
    const mobile = vp === 'mobile';

    // =====================================================================
    // A. Dashboard NOT configured (Site URL = a local address, no Redirect URLs): e-mailed LINKS go to localhost
    //    (sign-up confirmation still uses a link; password recovery no longer does — see run_otp.js)
    // =====================================================================
    {
      const s = await session({ siteUrl: 'http://localhost:3000', allowList: [] }, { mobile, seed: false });
      await s.page.goto(PROD + 'index.html?utm=1'); await s.page.waitForSelector('.landing');
      await s.page.click('[data-go="signup"]'); await s.page.waitForSelector('#auth-form');
      await s.page.fill('#f-name', 'عمر'); await s.page.fill('#f-email', 'new.user@example.com');
      await s.page.fill('#f-password', PW1); await s.page.fill('#f-confirmPassword', PW1);
      await s.page.click('#auth-submit'); await s.page.waitForSelector('.gate__state');
      const call = (await s.calls('signUp'))[0];
      log(T('A. opened as …/index.html?utm=1 → sign-up still asks for exactly the published URL'), call && call.emailRedirectTo === PROD, call && call.emailRedirectTo);
      const mail = await s.sb(() => window.__sb.db.outbox[window.__sb.db.outbox.length - 1]);
      log(T('A. with Site URL / Redirect URLs unset, GoTrue replaces it by the Site URL (a dashboard setting; code cannot change it)'), mail && mail.effectiveRedirect === 'http://localhost:3000', mail && mail.effectiveRedirect);
      const dest = await s.sb(() => window.__sb.followLink());
      let refused = '';
      try { await s.page.goto(dest, { timeout: 8000 }); } catch (e) { refused = e.message; }
      log(T('A. following that confirmation link fails like the original report (ERR_CONNECTION_REFUSED)'), /ERR_CONNECTION_REFUSED/.test(refused) && s.localhostHits.length > 0, refused.split('\n')[0]);
      await s.ctx.close();
    }

    // =====================================================================
    // D. sign-up confirmation link also returns to the app
    // =====================================================================
    {
      const s = await session(CORRECT, { mobile, seed: false });
      await s.page.goto(PROD); await s.page.waitForSelector('.landing');
      await s.page.click('[data-go="signup"]'); await s.page.waitForSelector('#auth-form');
      await s.page.fill('#f-name', 'عمر الزناتي'); await s.page.fill('#f-email', 'new.user@example.com');
      await s.page.fill('#f-password', PW1); await s.page.fill('#f-confirmPassword', PW1);
      await s.page.click('#auth-submit'); await s.page.waitForSelector('.gate__state');
      const calls = await s.calls('signUp');
      log(T('D. exactly ONE sign-up request per click'), calls.length === 1, String(calls.length));
      log(T('D. sign-up sends emailRedirectTo = published URL'), calls[0].emailRedirectTo === PROD, calls[0].emailRedirectTo);
      log(T('D. confirmation screen shown (no fake sign-in)'), /إيميلك/.test(await s.page.$eval('.gate__title', e => e.textContent)));
      const mail = await s.sb(() => window.__sb.db.outbox[0]);
      log(T('D. confirmation link target = published URL'), mail.type === 'signup' && mail.effectiveRedirect === PROD, mail.effectiveRedirect);
      const dest = await s.sb(() => window.__sb.followLink());
      await s.page.goto('about:blank'); await s.page.goto(dest);
      await s.page.waitForSelector('#gate-notice .notice--success', { timeout: 8000 });
      log(T('D. following the confirmation link lands on the app with the success message (account confirmed), signed out, ready to sign in'), (await s.page.evaluate(() => location.pathname)) === BASE && !(await s.sb(() => !!window.__sb.db.sessionUserId)) && /تم تأكيد بريدك الإلكتروني بنجاح/.test(await s.page.$eval('#gate-notice', e => e.textContent)));
      await s.page.fill('#f-password', PW1); await s.page.click('#auth-submit');
      await s.page.waitForSelector('.wizard-head', { timeout: 8000 });
      log(T('D. …and signing in with the password then reaches onboarding'), await s.sb(() => !!window.__sb.db.sessionUserId));
      log(T('D. no request to a local address'), s.localhostHits.length === 0);
      await s.ctx.close();
    }

    // =====================================================================
    // E. sign-up errors keep their meaning; rate limits pause the button
    // =====================================================================
    const fillSignup = async (s, email) => {
      await s.page.goto(PROD); await s.page.waitForSelector('.landing');
      await s.page.click('[data-go="signup"]'); await s.page.waitForSelector('#auth-form');
      await s.page.fill('#f-name', 'عمر الزناتي'); await s.page.fill('#f-email', email || 'fresh.user@example.com');
      await s.page.fill('#f-password', PW1); await s.page.fill('#f-confirmPassword', PW1);
    };
    const err = (status, code, message) => ({ name: 'AuthApiError', status, code, message });
    {
      // E1: the project's e-mail quota is used up (the real cause found in the Supabase logs)
      const s = await session({ ...CORRECT, emailQuota: 0 }, { mobile });
      await fillSignup(s);
      await s.page.click('#auth-submit'); await s.page.waitForSelector('#gate-notice .notice--danger');
      const msg = await notice(s.page);
      log(T('E1. e-mail quota exhausted → says so (not "طلبات كتير ورا بعض")'), /رسائل الإيميل/.test(msg) && !/طلبات كتير/.test(msg), msg);
      await s.shot(vp + '-E1-email-quota');
      const dis = await s.page.$eval('#auth-submit', e => ({ disabled: e.disabled, text: e.textContent.trim() }));
      log(T('E1. button is paused with a visible countdown'), dis.disabled && /\(\d+\)/.test(dis.text), JSON.stringify(dis));
      const before = (await s.calls('signUp')).length;
      await s.page.evaluate(() => document.getElementById('auth-form').requestSubmit()); await settle(s.page, 200);
      await s.page.focus('#f-email'); await s.page.keyboard.press('Enter'); await settle(s.page, 200);
      log(T('E1. Enter / programmatic submit while paused sends nothing'), (await s.calls('signUp')).length === before, before + ' → ' + (await s.calls('signUp')).length);
      await s.page.click('[data-authmode="signin"]'); await s.page.click('[data-authmode="signup"]'); await s.page.waitForSelector('#auth-submit');
      log(T('E1. leaving and re-entering the form does not bypass the pause'), await s.page.$eval('#auth-submit', e => e.disabled));
      log(T('E1. the failed sign-up created no account (rolled back)'), (await s.sb(() => window.__sb.db.users.filter(u => u.email === 'fresh.user@example.com').length)) === 0);
      await s.ctx.close();
    }
    {
      const s = await session({ ...CORRECT, inject: { signUp: [err(429, 'over_request_rate_limit', 'Request rate limit reached')] } }, { mobile });
      await fillSignup(s); await s.page.click('#auth-submit'); await s.page.waitForSelector('#gate-notice .notice--danger');
      log(T('E2. general request rate limit → "طلبات كتير ورا بعض"'), /طلبات كتير ورا بعض/.test(await notice(s.page)), await notice(s.page));
      await s.ctx.close();
    }
    {
      const s = await session({ ...CORRECT, inject: { signUp: [err(429, 'over_email_send_rate_limit', 'For security purposes, you can only request this after 2 seconds.')] } }, { mobile });
      await fillSignup(s); await s.page.click('#auth-submit'); await s.page.waitForSelector('#gate-notice .notice--danger');
      const m = await notice(s.page);
      log(T('E3. "only after N seconds" → tells the exact wait'), /2 ثانية/.test(m), m);
      await settle(s.page, 3300);
      const back = await s.page.$eval('#auth-submit', e => ({ disabled: e.disabled, text: e.textContent.trim() }));
      log(T('E3. button re-enables itself and the label is restored when the pause ends'), !back.disabled && back.text === 'إنشاء الحساب', JSON.stringify(back));
      await s.page.click('#auth-submit'); await s.page.waitForSelector('.gate__state', { timeout: 6000 });
      log(T('E3. sign-up then succeeds'), true);
      await s.ctx.close();
    }
    {
      const s = await session({ ...CORRECT, teamEmails: ['someone.else@example.com'] }, { mobile });
      await fillSignup(s); await s.page.click('#auth-submit'); await s.page.waitForSelector('#gate-notice .notice--danger');
      const m = await notice(s.page);
      log(T('E4. e-mail provider refuses this recipient → explains it (not a rate-limit message)'), /مش مسموح يستلم/.test(m) && !/طلبات كتير/.test(m), m);
      log(T('E4. not a rate limit → button stays usable'), !(await s.page.$eval('#auth-submit', e => e.disabled)));
      await s.ctx.close();
    }
    {
      const s = await session(CORRECT, { mobile });
      await fillSignup(s, EMAIL); await s.page.click('#auth-submit'); await s.page.waitForSelector('#gate-notice .notice--danger');
      log(T('E5. existing account → "already registered" message'), /مسجل قبل كده/.test(await notice(s.page)), await notice(s.page));
      await s.ctx.close();
    }
    {
      const s = await session({ ...CORRECT, inject: { signUp: [err(418, 'teapot_error', 'I am a teapot')] } }, { mobile });
      await fillSignup(s); await s.page.click('#auth-submit'); await s.page.waitForSelector('#gate-notice .notice--danger');
      const m = await notice(s.page);
      log(T('E6. unknown error → generic text plus the server code, never the rate-limit text'), /teapot_error/.test(m) && !/طلبات كتير/.test(m), m);
      await s.ctx.close();
    }
    // =====================================================================
    // F. one click / one Enter / repeated clicks = one request
    // =====================================================================
    {
      const s = await session({ ...CORRECT, latency: 600 }, { mobile, seed: false });
      await fillSignup(s);
      await s.page.click('#auth-submit', { clickCount: 3, delay: 15 });
      await s.page.focus('#f-email'); await s.page.keyboard.press('Enter'); await s.page.keyboard.press('Enter');
      const busy = await s.page.$eval('#auth-submit', e => ({ disabled: e.disabled, busy: e.getAttribute('aria-busy') }));
      log(T('F1. while the request runs the button is disabled and aria-busy'), busy.disabled && busy.busy === 'true', JSON.stringify(busy));
      await s.page.waitForSelector('.gate__state', { timeout: 8000 });
      const n = (await s.calls('signUp')).length;
      log(T('F1. triple-click + double Enter → exactly ONE sign-up request'), n === 1, String(n));
      log(T('F1. exactly one account and one confirmation mail'), (await s.sb(() => window.__sb.db.users.length)) === 1 && (await s.sb(() => window.__sb.db.outbox.length)) === 1);
      await s.ctx.close();
    }
    {
      const s = await session({ ...CORRECT, latency: 600 }, { mobile });
      await s.page.goto(PROD); await s.page.waitForSelector('.landing'); await s.page.click('[data-go="signin"]'); await s.page.waitForSelector('#auth-form');
      await s.page.fill('#f-email', EMAIL); await s.page.fill('#f-password', PW1);
      await s.page.click('#auth-submit', { clickCount: 3, delay: 15 }); await s.page.keyboard.press('Enter');
      await s.page.waitForSelector('#app:not([hidden])', { timeout: 8000 });
      log(T('F2. sign-in: repeated clicks → exactly ONE request'), (await s.calls('signIn')).length === 1, String((await s.calls('signIn')).length));
      await s.ctx.close();
    }
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log('FAILED:\n' + failed.map(f => ' - ' + f.name).join('\n')); }
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
