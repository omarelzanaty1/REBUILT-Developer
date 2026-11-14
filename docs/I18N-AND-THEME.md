# اللغات والمظهر — Language & Theme

Two things a person can change at any time, from **Settings → Appearance & language** or from the small switch on the
welcome / sign-in / onboarding screens. Both apply **instantly** (no reload), are saved **on the device**, and are
applied **before the first paint** (no flash of the wrong theme).

| | choices | default |
|---|---|---|
| Language | العربية (`ar`, RTL) · English (`en`, LTR) | Arabic |
| Theme | Dark · Light · System (follows the device, live) | Dark |

Nothing here touches the database, Auth, or the person's data. The choice lives in `localStorage` under
`rebuilt_prefs_v1` (`{lang, theme}`), **separate** from the app's state (`rebuilt_state_v1`). It survives reload,
sign-out and sign-in.

## How it is built

| file | what it does |
|---|---|
| `js/prefs.js` | reads/writes `rebuilt_prefs_v1` (every access in try/catch) |
| `js/i18n.js` | the engine: `REBUILT.t("ns.key", {params})`, plurals, `I18n.date / number / time`, `setLang`, `onChange`, `translateStatic` |
| `js/theme.js` | `REBUILT.Theme`: `getPref / getResolved / setPref / onChange`; sets `<html data-theme>` (the resolved one), `meta theme-color`, `meta color-scheme` |
| `js/locales/<lang>/<ns>.js` | the dictionaries: `REBUILT.I18n.add("en", "habits", { key: "text" })` |
| `index.html` (inline `rebuilt-prefs-boot`) | sets `lang`, `dir`, `data-theme` before the first paint |
| `css/tokens.css` | **all** colours; `:root` = dark, `:root[data-theme="light"]` = light. Components use tokens only |
| `css/direction.css` | what a logical property cannot express in LTR (mirrored arrows, select caret, switch knob…) |

`app.js` listens to `I18n.onChange` and `Theme.onChange` and redraws the shell, the current page and the tab title
(`repaint()`); on the sign-in screens `Gate.rerender()` does the same and keeps what was typed.

## Start-up safety — why a refresh can no longer leave the screen half-translated

The dictionaries are 30 small files (15 areas × 2 languages). The bug that was reported — *"I chose English, refreshed, and some
texts went back to Arabic or showed odd words"* — came from one weakness: **if any one of those files was missing or stale when the
page started, the app drew anyway with a partial dictionary and never tried again.** Two things can cause that, and both are
intermittent by nature:

1. **A file that fails to arrive** (a network hiccup, a 503, a truncated response). That area falls back to Arabic, and a key nobody
   had translated was shown as the bare key.
2. **Two deployments mixed in the browser cache.** GitHub Pages answers every file with `Cache-Control: max-age=600`, and the browser
   keeps each file for those ten minutes on its own. For ten minutes after a deployment, a refresh can pair the *new* `index.html`
   with *old* copies of some scripts / dictionaries.

