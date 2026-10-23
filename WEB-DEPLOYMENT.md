# REBUILT — Web deployment

Static site (no build step, no environment variables). The repository root is the site root: `index.html`, `css/`,
`js/`, `assets/`. All URLs inside the app are relative, so it works at a domain root (Vercel) and under a
sub-path (GitHub Pages `/rebuilt0.4/`).

## Where it is served

| Host | Address | Deployed from |
|---|---|---|
| **Vercel** (the one in use) | `https://rebuilt-jet.vercel.app/` | project `rebuilt` (team `rebuilt1`) ← this repository, branch `main` |
| GitHub Pages | `https://omarelzanaty1.github.io/rebuilt0.4/` | this repository, branch `main` (Actions workflow) |

Each host publishes `main` on its own. A change reaches a host only after that host has built it — check the
commit's checks on GitHub (the **Vercel** status and the Pages workflow), and see "Which version is live?" below.

**Vercel project settings** (Project → Settings): Framework Preset **Other**, Build Command **empty**, Output
Directory **empty** (the root), Install Command **empty**, Production Branch **main**. No Environment Variables are
needed or read: the Supabase URL and the *publishable* key are literals in `js/supabaseClient.js`.

## What's in here

- `index.html` — entry point; loads `css/` (tokens → base → components → layout → screens → gate → ai-chat) and `js/` in a fixed order.
- `manifest.webmanifest` + `assets/icons/` — installable-app metadata and icons.
- `assets/brand/` — logo mark, stair, wordmark, lockup (SVG).
- `sw.js` — a retired service worker (kill switch). The app does not register any service worker; this file only
  clears the caches of an older cache-first worker so browsers that installed it pick up new deployments.
  Leave it in place; it can be deleted once you're sure no old browser still has the old worker.
- `tests/auth.test.js` — dependency-free checks (see "Tests").

## Backend

- Supabase project `jvyhtpfedkypwdzyadba` (organization `rebuilt`) for auth and data. It is independent of every other
  project. `js/supabaseClient.js` holds the project URL and the **publishable** key only — that key is meant to be
  public; access is enforced by row-level security. Never put a Secret key, a `service_role` key or the database
  password in any file of this repository.
- The database is created from the numbered SQL files shipped separately (`REBUILT-supabase-sql.zip`, run in the
  order its README gives). They are deliberately **not** part of this folder so the schema is not served publicly.
- Passwords: the app requires **at least 8 characters** (sign-up, reset, settings). Also set
  Supabase → Authentication → minimum password length = 8 so the server enforces the same rule.
- Free-plan projects are paused after about a week of inactivity; sign-in and sync fail until it is resumed.
- REBUILT AI is "Coming Soon": the page makes no model calls and the app needs no AI key.

## E-mail links (sign-up confirmation + password reset) — required Supabase settings

The app asks Supabase to send every e-mail link back to **the address it is served from**
(`js/auth.js → redirectUrlFor`: origin + path, no query/hash — `https://rebuilt-jet.vercel.app/` on Vercel). Supabase
only honours that address if it is on its allow-list; **otherwise it silently replaces it with the project's Site
URL, which on a new project is `http://localhost:3000`** — that is exactly how a reset link ends up on
`localhost:3000` → `ERR_CONNECTION_REFUSED`. No code change can fix that; it is a dashboard setting.

Supabase → Authentication → **URL Configuration**:

| Setting | Value |
|---|---|
| **Site URL** | `https://rebuilt-jet.vercel.app/` |
| **Redirect URLs** (add each) | `https://rebuilt-jet.vercel.app/` and, while GitHub Pages is also used, `https://omarelzanaty1.github.io/rebuilt0.4/` |

Do not keep `http://localhost:3000` as the Site URL. A new host or a custom domain = one more entry in Redirect URLs.
The password-reset screen is not a separate page: the link returns to `/` carrying `#access_token=…&type=recovery`,
and the app shows the "new password" screen. The one address above is therefore the only path to allow.
Recovery and confirmation links are **one-time**: after fixing the settings, request a **new** link — old ones are
spent (a second click shows the "link not working" screen).

Also in Supabase → Authentication: **Confirm email** ON; Email provider enabled.

**Sending limits.** Supabase's built-in mail sender has a very small shared hourly quota and a per-address wait
(about 60 s). Beyond that Supabase answers `429` — the app now says which one it is (project e-mail quota vs. "wait N
seconds" vs. general request rate) and pauses the button instead of inviting more clicks. For real users configure
a custom SMTP provider in Authentication → **SMTP Settings** (then the hourly limit becomes adjustable under
Authentication → Rate Limits).

### If a link opens `localhost:3000` again

1. Supabase → Logs → Edge: the `/auth/v1/recover` request shows `redirect_to=<the address the app sent>`; the e-mail's
   `/auth/v1/verify?…&redirect_to=…` shows what Supabase actually put in the link. If they differ, that address is
   missing from Redirect URLs (or the Site URL is wrong).
2. Fix URL Configuration as above, then request a new link.

## Which version is live?

`index.html` carries `<meta name="rebuilt-build" content="…">`. View the page source of the host in question (or
fetch its root page): the value shows which release that host is serving, independent of what GitHub shows.

## Tests

```
node tests/auth.test.js
```

No dependencies, no network. It fails if any shipped file points at a local address (`localhost:3000` included) or
carries a secret key, if the e-mail redirect target is not the canonical published address
(`https://omarelzanaty1.github.io/rebuilt0.4/`, `https://rebuilt-jet.vercel.app/` for the hosts above), if sign-up or
reset stop sending it, or if different Supabase errors collapse into one message again. It cannot check the Supabase
dashboard — that is the table above.

## Fonts

Cairo (Arabic text) and Archivo Narrow (the narrow wordmark/numerals style) load from Google Fonts via `<link>` in
`index.html`; if they can't load, the interface falls back to system fonts and stays usable.
