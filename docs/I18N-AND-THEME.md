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
* Both are part of `tests/browser/run-all.sh` and of CI (`pages.yml` runs the unit one).
