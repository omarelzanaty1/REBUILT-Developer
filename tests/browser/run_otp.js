// Browser simulation of password recovery BY E-MAILED CODE (OTP), served under the published address
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

const SEED = { users: [{ id: 'u-seed', email: EMAIL, password: PW1, name: 'عمر', confirmed: true }], sessionUserId: null, tokens: {}, otps: {}, outbox: [], mailCount: 0, lastMail: {},
  tables: { profiles: [{ id: 'u-seed', name: 'عمر', email: EMAIL, avatar: '', settings: {}, is_onboarded: true, created_at: '2026-10-01T00:00:00Z' }],
            user_profiles: [{ user_id: 'u-seed', occupation: '', occupation_custom: '', life_description: '', skills: [], hobbies: [], goals: [], challenges: '' }],
            ai_profiles: [{ user_id: 'u-seed' }] } };

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
    const s = { ctx, page, errors: [], external: [], localhostHits: [], dialogs: [] };
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
  const limits = (s, o) => s.page.evaluate((o) => Object.assign(REBUILT.Auth.RECOVERY_LIMITS, o), o);
  const codeOf = (s, email) => s.sb((e) => { const o = window.__sb.db.otps[e || 'omar.test@example.com']; return o ? o.code : null; }, email);
  const wrongCodeFor = (code) => (code === '000000' ? '111111' : '000000');
  const fieldInvalid = (p, f) => p.$eval(`[data-field=${f}]`, e => e.classList.contains('is-invalid')).catch(() => false);

  async function openForgot(s, url) {
    await s.page.goto(url || PROD); await s.page.waitForSelector('.landing');
    await s.page.click('[data-go="signin"]'); await s.page.waitForSelector('#auth-form');
    await s.page.click('[data-go="forgot"]'); await s.page.waitForSelector('#forgot-form');
  }
  async function requestCode(s, email) {
    await s.page.fill('#f-email', email || EMAIL); await s.page.click('#forgot-submit'); await s.page.waitForSelector('#otp-form', { timeout: 8000 });
  }
  const submitCode = async (s, code) => { await s.page.fill('#f-code', code); await s.page.click('#otp-submit'); };
  async function signOutViaSettings(s) {
    await s.page.evaluate(() => REBUILT.Router.navigateTo('settings')); await s.page.waitForSelector('#sign-out-btn');
    await s.page.click('#sign-out-btn'); await s.page.waitForSelector('.landing', { timeout: 8000 });
  }

  for (const vp of ['desktop', 'mobile']) {
    const T = (n) => `${vp}: ${n}`;
    const mobile = vp === 'mobile';

    // =====================================================================
    // 1. The whole cycle — with the dashboard's Site URL still wrong, to show recovery no longer depends on it
    // =====================================================================
    {
      const s = await session({ siteUrl: 'http://localhost:3000', allowList: [] }, { mobile });
      await openForgot(s);
      const forgotText = await s.page.$eval('.gate__card', e => e.textContent);
      log(T('1. request screen talks about a code, not a link'), /كود/.test(forgotText) && !/لينك/.test(forgotText), forgotText.replace(/\s+/g, ' ').slice(0, 90));
      await s.page.click('#forgot-submit'); await settle(s.page, 150);
      log(T('1. empty e-mail rejected inline, nothing sent'), (await fieldInvalid(s.page, 'email')) && (await s.calls('resetPasswordForEmail')).length === 0);
      await s.page.fill('#f-email', 'not-an-email'); await s.page.click('#forgot-submit'); await settle(s.page, 150);
      log(T('1. malformed e-mail rejected inline, nothing sent'), (await fieldInvalid(s.page, 'email')) && (await s.calls('resetPasswordForEmail')).length === 0);

      await requestCode(s);
      const reqs = await s.calls('resetPasswordForEmail');
      log(T('1. ONE request for the code, with NO redirect link attached'), reqs.length === 1 && reqs[0].redirectTo === undefined, JSON.stringify(reqs));
      const mail = await s.sb(() => window.__sb.db.outbox[window.__sb.db.outbox.length - 1]);
      const code = await codeOf(s);
      log(T('1. the e-mail carries a 6-digit code and no link'), mail.type === 'recovery-otp' && /^\d{6}$/.test(code) && mail.effectiveRedirect === undefined);
      const otpText = await s.page.$eval('.gate__card', e => e.textContent);
      log(T('1. code screen opens inside the app (same address), shows the e-mail, no word "link"'), (await s.page.evaluate(() => location.pathname)) === BASE && otpText.includes(EMAIL) && !/لينك/.test(otpText));
      const attrs = await s.page.$eval('#f-code', e => ({ ac: e.getAttribute('autocomplete'), im: e.getAttribute('inputmode') }));
      log(T('1. code box is a one-time-code / numeric input'), attrs.ac === 'one-time-code' && attrs.im === 'numeric', JSON.stringify(attrs));
      log(T('1. resend starts on cooldown'), await s.page.$eval('#resend-btn', e => e.disabled));
      await s.shot(vp + '-1-otp-screen');

      await s.page.click('#otp-submit'); await settle(s.page, 150);
      log(T('1. empty code rejected inline, nothing sent'), (await fieldInvalid(s.page, 'code')) && (await s.calls('verifyOtp')).length === 0);
      await s.page.fill('#f-code', '123'); await s.page.click('#otp-submit'); await settle(s.page, 150);
      log(T('1. too-short code rejected inline, nothing sent'), (await fieldInvalid(s.page, 'code')) && (await s.calls('verifyOtp')).length === 0);

      await submitCode(s, wrongCodeFor(code)); await s.page.waitForSelector('#gate-notice .notice--danger');
      const wrongMsg = await notice(s.page);
      log(T('1. WRONG code: refused with a clear message and tries left'), /غلط أو انتهت/.test(wrongMsg) && /4 محاولات/.test(wrongMsg), wrongMsg);
      log(T('1. WRONG code does not open the new-password screen and creates no session'), (await s.page.$('#reset-form')) === null && (await s.sb(() => window.__sb.db.sessionUserId)) === null);
      await s.shot(vp + '-2-wrong-code');

      // the right code, typed with Arabic-Indic digits and a space in the middle
      const ar = code.split('').map(d => String.fromCharCode(0x0660 + Number(d))).join('');
      await s.page.fill('#f-code', ar.slice(0, 3) + ' ' + ar.slice(3));
      const boxValue = await s.page.$eval('#f-code', e => e.value);
      log(T('1. pasted/typed Arabic-Indic digits and spaces are normalised to plain digits'), boxValue === code, boxValue);
      await s.page.click('#otp-submit'); await s.page.waitForSelector('#reset-form', { timeout: 8000 });
      const vcalls = await s.calls('verifyOtp');
      log(T('1. CORRECT code verified with type "recovery" and the plain digits'), vcalls.length === 2 && vcalls[1].type === 'recovery' && vcalls[1].token === code && vcalls[1].email === EMAIL, JSON.stringify(vcalls[1]));
      log(T('1. the new-password screen opens only now; app stays hidden'), await s.page.$eval('#app', e => e.hidden));
      await s.shot(vp + '-3-new-password');

      await s.page.fill('#f-password', 'abc1234'); await s.page.fill('#f-confirmPassword', 'abc1234'); await s.page.click('#reset-submit'); await settle(s.page, 200);
      log(T('1. 7-character password refused inline, nothing sent'), (await fieldInvalid(s.page, 'password')) && (await s.calls('updateUser')).length === 0);
      await s.page.fill('#f-password', PW2); await s.page.fill('#f-confirmPassword', PW2 + 'x'); await s.page.click('#reset-submit'); await settle(s.page, 200);
      log(T('1. mismatching confirmation refused inline'), await fieldInvalid(s.page, 'confirmPassword'));
      await s.page.fill('#f-confirmPassword', PW2); await s.page.click('#reset-submit'); await s.page.waitForSelector('.gate__state-ico--ok', { timeout: 6000 });
      log(T('1. password really updated through the auth API (one updateUser)'), (await s.calls('updateUser')).length === 1 && (await s.sb(() => window.__sb.db.users[0].password)) === PW2);
      await s.shot(vp + '-4-done');
      await s.page.click('[data-go="continue"]'); await s.page.waitForSelector('#app:not([hidden])', { timeout: 8000 });
      log(T('1. continue lands in the app'), true);

      await signOutViaSettings(s);
      await s.page.click('[data-go="signin"]'); await s.page.waitForSelector('#auth-form');
      await s.page.fill('#f-email', EMAIL); await s.page.fill('#f-password', PW1); await s.page.click('#auth-submit'); await s.page.waitForSelector('#gate-notice .notice--danger');
      log(T('1. the OLD password no longer signs in'), /غلط/.test(await notice(s.page)));
      await s.page.fill('#f-password', PW2); await s.page.click('#auth-submit'); await s.page.waitForSelector('#app:not([hidden])', { timeout: 8000 });
      log(T('1. the NEW password signs in'), true);
      await signOutViaSettings(s);

      // the code that was just used cannot be used again
      await openForgot(s); await limits(s, { resendCooldownSeconds: 0 });
      await requestCode(s);
      await submitCode(s, code); await s.page.waitForSelector('#gate-notice .notice--danger');
      log(T('1. a code that was already used (or replaced by a newer one) is refused'), /غلط أو انتهت/.test(await notice(s.page)) && (await s.page.$('#reset-form')) === null);
      log(T('1. no request ever went to a local address; no page errors; no stray external requests'), s.localhostHits.length === 0 && s.errors.length === 0 && s.external.length === 0 && s.dialogs.length === 0, [...s.errors, ...s.external].join(' | '));
      await s.ctx.close();
    }

    // =====================================================================
    // 2. Expired code, resend, replaced code
    // =====================================================================
    {
      const s = await session({}, { mobile });
      await openForgot(s); await limits(s, { resendCooldownSeconds: 2 });
      await requestCode(s);
      const code1 = await codeOf(s);
      await s.sb(() => { window.__sb.db.otps['omar.test@example.com'].at -= 2 * 3600 * 1000; });   // two hours later
      await submitCode(s, code1); await s.page.waitForSelector('#gate-notice .notice--danger');
      log(T('2. EXPIRED code is refused with the same clear message'), /غلط أو انتهت/.test(await notice(s.page)) && (await s.page.$('#reset-form')) === null);
      const early = await s.page.$eval('#resend-btn', e => ({ disabled: e.disabled, text: e.textContent.trim() }));
      log(T('2. resend is disabled during its cooldown, with a countdown'), early.disabled && /\(\d+\)/.test(early.text), early.text);
      await s.page.waitForFunction(() => !document.getElementById('resend-btn').disabled, null, { timeout: 6000 });
      log(T('2. resend becomes available after the cooldown'), true);
      await s.page.click('#resend-btn'); await s.page.waitForFunction(() => /بعتنالك كود جديد/.test(document.getElementById('gate-notice').textContent));
      const code2 = await codeOf(s);
      log(T('2. a new code was e-mailed (second request)'), (await s.calls('resetPasswordForEmail')).length === 2 && (await s.sb(() => window.__sb.db.outbox.length)) === 2);
      await submitCode(s, code1 === code2 ? wrongCodeFor(code2) : code1); await s.page.waitForSelector('#gate-notice .notice--danger');
      log(T('2. the OLD code stopped working once a new one was sent'), /غلط أو انتهت/.test(await notice(s.page)) && (await s.page.$('#reset-form')) === null);
      await submitCode(s, code2); await s.page.waitForSelector('#reset-form', { timeout: 8000 });
      log(T('2. the NEW code works'), true);
      await s.ctx.close();
    }

    // =====================================================================
    // 3. Wrong-code limit, and it survives a refresh
    // =====================================================================
    {
      const s = await session({}, { mobile });
      await openForgot(s); await requestCode(s);
      const code = await codeOf(s);
      for (let i = 0; i < 5; i++) {
        await submitCode(s, wrongCodeFor(code).replace(/\d$/, String(i)));   // five different wrong codes
        await settle(s.page, 120);
      }
      const locked = await s.page.$eval('#otp-submit', e => e.disabled) && await s.page.$eval('#f-code', e => e.disabled);
      const msg = await notice(s.page);
      log(T('3. after 5 wrong codes the box and the button lock, and the message says to request a new code'), locked && /اطلب كود جديد/.test(msg), msg);
      log(T('3. exactly 5 verification requests reached the server'), (await s.calls('verifyOtp')).length === 5);
      await s.shot(vp + '-5-locked');
      await s.page.evaluate(() => document.getElementById('otp-form').requestSubmit()); await settle(s.page, 200);
      const direct = await s.page.evaluate((c) => REBUILT.Auth.verifyRecoveryCode('omar.test@example.com', c), code);
      log(T('3. even the CORRECT code is refused locally once locked (no sixth request)'), direct.ok === false && direct.exhausted === true && (await s.calls('verifyOtp')).length === 5);

      await s.page.reload(); await s.page.waitForSelector('.landing');
      log(T('3. a refresh does not reset the counter'), (await s.page.evaluate(() => REBUILT.Auth.Recovery.attemptsLeft())) === 0);
      await s.page.click('[data-go="signin"]'); await s.page.waitForSelector('#auth-form'); await s.page.click('[data-go="forgot"]'); await s.page.waitForSelector('#forgot-form');
      await s.page.fill('#f-email', EMAIL); await s.page.click('#forgot-submit'); await s.page.waitForSelector('#gate-notice .notice--danger');
      log(T('3. asking again right away is refused locally (cooldown), nothing sent'), /استنى \d+ ثانية/.test(await notice(s.page)) && (await s.calls('resetPasswordForEmail')).length === 0, await notice(s.page));
      await limits(s, { resendCooldownSeconds: 1 }); await settle(s.page, 1300);
      // the button is held for the first countdown; wait for it to release
      await s.page.waitForFunction(() => !document.getElementById('forgot-submit').disabled, null, { timeout: 70000 }).catch(() => {});
      await s.page.click('#forgot-submit').catch(() => {});
      const ok = await s.page.waitForSelector('#otp-form', { timeout: 5000 }).then(() => true).catch(() => false);
      log(T('3. a freshly requested code gives a fresh set of tries'), ok && (await s.page.evaluate(() => REBUILT.Auth.Recovery.attemptsLeft())) === 5);
      if (ok) { const c2 = await codeOf(s); await submitCode(s, c2); await s.page.waitForSelector('#reset-form', { timeout: 8000 }); log(T('3. and the new code works'), true); }
      await s.ctx.close();
    }

    // =====================================================================
    // 4. Sending limits (the app's own, and Supabase's)
    // =====================================================================
    {
      // 4a. hourly cap of the app
      const s = await session({}, { mobile });
      await openForgot(s); await limits(s, { resendCooldownSeconds: 0, sendsPerWindow: 2 });
      await requestCode(s); await s.page.click('[data-go="forgot"]'); await s.page.waitForSelector('#forgot-form');
      await requestCode(s); await s.page.click('[data-go="forgot"]'); await s.page.waitForSelector('#forgot-form');
      await s.page.fill('#f-email', EMAIL); await s.page.click('#forgot-submit'); await s.page.waitForSelector('#gate-notice .notice--danger');
      log(T('4a. hourly cap of codes per tab: the third request is refused locally with a clear message'), /طلبت أكواد كتير/.test(await notice(s.page)) && (await s.calls('resetPasswordForEmail')).length === 2, await notice(s.page));
      const held = await s.page.$eval('#forgot-submit', e => ({ d: e.disabled, t: e.textContent.trim() }));
      log(T('4a. the button is held, with the wait shown in minutes'), held.d && /\(\d+ د\)/.test(held.t), held.t);
      await s.ctx.close();
    }
    {
      // 4b. Supabase: one e-mail per address per minute
      const s = await session({ perAddressCooldown: 60 }, { mobile });
      await openForgot(s); await limits(s, { resendCooldownSeconds: 0 });
      await requestCode(s); await s.page.click('[data-go="forgot"]'); await s.page.waitForSelector('#forgot-form');
      await s.page.fill('#f-email', EMAIL); await s.page.click('#forgot-submit'); await s.page.waitForSelector('#gate-notice .notice--danger');
      log(T('4b. Supabase "once per minute per address" is shown with its exact wait, and the button is held'), /استنى 60 ثانية/.test(await notice(s.page)) && await s.page.$eval('#forgot-submit', e => e.disabled), await notice(s.page));
      await s.ctx.close();
    }
    {
      // 4c. Supabase: project e-mail quota used up
      const s = await session({ emailQuota: 0 }, { mobile });
      await openForgot(s); await s.page.fill('#f-email', EMAIL); await s.page.click('#forgot-submit'); await s.page.waitForSelector('#gate-notice .notice--danger');
      const m = await notice(s.page);
      log(T('4c. project e-mail quota used up → honest message, form paused, no code screen'), /رسائل الإيميل/.test(m) && !/طلبات كتير/.test(m) && (await s.page.$('#otp-form')) === null && await s.page.$eval('#forgot-submit', e => e.disabled), m);
      await s.ctx.close();
    }
    {
      // 4d. Supabase: verification rate limit → not a wrong try
      const s = await session({ verifyLimit: 2 }, { mobile });
      await openForgot(s); await requestCode(s);
      const code = await codeOf(s);
      await submitCode(s, wrongCodeFor(code)); await s.page.waitForSelector('#gate-notice .notice--danger');
      await submitCode(s, wrongCodeFor(code).replace(/\d$/, '7')); await settle(s.page, 250);
      await submitCode(s, wrongCodeFor(code).replace(/\d$/, '8')); await settle(s.page, 300);
      const m = await notice(s.page);
      log(T('4d. Supabase verification rate limit → "طلبات كتير" and the button pauses'), /طلبات كتير ورا بعض/.test(m) && await s.page.$eval('#otp-submit', e => e.disabled), m);
      log(T('4d. that refusal is not counted as a wrong try (3 left after 2 wrong codes)'), (await s.page.evaluate(() => REBUILT.Auth.Recovery.attemptsLeft())) === 3);
      await s.ctx.close();
    }

    // =====================================================================
    // 5. Privacy: an unknown e-mail looks exactly like a known one
    // =====================================================================
    {
      const shots = {};
      for (const [label, email] of [['known', EMAIL], ['unknown', 'nobody.here@example.com']]) {
        const s = await session({}, { mobile });
        await openForgot(s); await requestCode(s, email);
        const title = await s.page.$eval('.gate__title', e => e.textContent);
        const sub = (await s.page.$eval('.gate__sub', e => e.textContent)).replace(email, '<email>');
        await submitCode(s, '123456'); await s.page.waitForSelector('#gate-notice .notice--danger');
        shots[label] = { title, sub, wrong: await notice(s.page), mails: await s.sb(() => window.__sb.db.outbox.length), reqErr: (await s.calls('resetPasswordForEmail')).length };
        await s.ctx.close();
      }
      log(T('5. unknown e-mail: same code screen, same wording as a registered one'), shots.known.title === shots.unknown.title && shots.known.sub === shots.unknown.sub, JSON.stringify(shots.unknown.sub));
      log(T('5. unknown e-mail: a wrong code gets the very same answer (nothing reveals whether the account exists)'), shots.known.wrong === shots.unknown.wrong, shots.unknown.wrong);
      log(T('5. (and no e-mail is sent for the unknown address)'), shots.unknown.mails === 0 && shots.known.mails === 1);
    }

    // =====================================================================
    // 6. After the code is accepted, a refresh lands on "new password" — never inside the app
    // =====================================================================
    {
      const s = await session({}, { mobile });
      await openForgot(s); await requestCode(s);
      await submitCode(s, await codeOf(s)); await s.page.waitForSelector('#reset-form', { timeout: 8000 });
      await s.page.reload(); await s.page.waitForSelector('#reset-form', { timeout: 8000 });
      log(T('6. refresh on the new-password screen returns to it (not into the app)'), await s.page.$eval('#app', e => e.hidden) && (await s.sb(() => !!window.__sb.db.sessionUserId)));
      await s.page.click('[data-go="cancel-reset"]'); await s.page.waitForSelector('.landing', { timeout: 8000 });
      log(T('6. cancel signs out and returns to the start, password unchanged'), (await s.sb(() => window.__sb.db.sessionUserId)) === null && (await s.sb(() => window.__sb.db.users[0].password)) === PW1);
      log(T('6. the pending marker is gone after cancel'), (await s.page.evaluate(() => sessionStorage.getItem('rebuilt.resetPending'))) === null);
      await s.page.reload(); await s.page.waitForSelector('.landing');
      log(T('6. after cancel a refresh shows the start screen, not the reset form'), (await s.page.$('#reset-form')) === null);
      await s.ctx.close();
    }
    {
      // finish after a refresh
      const s = await session({}, { mobile });
      await openForgot(s); await requestCode(s);
      await submitCode(s, await codeOf(s)); await s.page.waitForSelector('#reset-form', { timeout: 8000 });
      await s.page.reload(); await s.page.waitForSelector('#reset-form', { timeout: 8000 });
      await s.page.fill('#f-password', PW2); await s.page.fill('#f-confirmPassword', PW2); await s.page.click('#reset-submit'); await s.page.waitForSelector('.gate__state-ico--ok', { timeout: 6000 });
      log(T('6. the password can still be saved after a refresh, and the pending marker is cleared'), (await s.sb(() => window.__sb.db.users[0].password)) === PW2 && (await s.page.evaluate(() => sessionStorage.getItem('rebuilt.resetPending'))) === null);
      await s.ctx.close();
    }

    // =====================================================================
    // 7. one click / Enter / repeated clicks = one request
    // =====================================================================
    {
      const s = await session({ latency: 600 }, { mobile });
      await openForgot(s); await s.page.fill('#f-email', EMAIL);
      await s.page.click('#forgot-submit', { clickCount: 3, delay: 15 }); await s.page.keyboard.press('Enter');
      await s.page.waitForSelector('#otp-form', { timeout: 8000 });
      log(T('7. "send code": repeated clicks → ONE request, ONE e-mail'), (await s.calls('resetPasswordForEmail')).length === 1 && (await s.sb(() => window.__sb.db.outbox.length)) === 1);
      await s.page.fill('#f-code', await codeOf(s));
      await s.page.click('#otp-submit', { clickCount: 3, delay: 15 }); await s.page.keyboard.press('Enter');
      await s.page.waitForSelector('#reset-form', { timeout: 8000 });
      log(T('7. "confirm code": repeated clicks → ONE verification request'), (await s.calls('verifyOtp')).length === 1);
      await s.page.fill('#f-password', PW2); await s.page.fill('#f-confirmPassword', PW2);
      await s.page.click('#reset-submit', { clickCount: 3, delay: 15 }); await s.page.keyboard.press('Enter');
      await s.page.waitForSelector('.gate__state-ico--ok', { timeout: 8000 });
      log(T('7. "change password": repeated clicks → ONE update request'), (await s.calls('updateUser')).length === 1);
      await s.ctx.close();
    }

    // =====================================================================
    // 8. A link from an OLD recovery e-mail still lands somewhere sensible
    // =====================================================================
    {
      const s = await session({}, { mobile });
      await s.page.goto(PROD + '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
      await s.page.waitForSelector('.gate__state');
      const title = await s.page.$eval('.gate__title', e => e.textContent);
      const cta = await s.page.$eval('[data-go="forgot"]', e => e.textContent.trim());
      log(T('8. an expired old link shows a clear screen (not blank) that offers a new CODE'), /مش شغال/.test(title) && /كود جديد/.test(cta), title + ' / ' + cta);
      await s.page.click('[data-go="forgot"]'); await s.page.waitForSelector('#forgot-form');
      log(T('8. …which leads to the code request form'), true);
      await s.ctx.close();
    }
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) { console.log('FAILED:\n' + failed.map(f => ' - ' + f.name).join('\n')); }
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
