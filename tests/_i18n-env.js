/* Shared by the tests that run app scripts in a bare vm: gives the sandbox the translation engine and every
   dictionary (exactly what index.html loads, in the same order), so code that calls REBUILT.t() behaves as in the browser. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.resolve(__dirname, "..");

/** The scripts index.html loads before the app: prefs, the engine, then each language's dictionaries. */
function i18nFiles() {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  return ["js/prefs.js", "js/i18n.js"].concat([...html.matchAll(/<script src="(js\/locales\/[^"]+)"/g)].map((m) => m[1]));
}

/** Run them inside an existing (already contextified) sandbox. A throw-away `document` is lent for the engine's own
    start-up and taken away again, so a test that checks for "no document" still sees none. */
function installI18n(sandbox) {
  const lent = !sandbox.document;
  if (lent) sandbox.document = { documentElement: { setAttribute() {}, getAttribute() { return null; } }, querySelectorAll: () => [], querySelector: () => null };
  sandbox.window = sandbox.window || sandbox;
  vm.runInContext("window.REBUILT = window.REBUILT || {};", sandbox);
  i18nFiles().forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox, { filename: f }));
  if (lent) delete sandbox.document;
  return sandbox.REBUILT.I18n;
}

module.exports = { installI18n, i18nFiles };
