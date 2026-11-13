/* A small stand-in for GitHub Pages + the CDNs the page talks to, for the tests that need the browser's REAL HTTP cache.

   Why it exists: the other browser runners serve the site through Playwright's page.route(), and routing switches the
   browser's HTTP cache OFF — so they can never see what a person sees on a refresh: some files from the cache, some from
   the network, possibly from two different deployments. This server answers over HTTPS like the real thing
   (Cache-Control: max-age=600 + ETag + Last-Modified, 304 on a matching If-None-Match, the same URL layout), and the
   browser is pointed at it with --host-resolver-rules, so the page really is at https://omarelzanaty1.github.io/REBUILT-Developer/.

     const srv = await PagesServer.start({ dir: buildDir, fake: fakeSupabaseSource, outDir });
     const browser = await chromium.launch({ args: srv.launchArgs });   // or launchPersistentContext(dir, { args })
     srv.setBuild(otherDir);                                             // "a new deployment went live"
     srv.rule({ match: /locales\/en\//, delayMs: 1500 });                // slow network / failing files, on purpose
     srv.hits                                                            // every request the server saw: { host, path, status, t }

   Nothing here talks to the internet and nothing is a real Supabase: *.supabase.co answers only the one public settings
   endpoint the app asks for; the client library itself is the in-page test double (tests/browser/fake-supabase.js). */
"use strict";
const https = require("https"), fs = require("fs"), path = require("path"), crypto = require("crypto"), cp = require("child_process");

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".json": "application/json", ".webmanifest": "application/manifest+json" };
const SITE_HOST = "omarelzanaty1.github.io", SITE_BASE = "/REBUILT-Developer/";
const DEV_API_HOST = "zdqwhbtsjjlfkzdywsqt.supabase.co";
const HOSTS = [SITE_HOST, "cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com", DEV_API_HOST];

/** Copy the files the Pages workflow publishes (scripts/site-files.txt) into `dest` — from the working tree, or from a git ref. */
function assembleSite(root, dest, ref) {
  fs.rmSync(dest, { recursive: true, force: true }); fs.mkdirSync(dest, { recursive: true });
  const list = (ref ? cp.execFileSync("git", ["-C", root, "show", ref + ":scripts/site-files.txt"]).toString() : fs.readFileSync(path.join(root, "scripts/site-files.txt"), "utf8"))
    .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (ref) {
    cp.execSync(`git -C "${root}" archive ${ref} -- ${list.map((p) => `"${p}"`).join(" ")} | tar -x -C "${dest}"`, { stdio: "pipe" });
  } else {
    list.forEach((p) => fs.cpSync(path.join(root, p), path.join(dest, p), { recursive: true }));
  }
  return dest;
}

function makeCert(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const key = path.join(dir, "test-key.pem"), crt = path.join(dir, "test-cert.pem");
  if (!fs.existsSync(key) || !fs.existsSync(crt)) {
    const san = HOSTS.map((h) => "DNS:" + h).join(",");
    cp.execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", crt, "-days", "3", "-subj", "/CN=rebuilt-test", "-addext", "subjectAltName=" + san], { stdio: "pipe" });
  }
  return { key: fs.readFileSync(key), cert: fs.readFileSync(crt) };
}

