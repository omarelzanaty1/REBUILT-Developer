#!/usr/bin/env node
/* Stamps a build id onto every script and stylesheet URL of the PUBLISHED index.html:
       <script src="js/app.js">   ->   <script src="js/app.js?v=6323b01">
   and appends the id to the build marker:   content="0.4.6 dev-split 2026-10-29"  ->  "...+6323b01".

   Why: GitHub Pages answers every file with  Cache-Control: max-age=600,  and a browser keeps each file for those ten minutes
   independently. Right after a deployment a refresh can therefore pair the NEW index.html with OLD copies of some scripts
   and dictionaries (or the other way round), and the page is then half one version, half the other — for the language
   that shows up as texts that "go back to Arabic" or as missing words. With a different URL per build, a page can only
   ever load the files of the build that its own index.html names: new page -> new files, an old cached page -> the old
   files it was written for. (js/i18n.js reads the same ?v= from its own address when it has to fetch a dictionary again.)

   Used by .github/workflows/pages.yml on the assembled _site only. The source files in the repository are never changed,
   so a local run (or a test server that ignores the query string) behaves exactly as before.

       node scripts/stamp-build.js <site-dir> <build-id>
*/
"use strict";
const fs = require("fs"), path = require("path");

const LOCAL = /^(?:js|css)\/[^"'?#\s]+$/;

/** Returns { html, stamped, skipped } for an index.html text. Pure, so the test can call it directly. */
function stamp(html, id) {
  if (!/^[0-9a-zA-Z][0-9a-zA-Z._-]{1,40}$/.test(id || "")) throw new Error("build id must be a short token (e.g. a git sha), got: " + JSON.stringify(id));
  let stamped = 0, skipped = 0;
  const out = html.replace(/(<(?:script|link)\b[^>]*?\s(?:src|href)=")([^"]+)(")/g, (all, pre, url, post) => {
    if (!LOCAL.test(url)) { if (/^(?:js|css)\//.test(url)) skipped++; return all; }   // external (CDN, fonts) and non-code files are left alone
    stamped++;
    return pre + url + "?v=" + id + post;
  });
  const marked = out.replace(/(<meta name="rebuilt-build" content=")([^"]*)(")/, (all, pre, val, post) => pre + (val.endsWith("+" + id) ? val : val + "+" + id) + post);
  return { html: marked, stamped, skipped };
}

if (require.main === module) {
  const [dir, id] = process.argv.slice(2);
  if (!dir || !id) { console.error("usage: node scripts/stamp-build.js <site-dir> <build-id>"); process.exit(2); }
  const file = path.join(dir, "index.html");
  const before = fs.readFileSync(file, "utf8");
  const r = stamp(before, id);
  if (!r.stamped) { console.error("no local js/ or css/ URL found in " + file + " — nothing to stamp"); process.exit(1); }
  const left = (r.html.match(/(?:src|href)="(?:js|css)\/[^"?#]+"/g) || []);
  if (left.length) { console.error("unstamped local URLs left: " + left.slice(0, 3).join(", ")); process.exit(1); }
  if (!/<meta name="rebuilt-build" content="[^"]*\+/.test(r.html)) { console.error("the build marker was not updated"); process.exit(1); }
  fs.writeFileSync(file, r.html);
  console.log("stamped " + r.stamped + " URLs with ?v=" + id + " in " + file);
}
module.exports = { stamp };
