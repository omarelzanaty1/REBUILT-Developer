// Proves the kill-switch worker cleans up a browser that installed the OLD cache-first worker.
const { launch, ROOT, OUT, TESTS } = require('./_env');
const http = require('http'), fs = require('fs'), path = require('path');
const OLD_SW = `const CACHE_NAME="rebuilt-web-v1";const APP_SHELL=["./","./index.html","./css/styles.css"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(["./index.html"])));self.skipWaiting();});
self.addEventListener("activate",e=>{self.clients.claim();});
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request)));});`;
let serveOld = true;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json', '.json':'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/index.html';
  if (p === '/sw.js' && serveOld) { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); return res.end(OLD_SW); }
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(f).pipe(res);
});
const out = [];
const log = (n, ok, d) => { out.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? ' — ' + d : '')); };
(async () => {
  await new Promise(r => server.listen(0, r)); const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await launch();
  const ctx = await browser.newContext({ serviceWorkers: 'allow' }); const page = await ctx.newPage();
  await page.goto(base + '/');
  await page.evaluate(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; });
  await page.waitForTimeout(800);
  let st = await page.evaluate(async () => ({ regs: (await navigator.serviceWorker.getRegistrations()).length, caches: await caches.keys() }));
  log('setup: old cache-first worker installed with its cache', st.regs === 1 && st.caches.includes('rebuilt-web-v1'), JSON.stringify(st));
  serveOld = false; // the new deployment ships the kill-switch sw.js
  await page.evaluate(async () => { const r = (await navigator.serviceWorker.getRegistrations())[0]; await r.update(); });
  await page.waitForTimeout(2000);
  st = await page.evaluate(async () => ({ regs: (await navigator.serviceWorker.getRegistrations()).length, caches: await caches.keys() }));
  log('kill switch: old caches deleted', st.caches.length === 0, JSON.stringify(st.caches));
  log('kill switch: worker unregistered', st.regs === 0, 'registrations=' + st.regs);
  await browser.close(); server.close();
  process.exit(out.every(Boolean) ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