async function start(opts) {
  const o = Object.assign({ dir: null, fake: "", outDir: require("os").tmpdir(), maxAge: 600 }, opts);
  const st = { dir: o.dir, rules: [], hits: [], maxAge: o.maxAge, tag: "" };
  const server = https.createServer(makeCert(path.join(o.outDir, "pages-cert")), async (req, res) => {
    const host = String(req.headers.host || "").split(":")[0].toLowerCase();
    const url = new URL(req.url, "https://" + host);
    const hit = { host, path: url.pathname, status: 0, t: Date.now(), build: st.tag };
    st.hits.push(hit);
    const finish = (status, headers, body) => { hit.status = status; res.writeHead(status, headers); res.end(body); };
    try {
      // failure / latency injection (a slow or flaky network, on purpose)
      for (const r of st.rules) {
        const m = typeof r.match === "function" ? r.match(host, url.pathname, req) : r.match.test(host + url.pathname);
        if (!m) continue;
        if (r.times !== undefined) { if (r.times <= 0) continue; r.times -= 1; }
        if (r.drop) { hit.status = -1; return req.socket.destroy(); }
        if (r.hang) { hit.status = -2; return; }
        const d = typeof r.delayMs === "function" ? r.delayMs() : r.delayMs;
        if (d) await new Promise((ok) => setTimeout(ok, d));
        if (r.status) return finish(r.status, { "content-type": r.contentType || (r.body !== undefined ? "text/javascript" : "text/plain"), "cache-control": "no-store" }, r.body !== undefined ? r.body : "injected " + r.status);
      }
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "apikey, authorization, content-type, x-client-info", "access-control-allow-methods": "GET, POST, OPTIONS" };
      if (host === DEV_API_HOST) {
        if (req.method === "OPTIONS") return finish(204, cors, "");
        if (url.pathname === "/auth/v1/settings") return finish(200, Object.assign({ "content-type": "application/json" }, cors), JSON.stringify({ external: { email: true, google: true, github: false }, disable_signup: false, mailer_autoconfirm: false }));
        return finish(404, cors, "{}");
      }
      if (host === "cdn.jsdelivr.net") {
        if (/\/npm\/@supabase\/supabase-js/.test(url.pathname)) return finish(200, { "content-type": "application/javascript", "cache-control": "public, max-age=604800" }, o.fake);
        return finish(404, {}, "nf");
      }
      if (host === "fonts.googleapis.com") return finish(200, { "content-type": "text/css", "cache-control": "max-age=86400" }, "/* fonts: not needed in tests */");
      if (host === "fonts.gstatic.com") return finish(404, {}, "nf");
      if (host !== SITE_HOST) return finish(404, {}, "nf");

      // the site, under its Pages sub-path
      if (url.pathname === SITE_BASE.replace(/\/$/, "")) return finish(301, { location: SITE_BASE }, "");
      if (!url.pathname.startsWith(SITE_BASE)) return finish(404, { "content-type": "text/html" }, "<h1>404</h1>");
      let rel = decodeURIComponent(url.pathname.slice(SITE_BASE.length)); if (rel === "" || rel.endsWith("/")) rel += "index.html";
      const file = path.join(st.dir, rel);
      if (!file.startsWith(st.dir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return finish(404, { "content-type": "text/html" }, "<h1>404</h1>");
      const body = fs.readFileSync(file);
      const etag = '"' + crypto.createHash("md5").update(body).digest("hex").slice(0, 16) + '"';
      const headers = { "content-type": MIME[path.extname(file)] || "application/octet-stream", "cache-control": "max-age=" + st.maxAge, etag, "last-modified": fs.statSync(file).mtime.toUTCString(), "access-control-allow-origin": "*" };
      if (req.headers["if-none-match"] === etag) return finish(304, headers, "");
      return finish(200, headers, body);
    } catch (err) {
      return finish(500, { "content-type": "text/plain" }, String(err && err.message));
    }
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const port = server.address().port;
  const api = {
    port,
    origin: "https://" + SITE_HOST,
    url: "https://" + SITE_HOST + SITE_BASE,
    // --no-proxy-server: the browser must talk to THIS server, not to a proxy from the environment.
    // "MAP * ~NOTFOUND": every other name fails to resolve, so nothing in a test can leave the machine.
    launchArgs: ["--no-proxy-server", "--host-resolver-rules=" + HOSTS.map((h) => `MAP ${h} 127.0.0.1:${port}`).concat(["MAP * ~NOTFOUND"]).join(", "), "--ignore-certificate-errors"],
    get hits() { return st.hits; },
    setBuild(dir, tag) { st.dir = dir; st.tag = tag || path.basename(dir); },
    rule(r) { st.rules.push(r); return r; },
    clearRules() { st.rules.length = 0; },
    resetHits() { st.hits.length = 0; },
    /** requests for the site's own files since the last reset: [{ path, status }] */
    siteHits() { return st.hits.filter((h) => h.host === SITE_HOST); },
    close() { return new Promise((ok) => { server.closeAllConnections && server.closeAllConnections(); server.close(ok); }); },
  };
  api.setBuild(o.dir, o.dir ? path.basename(o.dir) : "");
  return api;
}

module.exports = { start, assembleSite, SITE_HOST, SITE_BASE, HOSTS };
