// Environment separation, in a real browser: each address the app can be served from is loaded and the page is
// asked which channel and backend it chose. The Supabase test double stands in for supabase-js, so NOTHING
// reaches a real service; what is proved is WHICH project the page asked for (or that it asked for none).
//   stable addresses       → the production project, exactly as before
//   development / local    → no project at all (local mode), no request to any *.supabase.co host, noindex on development
const { launch, ROOT, OUT, TESTS } = require('./_env');
const fs = require('fs'), path = require('path');
const FAKE = fs.readFileSync(TESTS + '/fake-supabase.js', 'utf8');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json', '.webmanifest':'application/manifest+json' };
const PROD = 'https://jvyhtpfedkypwdzyadba.supabase.co';
const results = [];
const log = (name, ok, detail) => { results.push({ name, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : '')); };

// [address, expected channel, uses production?]
const ADDRESSES = [
  ['https://getrebuilt.online/', 'stable', true],
  ['https://www.getrebuilt.online/', 'stable', true],
  ['https://omarelzanaty1.github.io/rebuilt0.4/', 'stable', true],
  ['https://omarelzanaty1.github.io/REBUILT-Developer/', 'development', false],
  ['https://rebuilt-jet.vercel.app/', 'development', false],
  ['http://localhost:4173/', 'local', false],
  ['https://example.org/rebuilt0.4/', 'unknown', false],
  ['https://omarelzanaty1.github.io/some-other-site/', 'unknown', false],
];

(async () => {
  const browser = await launch();
  for (const [address, channel, prod] of ADDRESSES) {
    const u0 = new URL(address); const BASE = u0.pathname;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'ar-EG', timezoneId: 'Africa/Cairo' });
    const page = await ctx.newPage();
    const errors = [], supabaseHits = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const u = new URL(route.request().url());
      if (/\.supabase\.co$/.test(u.hostname)) { supabaseHits.push(u.href); return route.abort(); }   // nothing real may be reached
      if (u.origin === u0.origin && u.pathname.startsWith(BASE)) {
        let p = u.pathname.slice(BASE.length); if (p === '') p = 'index.html';
        const f = path.join(ROOT, decodeURIComponent(p));
        if (!f.startsWith(ROOT) || !fs.existsSync(f)) return route.fulfill({ status: 404, body: 'nf' });
        return route.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
      }
      if (/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/.test(u.href)) return route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE });
      return route.abort();
    });
    await page.goto(address, { waitUntil: 'load' });
    await page.waitForSelector('.landing, #auth-form, .gate', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
    const info = await page.evaluate(() => ({
      diag: REBUILT.SupabaseClient.diagnose(),
      attr: document.documentElement.getAttribute('data-channel'),
      robots: !!document.querySelector('meta[name="robots"][content*="noindex"]'),
      created: (window.__sb && window.__sb.created) || [],
      marker: (document.querySelector('meta[name="rebuilt-build"]') || {}).content,
      title: document.title,
      gateShown: !!document.querySelector('.landing, #auth-form, .gate'),
    }));
    const tag = `[${address}]`;
    log(`${tag} channel is "${channel}"`, info.diag.channel === channel && info.attr === channel, `diagnose=${info.diag.channel} attr=${info.attr}`);
    log(`${tag} the app renders (no uncaught error)`, info.gateShown && errors.length === 0, errors.join(' | '));
    log(`${tag} build marker is served`, /^\d+\.\d+\.\d+ \S+ \d{4}-\d{2}-\d{2}$/.test(info.marker || ''), info.marker);
    if (prod) {
      log(`${tag} asks for the PRODUCTION project`, info.created.length >= 1 && info.created.every(c => c.url === PROD), JSON.stringify(info.created.map(c => c.url)));
      log(`${tag} no robots noindex on stable`, info.robots === false);
      log(`${tag} reports backend = production project`, info.diag.backend === 'production project', info.diag.backend);
    } else {
      log(`${tag} never asks for the production project (no client created at all)`, info.created.length === 0, JSON.stringify(info.created));
      log(`${tag} sends no request to any *.supabase.co host`, supabaseHits.length === 0, supabaseHits.join(' '));
      log(`${tag} runs in local mode with the reason stated`, /^local/.test(info.diag.mode) && !!info.diag.reasonIfLocal, info.diag.mode + ' / ' + info.diag.reasonIfLocal);
      log(`${tag} development-type pages carry robots noindex; others do not`, info.robots === (channel === 'development'), 'robots=' + info.robots);
    }
    await ctx.close();
  }
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) console.log('FAILED:\n' + failed.map(f => ' - ' + f.name).join('\n'));
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
