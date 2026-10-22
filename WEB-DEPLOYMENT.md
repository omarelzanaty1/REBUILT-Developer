# REBUILT — Web deployment

Static site (no build step): upload the contents of this folder to the root of the GitHub Pages branch
(`omarelzanaty1/REBUILT`). All URLs are relative, so it works under `/REBUILT/`.

## What's in here

- `index.html` — entry point; loads `css/` (tokens → base → components → layout → screens → gate → ai-chat) and `js/` in a fixed order.
- `manifest.webmanifest` + `assets/icons/` — installable-app metadata and icons.
- `assets/brand/` — logo mark, stair, wordmark, lockup (SVG).
- `sw.js` — a retired service worker (kill switch). The app does not register any service worker; this file only
  clears the caches of an older cache-first worker so browsers that installed it pick up new deployments.
  Leave it in place; it can be deleted once you're sure no old browser still has the old worker.

## Backend

- Supabase project `jvyhtpfedkypwdzyadba` (organization `rebuilt`) for auth and data. It is independent of every other
  project. `js/supabaseClient.js` holds the project URL and the **publishable** key only — that key is meant to be
  public; access is enforced by row-level security. Never put a Secret key, a `service_role` key or the database
  password in any file of this repository.
- The database is created from the numbered SQL files shipped separately (`REBUILT-supabase-sql.zip`, run in the
  order its README gives). They are deliberately **not** part of this folder so the schema is not served publicly.
- Passwords: the app requires **at least 8 characters** (sign-up, reset, settings). Also set
  Supabase → Authentication → minimum password length = 8 so the server enforces the same rule.
- Password recovery and sign-up confirmation email links return to this page. In Supabase → Authentication →
  URL Configuration set **Site URL** to `https://omarelzanaty1.github.io/REBUILT/` and add the same URL to
  **Redirect URLs**, otherwise those links are rejected or sent somewhere else.
- Supabase's built-in email service only delivers to members of the organization and is heavily rate-limited.
  For real users, configure a custom SMTP provider in Authentication → SMTP Settings.
- Free-plan projects are paused after about a week of inactivity; sign-in and sync fail until it is resumed.
- REBUILT AI is "Coming Soon": the page makes no model calls and the app needs no AI key.

## Fonts

Cairo (Arabic text) and Archivo Narrow (the narrow wordmark/numerals style) load from Google Fonts via `<link>` in
`index.html`; if they can't load, the interface falls back to system fonts and stays usable.
