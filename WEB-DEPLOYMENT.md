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

- Supabase (project `erwlfiechvflbvebmqhl`) for auth and data; the public (anon) key in `js/supabaseClient.js` is
  meant to be public — access is enforced by row-level security.
- Password recovery email links return to this page. In Supabase → Authentication → URL Configuration set
  **Site URL** to `https://omarelzanaty1.github.io/REBUILT/` and add the same URL to **Redirect URLs**,
  otherwise recovery links are rejected or sent somewhere else.
- REBUILT AI is "Coming Soon": the page makes no model calls and the app needs no AI key.

## Fonts

Cairo (Arabic text) and Archivo Narrow (the narrow wordmark/numerals style) load from Google Fonts via `<link>` in
`index.html`; if they can't load, the interface falls back to system fonts and stays usable.
