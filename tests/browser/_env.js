/* Shared set-up for the browser test runners (tests/browser/run_*.js).
   ROOT  = the site (the repository root), served by each runner on a pretend address
   TESTS = this folder (fake-supabase.js lives here)
   OUT   = where screenshots and result files go (never committed); override with RB_OUT */
"use strict";
const path = require("path"), fs = require("fs"), os = require("os");

const ROOT = path.resolve(__dirname, "..", "..");
const TESTS = __dirname;
const OUT = process.env.RB_OUT || path.join(os.tmpdir(), "rebuilt-browser-out");
fs.mkdirSync(OUT, { recursive: true });

function loadPlaywright() {
  const tries = ["playwright", path.join(ROOT, "node_modules", "playwright"), "/opt/npm-tools/node_modules/playwright"];
  for (const t of tries) { try { return require(t); } catch (e) { /* try the next place */ } }
  console.error("Playwright is not installed. From the repository root run:  npm install  &&  npx playwright install chromium");
  process.exit(2);
}

const chromium = loadPlaywright().chromium;
const KNOWN_CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
/** Launch Chromium: RB_CHROME if set, else the pre-installed build when present, else Playwright's own. */
function launch() {
  const exe = process.env.RB_CHROME || (fs.existsSync(KNOWN_CHROME) ? KNOWN_CHROME : null);
  return chromium.launch(exe ? { executablePath: exe } : {});
}

module.exports = { ROOT, TESTS, OUT, chromium, launch };
