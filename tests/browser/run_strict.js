// Strict mode in a real browser: «a configured backend that fails is never hidden behind the local copy».
// The app is served as the DEVELOPMENT site (omarelzanaty1.github.io/REBUILT-Developer/) with a FILLED development
// profile (the harness patches the served supabaseClient.js: the repository's own profile is empty), and the Supabase
// test double (fake-supabase.js) stands in for supabase-js. NOTHING real is reached; what is proved is what the app
// DOES when the server errors, is down, cuts an answer, or the library never loads — not what the real service answers.
//   dev + healthy server      → server data shown, a poisoned local copy never shown and never touched
//   dev + server down         → blocking error screen (retry works), no stale data
//   dev + one table failing   → blocking error screen naming the table, never an empty list
//   dev + a write rejected    → visible message, the screen goes back to what the server really holds
//   dev + library blocked     → blocking error screen, no device-only sign-in
//   dev + big table           → read completely (the API cuts one answer at 1000 rows)
//   dev + profile empty       → deliberate local mode, exactly as shipped
//   stable                    → unchanged: no strict mode (write failures stay silent, a down server falls back to the mirror)
const { launch, ROOT, OUT, TESTS } = require('./_env');
const fs = require('fs'), path = require('path');
const FAKE = fs.readFileSync(TESTS + '/fake-supabase.js', 'utf8');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json', '.webmanifest':'application/manifest+json' };
const results = [];
const log = (name, ok, detail) => { results.push({ name, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };

const DEV_URL = 'https://abcdefghijklmnopqrst.supabase.co';
const DEV_KEY = 'sb_publishable_BROWSERTESTBROWSERTEST';
const PROD_URL = 'https://jvyhtpfedkypwdzyadba.supabase.co';
const DEV_BASE = 'https://omarelzanaty1.github.io/REBUILT-Developer';
const STABLE_BASE = 'https://omarelzanaty1.github.io/rebuilt0.4';
const EMAIL = 'omar.test@example.com';

/** supabaseClient.js as the harness serves it: the development profile set EXPLICITLY (filled, or blank) whatever the repository holds now. */
function profileClient(src, filled) {
  const url = filled ? DEV_URL : '', key = filled ? DEV_KEY : '';
  const patched = src.replace(/(development:\s*\{\s*url:\s*)"[^"]*"/, '$1' + JSON.stringify(url)).replace(/(anonKey:\s*)"[^"]*",(\s*\/\/[^\n]*\n\s*\},\s*\};)/, '$1' + JSON.stringify(key) + ',$2');
  const m = patched.match(/development:\s*\{\s*url:\s*"([^"]*)"[\s\S]*?anonKey:\s*"([^"]*)"/);
  if (!m || m[1] !== url || m[2] !== key) throw new Error('HARNESS: could not set the development profile');
  return patched;
}

const iso = (n) => new Date(Date.UTC(2019, 0, 1) + n * 86400000).toISOString().slice(0, 10);
/** What the server (the test double's tables) holds for one signed-in, onboarded person. */
function serverDb(o) {
  o = o || {};
  const habit = { id: 'h1', user_id: 'u1', title: 'SERVER-HABIT', description: '', icon: 'flame', xp: 20, frequency: 'daily', target_days: [], time: null, created_at: '2026-10-01T00:00:00Z' };
  const task = { id: 't1', user_id: 'u1', title: 'SERVER-TASK', description: '', priority: 'high', date: null, time: null, xp: 25, completed: false, completed_at: null, xp_awarded: 0, created_at: '2026-10-01T00:00:00Z' };
  const completions = [];
  for (let i = 0; i < (o.completions || 0); i++) completions.push({ habit_id: 'h1', user_id: 'u1', completed_on: iso(i), xp_awarded: 20 });
  return {
    users: [{ id: 'u1', email: EMAIL, password: 'secret123', name: 'Omar', confirmed: true }], sessionUserId: 'u1',
    tables: {
      profiles: [{ id: 'u1', name: 'Omar', email: EMAIL, avatar: '', settings: {}, is_onboarded: true, created_at: '2026-10-01T00:00:00Z' }],
      user_profiles: [{ user_id: 'u1', occupation: '', occupation_custom: '', life_description: '', skills: [], hobbies: [], goals: [], challenges: '' }],
      ai_profiles: [{ user_id: 'u1' }], habits: [habit], habit_completions: completions, tasks: [task], schedule_items: [], daily_history: [], unlocked_achievements: [], ai_conversations: [],
    },
  };
}
/** A device copy left by an older version / local mode: it must never be shown in strict mode. */
const POISON = JSON.stringify({
  meta: { isDemo: false, isOnboarded: true, hasLocalAccount: true }, user: { id: 'u1', name: 'STALE-NAME', email: EMAIL, avatar: '', createdAt: '2026-10-01' },
  habits: [{ id: 'stale', title: 'STALE-LOCAL-COPY', description: '', icon: 'flame', xp: 20, frequency: 'daily', targetDays: [], time: null, createdAt: '2026-10-01', completionHistory: [], currentStreak: 0, longestStreak: 0 }], tasks: [],
});

(async () => {
  const browser = await launch();

  /** One page: where it is served, whether the development profile is filled, whether the library loads, what the server holds. */
  async function open(o) {
    const base = o.base || DEV_BASE, origin = new URL(base).origin, prefix = new URL(base).pathname;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: 'ar-EG', timezoneId: 'Africa/Cairo' });
    const errors = [], realHits = [];
    await ctx.addInitScript((seed) => {
      try {
        if (seed.db && !localStorage.getItem('__fakesb')) localStorage.setItem('__fakesb', JSON.stringify(seed.db));
        if (seed.cache && localStorage.getItem('rebuilt_state_v1') === null) localStorage.setItem('rebuilt_state_v1', seed.cache);
        if (seed.cfg && sessionStorage.getItem('__sbcfg') === null) sessionStorage.setItem('__sbcfg', JSON.stringify(seed.cfg));
      } catch (e) {}
    }, { db: o.db || null, cache: o.cache || null, cfg: o.cfg || null });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('dialog', (d) => { errors.push('native dialog: ' + d.type()); d.dismiss(); });
    await page.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (/\.supabase\.co$/.test(u.hostname)) { realHits.push(u.href); return route.abort(); }   // nothing real may be reached
      if (u.origin === origin && u.pathname.startsWith(prefix)) {
        let p = decodeURIComponent(u.pathname.slice(prefix.length)); if (p === '' || p === '/') p = '/index.html';
        const f = path.join(ROOT, p);
        if (!f.startsWith(ROOT) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
        let body = fs.readFileSync(f);
        if (p === '/js/supabaseClient.js' && base === DEV_BASE) body = Buffer.from(profileClient(body.toString('utf8'), !!o.filled));
        return route.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body });
      }
      if (/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/.test(u.href)) return o.blockLib ? route.abort() : route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE });
      if (/fonts\.(googleapis|gstatic)\.com/.test(u.hostname)) return route.abort();
      return route.abort();
    });
    return { ctx, page, errors, realHits, base };
  }
  const settle = (page, ms = 600) => page.waitForTimeout(ms);
  const setCfg = (page, cfg) => page.evaluate((c) => { sessionStorage.setItem('__sbcfg', JSON.stringify(c)); }, cfg);
  const bodyText = (page) => page.evaluate(() => document.body.innerText);
  const cache = (page) => page.evaluate(() => localStorage.getItem('rebuilt_state_v1'));
  const errorScreen = (page) => page.evaluate(() => {
    const el = document.querySelector('#backend-error');
    return el ? { kind: el.getAttribute('data-kind'), text: el.innerText, retry: !!el.querySelector('[data-be="retry"]'), visible: !!(el.offsetWidth || el.offsetHeight) } : null;
  });
  const appShown = (page) => page.evaluate(() => { const a = document.getElementById('app'); return !!a && !a.hidden; });

  /* ---------- 1. healthy server, stale device copy ---------- */
  {
    const T = (n) => 'dev, server up: ' + n;
    const { ctx, page, errors, realHits } = await open({ filled: true, db: serverDb(), cache: POISON });
    await page.goto(DEV_BASE + '/#habits', { waitUntil: 'load' });
    await page.waitForSelector('.row--habit', { timeout: 10000 }).catch(() => {}); await settle(page);
    const info = await page.evaluate(() => ({ diag: REBUILT.SupabaseClient.diagnose(), created: (window.__sb && window.__sb.created) || [] }));
    log(T('strict mode is on and the page is a real-auth page'), info.diag.strict === true && /REAL AUTH/.test(info.diag.mode), info.diag.mode + ' strict=' + info.diag.strict);
    log(T('it talks to the development project only (never the production one)'), info.created.length >= 1 && info.created.every((c) => c.url === DEV_URL), JSON.stringify(info.created.map((c) => c.url)));
    const text = await bodyText(page);
    await page.screenshot({ path: path.join(OUT, 'strict_healthy_dev.png') });
    log(T("the server's habit is shown"), /SERVER-HABIT/.test(text));
    log(T('the stale device copy is never shown'), !/STALE-LOCAL-COPY|STALE-NAME/.test(text));
    await page.click('.row--habit .row__check'); await settle(page, 900);
    log(T('a completion reaches the server'), (await page.evaluate(() => window.__sb.db.tables.habit_completions.length)) === 1);
    log(T('the device copy is neither read nor rewritten (still exactly what an older version left)'), (await cache(page)) === POISON);
    log(T('no error screen, no pageerror, no request to a real *.supabase.co host'), (await errorScreen(page)) === null && errors.length === 0 && realHits.length === 0, errors.concat(realHits).join(' | '));
    await ctx.close();
  }

  /* ---------- 2. server down at start ---------- */
  {
    const T = (n) => 'dev, server down at start: ' + n;
    const { ctx, page, errors } = await open({ filled: true, db: serverDb(), cache: POISON, cfg: { down: true } });
    await page.goto(DEV_BASE + '/#habits', { waitUntil: 'load' });
    await page.waitForSelector('#backend-error', { timeout: 10000 }).catch(() => {}); await settle(page, 300);
    const es = await errorScreen(page);
    await page.screenshot({ path: path.join(OUT, 'strict_error_screen.png') });
    log(T('a blocking error screen is shown'), !!es && es.visible && es.kind === 'network', JSON.stringify(es && { kind: es.kind, visible: es.visible }));
    log(T('it offers «try again»'), !!es && es.retry);
    log(T('the app behind it is hidden'), (await appShown(page)) === false);
    const text = await bodyText(page);
    log(T('the stale device copy is not shown instead'), !/STALE-LOCAL-COPY|STALE-NAME/.test(text) && !/SERVER-HABIT/.test(text));
    log(T('the device copy was not touched'), (await cache(page)) === POISON);
    await setCfg(page, {});                                        // the server comes back
    if (await page.$('[data-be="retry"]')) await page.click('[data-be="retry"]', { timeout: 3000 }).catch(() => {});   // (missing button = a FAIL above, not a crash)
    await page.waitForSelector('.row--habit', { timeout: 6000 }).catch(() => {}); await settle(page);
    log(T('«try again» works once the server is back: the real data appears'), /SERVER-HABIT/.test(await bodyText(page)) && (await errorScreen(page)) === null);
    log(T('no uncaught error'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ---------- 3. one table failing ---------- */
  {
    const T = (n) => 'dev, the tasks table fails: ' + n;
    const { ctx, page } = await open({ filled: true, db: serverDb(), cache: POISON, cfg: { fail: { 'select:tasks': { code: '42501', message: 'permission denied for table tasks' } } } });
    await page.goto(DEV_BASE + '/#habits', { waitUntil: 'load' });   // the habits DID load: they must not be shown next to a failed tasks table
    await page.waitForSelector('#backend-error, .row--habit', { timeout: 10000 }).catch(() => {}); await settle(page, 300);
    const es = await errorScreen(page);
    log(T('a blocking error screen, not an empty task list'), !!es && es.visible && (await appShown(page)) === false, JSON.stringify(es && es.kind));
    log(T('it names the table that failed'), !!es && /tasks/.test(es.text), es && es.text.replace(/\s+/g, ' ').slice(0, 160));
    log(T('the habits that DID load are not shown as if everything were fine'), !/SERVER-HABIT/.test(await bodyText(page)));
    await ctx.close();
  }

  /* ---------- 4. a write is rejected ---------- */
  {
    const T = (n) => 'dev, a write is rejected: ' + n;
    const { ctx, page, errors } = await open({ filled: true, db: serverDb(), cache: POISON });
    await page.goto(DEV_BASE + '/#habits', { waitUntil: 'load' });
    await page.waitForSelector('.row--habit', { timeout: 10000 }).catch(() => {}); await settle(page);
    await page.evaluate(() => { window.__sb.cfg.fail = { 'insert:habits': { code: '42501', message: 'new row violates row-level security policy for table "habits"' } }; window.__sb.errors.length = 0; });
    await page.click('[data-action="open-add-habit"]'); await page.waitForSelector('#habit-form');
    await page.fill('#m-title', 'UNSAVED-HABIT');
    await page.click('#habit-form button[type=submit]');
    await page.waitForSelector('.toast--danger', { timeout: 6000 }).catch(() => {});
    const toast = await page.evaluate(() => { const t = document.querySelector('.toast--danger'); return t ? t.innerText : null; });
    log(T('a visible error message appears'), !!toast, toast && toast.replace(/\s+/g, ' '));
    await settle(page, 1800);
    const text = await bodyText(page);
    log(T('the screen goes back to what the server really holds: the unsaved habit is gone'), !/UNSAVED-HABIT/.test(text) && /SERVER-HABIT/.test(text));
    log(T('the server never received it'), (await page.evaluate(() => window.__sb.db.tables.habits.map((h) => h.title))).join() === 'SERVER-HABIT');
    log(T('the failure was a 42501 from the server (so the test double really refused)'), (await page.evaluate(() => window.__sb.errors.some((e) => e.code === '42501' && e.table === 'habits'))));
    log(T('the device copy was not touched'), (await cache(page)) === POISON);
    log(T('no uncaught error'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ---------- 5. the library never loads ---------- */
  {
    const T = (n) => 'dev, supabase-js blocked: ' + n;
    const { ctx, page, errors } = await open({ filled: true, blockLib: true, cache: POISON });
    await page.goto(DEV_BASE + '/', { waitUntil: 'load' });
    await page.waitForSelector('#backend-error, .landing', { timeout: 10000 }).catch(() => {}); await settle(page, 300);
    const es = await errorScreen(page);
    const info = await page.evaluate(() => ({ diag: REBUILT.SupabaseClient.diagnose(), form: !!document.querySelector('#auth-form'), landing: !!document.querySelector('.landing'), localNotice: !!document.querySelector('.landing__mode') }));
    log(T('a blocking error screen says the server is unavailable'), !!es && es.visible && es.kind === 'unavailable', JSON.stringify(es && es.kind));
    log(T('no device-only sign-in is offered and the app is not opened from the device copy (no landing page, no form, no «local mode» notice, app hidden)'), !info.form && !info.landing && !info.localNotice && (await appShown(page)) === false);
    log(T('diagnose() does not call this «local»'), !/^local/.test(info.diag.mode) && info.diag.strict === true, info.diag.mode);
    log(T('the device copy was not touched'), (await cache(page)) === POISON);
    log(T('no uncaught error'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ---------- 6. a table bigger than one answer ---------- */
  {
    const T = (n) => 'dev, 2500 completions (the API cuts every answer at 1000): ' + n;
    const { ctx, page } = await open({ filled: true, db: serverDb({ completions: 2500 }), cfg: { maxRows: 1000 } });
    await page.goto(DEV_BASE + '/#habits', { waitUntil: 'load' });
    await page.waitForSelector('.row--habit', { timeout: 15000 }).catch(() => {}); await settle(page, 800);
    const n = await page.evaluate(() => { const h = REBUILT.App.state.habits[0]; return h ? h.completionHistory.length : -1; });
    log(T('all of them are loaded'), n === 2500, 'loaded ' + n);
    await ctx.close();
  }

  /* ---------- 7. the profile is empty, exactly as shipped ---------- */
  {
    const T = (n) => 'dev, profile empty (as shipped): ' + n;
    const { ctx, page, errors, realHits } = await open({ filled: false });
    await page.goto(DEV_BASE + '/', { waitUntil: 'load' });
    await page.waitForSelector('.landing', { timeout: 10000 }).catch(() => {}); await settle(page, 300);
    const info = await page.evaluate(() => ({ diag: REBUILT.SupabaseClient.diagnose(), landing: !!document.querySelector('.landing'), notice: !!document.querySelector('.landing__mode'), error: !!document.querySelector('#backend-error'), created: (window.__sb && window.__sb.created) || [] }));
    log(T('deliberate local mode: landing + «local mode» notice, no error screen'), info.landing && info.notice && !info.error && /^local/.test(info.diag.mode) && info.diag.strict === false, info.diag.mode);
    log(T('no client is created and no request leaves for a *.supabase.co host'), info.created.length === 0 && realHits.length === 0);
    log(T('no uncaught error'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ---------- 8. STABLE is unchanged ---------- */
  {
    const T = (n) => 'stable, unchanged: ' + n;
    const { ctx, page, errors } = await open({ base: STABLE_BASE, db: serverDb() });
    await page.goto(STABLE_BASE + '/#habits', { waitUntil: 'load' });
    await page.waitForSelector('.row--habit', { timeout: 10000 }).catch(() => {}); await settle(page);
    const diag = await page.evaluate(() => REBUILT.SupabaseClient.diagnose());
    log(T('strict mode is off and it uses the production project'), diag.strict === false && diag.channel === 'stable' && (await page.evaluate(() => window.__sb.created.every((c) => c.url === 'https://jvyhtpfedkypwdzyadba.supabase.co'))), 'strict=' + diag.strict);
    log(T('the device mirror is still written'), (await cache(page)) !== null && /SERVER-HABIT/.test(await cache(page)));
    // a rejected write stays silent on stable (today's behaviour — it changes only when Stable is promoted, with the owner's approval)
    await page.evaluate(() => { window.__sb.cfg.fail = { 'insert:habits': { code: '42501', message: 'rls' } }; });
    await page.click('[data-action="open-add-habit"]'); await page.waitForSelector('#habit-form');
    await page.fill('#m-title', 'STABLE-UNSAVED');
    await page.click('#habit-form button[type=submit]'); await settle(page, 1500);
    log(T('a rejected write shows no error message and no error screen (as before)'), (await page.$('.toast--danger')) === null && (await errorScreen(page)) === null);
    log(T('the unsaved habit stays on the screen (as before)'), /STABLE-UNSAVED/.test(await bodyText(page)));
    // a server that is down: the mirror is used (as before)
    await page.evaluate(() => { window.__sb.cfg.fail = {}; });
    await setCfg(page, { down: true });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.row--habit, #backend-error', { timeout: 10000 }).catch(() => {}); await settle(page);
    log(T('with the server down, the app falls back to the device mirror (as before) and shows no error screen'), /SERVER-HABIT/.test(await bodyText(page)) && (await errorScreen(page)) === null);
    log(T('no uncaught error'), errors.length === 0, errors.join(' | '));
    await ctx.close();
  }

  /* ---------- 9. the order rows come back in (habits / tasks / schedule items): creation order, a tie broken by id ---------- */
  {
    // Stored in an order that is neither creation order nor id order; the ids sort AGAINST creation order.
    const wrongOrder = () => {
      const db = serverDb();
      const mk = (id, title, at, extra) => Object.assign({ id, user_id: 'u1', title, description: '', created_at: at }, extra);
      const hab = (id, title, at) => mk(id, title, at, { icon: 'flame', xp: 20, frequency: 'daily', target_days: [], time: null });
      db.tables.habits = [
        hab('a1000000-0000-4000-8000-000000000000', 'ORD-3-THIRD', '2026-10-03T09:00:00Z'),
        hab('f2000000-0000-4000-8000-000000000000', 'ORD-5-TIE-B', '2026-10-04T00:00:00'),
        hab('c3000000-0000-4000-8000-000000000000', 'ORD-1-FIRST', '2026-10-01T09:00:00Z'),
        hab('f1000000-0000-4000-8000-000000000000', 'ORD-4-TIE-A', '2026-10-04T00:00:00'),
        hab('b2000000-0000-4000-8000-000000000000', 'ORD-2-SECOND', '2026-10-02T09:00:00Z'),
      ];
      const tsk = (id, title, at) => mk(id, title, at, { priority: 'high', date: null, time: null, xp: 25, completed: false, completed_at: null, xp_awarded: 0 });
      db.tables.tasks = [
        tsk('a1000000-0000-4000-8000-000000000001', 'ORD-3-THIRD', '2026-10-03T09:00:00Z'),
        tsk('f2000000-0000-4000-8000-000000000001', 'ORD-5-TIE-B', '2026-10-04T00:00:00'),
        tsk('c3000000-0000-4000-8000-000000000001', 'ORD-1-FIRST', '2026-10-01T09:00:00Z'),
        tsk('f1000000-0000-4000-8000-000000000001', 'ORD-4-TIE-A', '2026-10-04T00:00:00'),
        tsk('b2000000-0000-4000-8000-000000000001', 'ORD-2-SECOND', '2026-10-02T09:00:00Z'),
      ];
      const itm = (id, title, at) => mk(id, title, at, { type: 'event', date: '2026-10-05', start_time: '09:00', end_time: null, notes: '', completed: false });
      db.tables.schedule_items = [
        itm('a1000000-0000-4000-8000-000000000002', 'ORD-3-THIRD', '2026-10-03T09:00:00Z'),
        itm('f2000000-0000-4000-8000-000000000002', 'ORD-5-TIE-B', '2026-10-04T00:00:00'),
        itm('c3000000-0000-4000-8000-000000000002', 'ORD-1-FIRST', '2026-10-01T09:00:00Z'),
        itm('f1000000-0000-4000-8000-000000000002', 'ORD-4-TIE-A', '2026-10-04T00:00:00'),
        itm('b2000000-0000-4000-8000-000000000002', 'ORD-2-SECOND', '2026-10-02T09:00:00Z'),
      ];
      return db;
    };
    const WANT = 'ORD-1-FIRST,ORD-2-SECOND,ORD-3-THIRD,ORD-4-TIE-A,ORD-5-TIE-B';
    for (const [label, o, base] of [['dev (strict)', { filled: true }, DEV_BASE], ['stable', { base: STABLE_BASE }, STABLE_BASE]]) {
      const T = (n) => label + ', rows stored out of order: ' + n;
      const { ctx, page, errors } = await open(Object.assign({ db: wrongOrder() }, o));
      await page.goto(base + '/#habits', { waitUntil: 'load' });
      await page.waitForSelector('.row--habit', { timeout: 10000 }).catch(() => {}); await settle(page, 800);
      const shown = await page.$$eval('.row--habit .row__title', (els) => els.map((e) => e.textContent.trim()));
      const st = await page.evaluate(() => { const s = REBUILT.App.state; return { tasks: s.tasks.map((t) => t.title), items: s.scheduleItems.map((i) => i.title) }; });
      if (label === 'dev (strict)') await page.screenshot({ path: path.join(OUT, 'strict_order_habits.png') });
      log(T('the habits page lists the habits in creation order, a tie broken by id'), shown.join() === WANT, shown.join());
      log(T('the loaded tasks are in creation order, a tie broken by id'), st.tasks.join() === WANT, st.tasks.join());
      log(T('the loaded schedule items are in creation order, a tie broken by id'), st.items.join() === WANT, st.items.join());
      log(T('no uncaught error'), errors.length === 0, errors.join(' | '));
      await ctx.close();
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) console.log('FAILED:\n' + failed.map((f) => ' - ' + f.name).join('\n'));
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