What now prevents it (none of it touches the person's data or saved settings):

| layer | what it does | where |
|---|---|---|
| **Check before the first screen** | `I18n.ready()` verifies that every namespace of the language in use *and* of Arabic is registered and that each file has the same keys as its twin in the other language. Anything missing or out of step is fetched again (cache-busted `&r=`, up to 3 rounds, bounded in time) **before** anything is drawn. When all is well it costs nothing: no request, no timer. | `js/i18n.js`, called first thing in `App.init` |
| **If it still cannot** | the app draws with the Arabic fallback (never a key), logs one `REBUILT i18n:` error to the console, keeps retrying in the background (5 s, 15 s, 45 s) and **redraws by itself** when the file arrives — no refresh needed | `ready()` / `heal()` / `add()` |
| **No programmer's key on screen, ever** | a key that exists in no language shows nothing; a key not yet translated shows Arabic; each is warned about **once** in the console (`REBUILT i18n: …`) and listed in `I18n.missing()` | `t()` |
| **One deployment = one set of files** | the Pages workflow stamps the commit onto every script / stylesheet address of the *published* `index.html` (`js/app.js?v=<sha>`), so a page can only load the files of the build its own `index.html` names. `i18n.js` re-fetches a dictionary from the same build (it reads the `?v=` of its own address). The build marker becomes `0.4.6 dev-split 2026-10-29+<sha>`, and the workflow's *verify* job now checks that the files of **this commit** are the ones served. | `scripts/stamp-build.js`, `.github/workflows/pages.yml` |
| **No hidden cache** | no service worker is registered (`sw.js` is only a kill-switch that deletes old Cache Storage — never localStorage) | `sw.js`, `tests/browser/run_sw.js` |
| **First paint** | `index.html` sets `lang` / `dir` / theme before the first paint; `#app` and the sign-in screen stay `hidden` until the first real draw, which happens after `ready()` | boot script, `App.init` |

The source tree is never stamped, so a local run (or any static server) works exactly as before; only the published copy is.

Adding a namespace: add its file under `js/locales/<lang>/`, its `<script>` line in `index.html`, **and** its name in `I18n.NAMESPACES`
(`tests/i18n.test.js` fails if the three disagree).

## Theme change — the circular reveal

Tapping a theme button (the sun / moon on the welcome, sign-in, sign-up, recovery and onboarding screens, or a choice in Settings)
grows a circle of the **new** theme from the centre of that button until it covers the screen (700 ms); the colours change as it spreads.
It is implemented **once**, in `REBUILT.Theme.setPref(next, { origin })` (`js/theme.js`) with the matching rules in `css/base.css`; screens
only pass the element that was tapped (`Components.bindPrefSwitch`, the Settings segmented control). `origin` may be an element or `{x, y}`;
its centre is measured at the moment of the tap, before the screen is redrawn.

| Situation | What happens |
|---|---|
| Browser has `document.startViewTransition` | the old screen is kept as a picture, the page is redrawn in the new theme, and `::view-transition-new(root)` is revealed through a `clip-path: circle()` animation (WAAPI, 700 ms, `cubic-bezier(.4,0,.2,1)`); the default cross-fade is switched off and element colour transitions are suspended (class `theme-reveal` on `<html>`) so the new colours are exactly the theme's from the first frame |
| No view transitions | class `theme-fade`: the colours of what is on screen cross-fade (~0.42 s), then the page is redrawn with the matching logos |
| `prefers-reduced-motion`, or the in-app "reduce motion" setting | the theme changes at once, nothing moves |
| The colours would not change (choosing **System** on a device that already shows that theme) | applied at once, no motion |
| **System** mode and the device switches light / dark by itself | applied at once, never an animation |
| A second change while one is running | the one in flight is finished (jumps to its end) and the new one starts: never two at once. The choice is saved *first*, so a refresh in the middle keeps it |
| A language change while a reveal is running | the reveal is finished first (`I18n.onChange` hook), then the screen is redrawn: the two never fight over the screen |

Good to know:
* **Taps are ignored for the ~700 ms of the circle.** While a view transition runs, Chromium sends pointer events to the page root, not to
  the buttons (`pointer-events: none` on the pseudo-elements does not change that). Keyboard and scrolling are unaffected. A tap after
  the circle ends works at once; repeated taps never queue up.
* The theme attribute (`data-theme`) lands on the *next frame* after the tap (the browser takes its picture of the old screen first);
  `Theme.getPref()` / `getResolved()` and the saved preference are updated immediately. Tests that read the attribute wait for it.
* Both inks of the logos are fetched once after load (`Brand`), and Settings keeps the last "sign-in methods" answer for the account:
  otherwise the redraw made the page a little shorter for a moment and the scroll position jumped.
* `Theme.isAnimating()` and `Theme.REVEAL_MS` are exposed for tests.

## Rules

1. **No Arabic (or English) text in code.** UI text is `REBUILT.t("ns.key")`. `tests/i18n.test.js` fails if an Arabic
   letter is left in `js/**` or `index.html` (outside `js/locales/`), unless the line carries `// i18n-ignore: why`.
2. **Never translate at load time.** `REBUILT.t()` is called when something is *drawn*, so a language change shows up on
   the next render. Module-level tables use getters / functions (see `Shell.NAV`, `Router.PAGES`, `Data.PRESET_SKILLS`).
3. **The person's own data is never translated** — habit / task / goal names, notes, their name stay as written. Only
   what the app itself says changes (a few app-made values such as the demo data and onboarding presets are made in the
   language that is on at that moment).
4. Plurals: a dictionary value may be a function: `(p, I) => I.plural(p.n, { one: "{n} day", other: "{n} days" })`.
   Other `{placeholders}` in the result are filled as usual.
5. Sorting and comparisons use the raw values, never the translated text.
6. Colours: no hex / rgb in a component's CSS. Use a token (`--surface`, `--ink`, `--primary-ink`, `--yellow-rgb`…).
   Yellow / orange **fills** keep the brand colours in both themes; where they are used as **text or outlines** use
   `--primary-ink` / `--orange-ink` / `--accent-text`, which step down to a readable shade on light.

## Adding a language

1. In `js/i18n.js` add an entry to `LANGS` (`code, name, dir, locale, numberLocale, time`).
2. Add `js/locales/<code>/<ns>.js` for every namespace in `js/locales/ar/` and list them in `index.html`
   (`tests/i18n.test.js` checks that the files on disk, the `<script>` lines and the keys all agree, and that every
   key has the same `{placeholders}` in every language).
3. Missing keys fall back to Arabic, then to the key itself, and are listed in `REBUILT.I18n.missing()`.

## Tests

* `node tests/i18n.test.js` — dictionaries complete and consistent, no text left in code, core formats / plurals.
* `node tests/browser/run_i18n.js` — real Chromium: every page × {ar, en} × {dark, light} (attributes, overflow,
  leftover text), instant switching, persistence after reload and sign-out / sign-in, System follows the device live,
  no flash, data untouched, formats, light-mode contrast scan.
* `node tests/browser/run_lang_boot.js` — the **start-up** bug, with the browser's *real* HTTP cache (the other suites serve through
  `page.route()`, which switches the cache off). It serves the site over HTTPS from a stand-in for GitHub Pages
  (`tests/browser/_pages-server.js`: `max-age=600`, ETag / 304) and proves: English survives 10 refreshes, a link into each page,
  the browser being closed and reopened, an empty cache, a slow network, going back to Arabic, sign-out / sign-in, phone and
  desktop; a dictionary file that fails / arrives broken / stays down never leaves the screen half-translated; a new deployment over
  a cached old one cannot mix builds; the first screen is never drawn in the wrong language; a cold load and a cached load read the
  same. `RB_BUILD_REF=<commit>` runs the same suite against an older commit — on `6323b01` (the one that had the bug) 7 of its 24
  checks fail, on the fix all pass.
* `node tests/browser/run_theme_reveal.js` — the circular reveal in real Chromium (138 checks): the circle starts at the real centre of the tapped
  button and is a clean, growing circle (pixel-compared frozen frames: old screen / frame / new screen), 700 ms, from the welcome, sign-in,
  sign-up, recovery, every onboarding step and Settings, on desktop and on a phone with touch; System mode (no motion when nothing changes,
  the device flipping by itself followed at once); refresh in the middle of the circle; fast repeated taps (never two reveals, last choice wins,
  nothing stuck); the no-view-transition fallback; reduced motion; language × theme together; data and the test-double account untouched; every
  page ends complete after a change.
* `node tests/stamp-build.test.js` — the build stamp.
* All of them are part of `tests/browser/run-all.sh` and of CI (`pages.yml` runs the unit ones).
