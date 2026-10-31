# REBUILT — Web deployment

Static site (no build step, no environment variables). The repository root is the site root: `index.html`, `css/`,
`js/`, `assets/`. All URLs inside the app are relative, so it works at a domain root (Vercel) and under a
sub-path (GitHub Pages `/rebuilt0.4/`).

## Where it is served

**This is the Development repository** (`omarelzanaty1/REBUILT-Developer`, private). Two environments exist and they are
kept apart — read [`docs/ENVIRONMENTS.md`](docs/ENVIRONMENTS.md) first.

| Environment | Repository | Address | Deployed by |
|---|---|---|---|
| **Development** (this repository) | `omarelzanaty1/REBUILT-Developer` (private) | `https://omarelzanaty1.github.io/REBUILT-Developer/` | `.github/workflows/pages.yml` on every push to `main`, after the tests pass; publishes only the files in `scripts/site-files.txt` |
| **Stable** (official, for users) | `omarelzanaty1/rebuilt0.4` (public) | `https://getrebuilt.online/` (also `https://omarelzanaty1.github.io/rebuilt0.4/`) | GitHub Pages from that repository's `main` + its `CNAME`. Changed **only** by `scripts/release.sh promote`, after explicit approval |
| Vercel (`rebuilt-jet.vercel.app`) | — | being retired; no longer the Development source | still builds `rebuilt0.4` `main` until disconnected (see docs/ENVIRONMENTS.md §10) |

There is deliberately **no `CNAME` file in this repository**: the official domain belongs to the Stable repository only.
Pushing here can never change `getrebuilt.online`.

Nothing in this repository needs a build step or environment variables: the Supabase URL and the *publishable* key are
literals in `js/supabaseClient.js`, one profile per environment.

## What's in here

- `index.html` — entry point; loads `css/` (tokens → base → components → layout → screens → gate → ai-chat) and `js/` in a fixed order.
- `manifest.webmanifest` + `assets/icons/` — installable-app metadata and icons.
- `assets/brand/` — logo mark, stair, wordmark, lockup (SVG).
- `sw.js` — a retired service worker (kill switch). The app does not register any service worker; this file only
  clears the caches of an older cache-first worker so browsers that installed it pick up new deployments.
  Leave it in place; it can be deleted once you're sure no old browser still has the old worker.
- `tests/auth.test.js`, `tests/dev-repo.test.js`, `tests/release.test.js` — dependency-free checks (see "Tests").
- `tests/browser/` — the browser suites (Playwright) and the Full Regression Sweep runner (`run-all.sh`).
- `supabase/` — the database: numbered SQL files, the applied migrations, and the read-only schema signature. **Never published.**
- `scripts/` — `release.sh` (promote to Stable / roll back) and `site-files.txt` (the only files that are published).
- `docs/ENVIRONMENTS.md` — Development vs Stable, release and rollback, Supabase per environment.

## Backend

- **Which Supabase project a page uses is decided in `js/supabaseClient.js` from the address it was loaded from.**
  Only `getrebuilt.online` (and the official `github.io/rebuilt0.4/` address) use the production project
  `jvyhtpfedkypwdzyadba` (organization `rebuilt`). Every other address — this repository's Development site,
  `localhost`, anything unknown — uses the `development` profile, which is **empty until a development project exists**;
  the app then runs in its browser-only local mode and sends no request to Supabase. See docs/ENVIRONMENTS.md §9 for the
  plan to create `REBUILT-Dev`.
- The file holds the project URL and the **publishable** key only — meant to be public; access is enforced by row-level
  security. Never put a Secret key, a `service_role` key or the database password in any file of this repository.
- The database is described by `supabase/` (SQL files in the order given in `supabase/README.md`, plus the migrations as
  applied to production). It is not part of the published site.
- Passwords: the app requires **at least 8 characters** (sign-up, reset, settings). Also set
  Supabase → Authentication → minimum password length = 8 so the server enforces the same rule.
- Free-plan projects are paused after about a week of inactivity; sign-in and sync fail until it is resumed.
- REBUILT AI is "Coming Soon": the page makes no model calls and the app needs no AI key.
- Settings below that mention `rebuilt-jet.vercel.app` or `github.io/rebuilt0.4/` describe the **production** project
  (Site URL / Redirect URLs); the development project gets its own (docs/ENVIRONMENTS.md §9).

## Password recovery by e-mailed code — required Supabase settings

Recovery no longer uses a link. The whole flow happens inside the site:

1. **Forgot password** → the user types the e-mail → `supabase.auth.resetPasswordForEmail(email)` (no redirect target is sent).
2. Supabase e-mails a short numeric code (its "Reset Password" template shows `{{ .Token }}`).
3. **Code screen** (same page) → `supabase.auth.verifyOtp({ email, token, type: "recovery" })`. Supabase checks the code
   (right / expired / already used / replaced by a newer one). Only a success gives a session and opens step 4.
4. **New password** → `supabase.auth.updateUser({ password })` → success → the user signs in with the new password.

The app never creates, stores or compares a code — Supabase Auth does (it keeps only a hash). An unknown e-mail
gets exactly the same screens and answers as a registered one, so the form can't be used to find out who has an account.

### 1. Edit the e-mail template (required — the app cannot do this, and cannot detect it)

Supabase → **Authentication → Emails → Templates → "Reset Password"** (called "Reset password" / "Recovery").
The template that ships by default contains `{{ .ConfirmationURL }}` (a link): **replace it so the body shows
`{{ .Token }}` and contains no `{{ .ConfirmationURL }}`**. Until this is done the e-mail still carries the old link
while the app asks for a code. Suggested subject and body:

Subject:

```
كود استعادة الباسورد — REBUILT
```

Body (HTML):

```html
<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#201F19;text-align:right">
  <h2 style="margin:0 0 12px">استعادة الباسورد</h2>
  <p style="margin:0 0 16px;line-height:1.7">اكتب الكود ده في صفحة REBUILT عشان تختار باسورد جديد:</p>
  <p dir="ltr" style="margin:0 0 16px;text-align:center;font-size:34px;font-weight:700;letter-spacing:8px;background:#FFE600;border-radius:12px;padding:14px 0">{{ .Token }}</p>
  <p style="margin:0 0 8px;line-height:1.7">الكود بيشتغل مرة واحدة ولمدة قصيرة، وأي كود جديد بتطلبه بيلغي القديم.</p>
  <p style="margin:0;color:#666;line-height:1.7">لو انت ماطلبتش استعادة الباسورد، تجاهل الرسالة — حسابك زي ما هو ومحدش يقدر يغيّره من غير الكود.</p>
</div>
```

### 2. Code length and lifetime

Supabase → **Authentication → Providers → Email** (label may read "Sign In / Providers" in newer dashboards):

| Setting | Value |
|---|---|
| **Email OTP Expiration** | `600` seconds (10 minutes) recommended — Supabase advises at most 3600 (max 86400) |
| **Email OTP Length** | `6` (the app accepts 6 to 10 digits, so a different length still works) |

### 3. Sending limits (Supabase's, authoritative)

Supabase's built-in mail sender has a very small shared hourly quota and a per-address wait of about 60 s; beyond
that it answers `429`. The app says which limit it hit (project e-mail quota vs. "wait N seconds" vs. general
request rate) and pauses the button. For real users configure a custom SMTP provider in Authentication →
**SMTP Settings** (then the hourly limit becomes adjustable under Authentication → Rate Limits).

On top of those, the app keeps its own per-tab limits (`js/auth.js → RECOVERY_LIMITS`): **60 s** between two code
requests, **5 code requests per hour**, **5 wrong codes per request** (then a new code must be requested). They
survive a refresh (sessionStorage) and are defence in depth only — they don't replace Supabase's checks.

### The sign-up confirmation e-mail — required settings (the app cannot do these, and cannot detect them)

**What went wrong (2026-10-26, visible in Supabase → Logs):** the confirmation link in the e-mail read
`…/auth/v1/verify?token=…&type=signup&redirect_to=http%3A%2F%2Flocalhost%3A3000`. The app *does* ask for its own
address when signing up (`/auth/v1/signup?redirect_to=https://getrebuilt.online/`), but Supabase only honours a
`redirect_to` that is on the **Redirect URLs** list; otherwise it silently writes the project's **Site URL** into the
e-mail — and on a new project that is `http://localhost:3000` → `ERR_CONNECTION_REFUSED`. Nothing in the app's code
can change that; it is two dashboard settings (below). To make the link independent of them anyway, the app now also
understands a link that points straight at the site (step 2).

#### 1. URL Configuration (required — Authentication → URL Configuration)

| Setting | Value |
|---|---|
| **Site URL** | `https://getrebuilt.online` |
| **Redirect URLs** (add each, keep the ones already there) | `https://getrebuilt.online/`, `https://rebuilt-jet.vercel.app/`, `https://omarelzanaty1.github.io/rebuilt0.4/` |

Never leave `http://localhost:3000` as the Site URL. A new host or custom domain = one more Redirect URL (the app
always asks to be sent back to the address it is opened from, `js/auth.js → redirectUrlFor`).

#### 2. "Confirm signup" template (recommended — Authentication → Emails → Confirm signup)

Replace `{{ .ConfirmationURL }}` in the link with the site's own address and the token hash:

```html
<h2>Confirm your email address</h2>
<p>Follow the link below to confirm this email address and finish signing up.</p>
<p><a href="https://getrebuilt.online/?token_hash={{ .TokenHash }}&type=email">Confirm email address</a></p>
```

Why this form: the link opens the app directly (no hop through `supabase.co`, no redirect list involved), and the
token is only checked when the page runs `verifyOtp` — a mail scanner that merely fetches the URL cannot use it up
(the old `/verify?token=` links are one-time and are sometimes consumed by such scanners). Use the literal domain, not
`{{ .SiteURL }}`, if you want it to keep working even when the Site URL is wrong. (Supabase's own docs use
`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` for server-rendered apps; this site is static, so the
page is the root.) Also keep **Confirm email** ON and the Email provider enabled.

#### What the app does with the link (js/auth.js → `consumeEmailLink`, js/gate.js)

- `?token_hash=…&type=email` (or `signup`): `verifyOtp` is called once. «تم تأكيد بريدك الإلكتروني بنجاح، تقدر تسجّل الدخول
  دلوقتي.» appears **only** if Supabase's answer carries a confirmation time. The one-time session that comes with the
  link is dropped on that device (local sign-out only), the e-mail is filled into the sign-in form, and the person signs in
  with the password. Other types (e.g. `recovery`) are ignored by this path.
- The older `…#access_token=…&type=signup` link (what the default template produces once the URL settings are right) is
  handled the same way, after asking the server (`getUser`) whether the address is confirmed.
- A used / expired / unknown link, or an answer that does not confirm anything → «اللينك مش شغال» with the e-mail field
  and «ابعت رسالة التأكيد تاني». No connection or a rate limit → «التأكيد ما كملش» + «جرّب تاني» (the link stays in the address
  so it can be checked again). Someone already signed in is not interrupted by an old link.
- «ابعت رسالة التأكيد تاني» (`supabase.auth.resend({ type: "signup" })`) exists on the "check your inbox" screen, on the
  expired-link screen, and under the "confirm your e-mail first" message when a sign-in is refused. One request at a time,
  60 s between two e-mails to one address, 5 per hour per tab, Supabase's own wait shown when it answers 429. The message never
  promises that an e-mail was sent (Supabase answers the same for every address): "if this address is registered and not yet
  confirmed, a new message will arrive". A newer message replaces the older one's link.
- Accounts that signed up while the settings were wrong are simply unconfirmed: they can use «ابعت رسالة التأكيد تاني» from
  the sign-in screen once step 1 (and ideally 2) is done. Nothing is confirmed or deleted on their behalf.

### If something goes wrong

| Symptom | Cause / check |
|---|---|
| The e-mail has a link instead of a code | The "Reset Password" template still contains `{{ .ConfirmationURL }}` — step 1. |
| A correct code is refused as "wrong or expired" | It expired (Email OTP Expiration), was replaced by a newer request, or was already used. Request a new code and use only the latest e-mail. |
| "Wait N seconds" / "too many e-mails" | Supabase's per-address wait or the project's hourly e-mail quota — see sending limits; custom SMTP lifts the quota. |
| Supabase → Logs → Auth | `POST /auth/v1/recover` = a code was requested (there is **no** `redirect_to`); `POST /auth/v1/verify` with `type=recovery` = a code was typed (`403 otp_expired` = wrong/expired); `PUT /auth/v1/user` = the password was changed. |

## Google sign-in and linking — required setup (nothing here can be done from the code)

What the app does (js/auth.js, js/gate.js, js/pages/settings.js):

| Where | Action | Supabase call |
|---|---|---|
| Sign-in / sign-up screens, signed out | «المتابعة باستخدام Google» | `signInWithOAuth({ provider: "google" })` → a new account, or the one this Google identity already belongs to |
| Settings → «طرق تسجيل الدخول», signed in | «ربط حساب Google» | `linkIdentity({ provider: "google" })` → adds Google to the account you are in; **never** creates a user |
| Settings → «طرق تسجيل الدخول» | list of methods | `getUserIdentities()` |

Both calls return to the app's own published address (`https://rebuilt-jet.vercel.app/` — the same entry as the
sign-up e-mail link, so nothing new goes in Redirect URLs). The Google **client secret never appears in this
repository or in the browser**; it lives only in the Supabase dashboard. A short-lived marker in `sessionStorage`
(`rebuilt.oauth`: which flow, and for linking whose account — no token, no e-mail) lets the app tell a return
from Google apart from an e-mail link, and report a cancelled or refused attempt without touching the session.

### 1. Google Cloud (console.cloud.google.com → Google Auth Platform)

1. Choose or create a project.
2. **Branding**: app name `REBUILT`, support e-mail, logo optional.
3. **Audience**: *External*, and **publish the app (status "In production")**. While it says *Testing*, only e-mail
   addresses listed as test users can sign in — everyone else gets "access blocked". The basic scopes below need no Google review.
4. **Data Access (Scopes)**: `openid` (add manually), `.../auth/userinfo.email`, `.../auth/userinfo.profile`. Nothing else.
5. **Clients → Create client → Web application**:

| Field | Value |
|---|---|
| Authorized JavaScript origins | `https://rebuilt-jet.vercel.app`, `https://omarelzanaty1.github.io` and `https://getrebuilt.online` (one per address the app is opened from) |
| Authorized redirect URIs | `https://jvyhtpfedkypwdzyadba.supabase.co/auth/v1/callback` (compare with the value the Google provider page in the Supabase dashboard shows) |

6. Create → copy the **Client ID** and **Client secret** (keep the secret out of chats, GitHub and the site).

### 2. Supabase dashboard (project `jvyhtpfedkypwdzyadba`)

| Where | Setting | Value |
|---|---|---|
| Authentication → Sign In / Providers → **Google** | Enable Sign in with Google | ON |
| same | Client IDs / Client Secret | the two values from step 1 |
| same | Skip nonce checks / Allow users without an email | OFF / OFF |
| Authentication → Sign In / Providers (project-level auth options) | **Manual linking** ("Allow manual linking", beta) | **ON** — without it «ربط حساب Google» answers "not enabled" |
| Authentication → URL Configuration | Site URL / Redirect URLs | Site URL `https://getrebuilt.online`; Redirect URLs `https://getrebuilt.online/`, `https://rebuilt-jet.vercel.app/`, `https://omarelzanaty1.github.io/rebuilt0.4/` (same list as the confirmation e-mail above) |

### 3. What to expect (documented Supabase behaviour)

- **One person, one account, no merging.** Linking attaches a Google identity to the signed-in account. If that
  Google identity already belongs to a different REBUILT account, Supabase refuses (`identity_already_exists`) and the
  app says so; it never moves data or merges accounts.
- **Automatic linking by verified e-mail is done by Supabase, not by this app.** When someone signs in with Google and
  an account with the *same e-mail* already exists, Supabase attaches the Google identity to that account instead of
  creating a second one — it does so only for a verified e-mail, and it drops other *unconfirmed* identities on that
  account first, to prevent pre-account takeover. The Supabase documentation lists no switch to turn this off. It means
  "same verified e-mail → same account" (no duplicate, no data copied or moved). To attach a Google account with a
  *different* e-mail, the person must use the Settings flow while signed in; otherwise Google would create a separate account.
- **Google-only accounts** have no REBUILT password. «نسيت الباسورد؟» (the e-mailed code) lets them create one.
- **Profile rows** are created by the sign-up trigger when an auth user is created — once per person. Signing in
  (password, Google, or an automatic link) never creates another, and the app itself never inserts into the profile tables.
- **Two accounts that already belong to one person** are not merged automatically. The safe route is a reviewed,
  manual data move done only after the person has proven they own both (signing in to each), decided which one stays,
  and exported the other one's data (Settings → تصدير البيانات). Ask for a reviewed SQL script for that case.
- Un-linking Google is not offered in the app.

### 4. If something goes wrong

| Symptom | Cause / check |
|---|---|
| «الدخول بـ Google لسه مش متفعّل على السيرفر» | The Google provider is off, or Client ID / Secret are missing in Supabase (step 2). |
| A bare JSON page on `…supabase.co/auth/v1/authorize` saying `Unsupported provider: provider is not enabled` | Same cause (the Google provider is off). `signInWithOAuth` sends the browser straight to that address, so the app cannot catch it afterwards; since 0.4.4 it first reads `GET /auth/v1/settings` (`external.google`) and shows the Egyptian message inside the app instead. If that read fails for any reason the redirect still happens (fail-open). Supabase logs show it as `/authorize` → 400 `validation_failed`. |
| Google's consent screen works but the browser lands on `localhost:3000` | Site URL is still the default and/or the address is not in Redirect URLs (see the URL Configuration row above). |
| Google shows `redirect_uri_mismatch` | The redirect URI in the Google client is not exactly the Supabase callback URL (step 1.5). |
| Google shows "access blocked / app not verified" | Audience is still *Testing* and the e-mail is not a test user — publish it (step 1.3). |
| Returns to `localhost:3000` | The address the app was opened from is missing from Redirect URLs, so Supabase fell back to the Site URL (check the list above, including `https://getrebuilt.online/`). |
| «ربط Google لسه مش متفعّل في إعدادات السيرفر» | Manual linking is off (step 2). |
| «حساب Google ده مرتبط بحساب REBUILT تاني» | That Google account is already attached to another REBUILT account; sign in to that one with Google, or pick another Google account. |
| Supabase → Logs → Auth | `GET /authorize?provider=google` (the start), `GET /callback` (Google came back), `login` events with provider `google`; linking shows as an identity added to the existing user id. |

## Which version is live?

`index.html` carries `<meta name="rebuilt-build" content="…">` (also exposed as `<meta name="generator">`). View the
page source of the host in question (or fetch its root page): the value shows which release that host is serving,
independent of what GitHub shows. Code-based recovery arrived in build `0.4.2 otp-reset`; Google sign-in and linking in `0.4.3 google-auth`; the "is Google switched on?" preflight in `0.4.4 google-preflight`; token_hash confirmation links, the success/expired screens and «resend confirmation» in `0.4.5 confirm-email`. The environment split — channel-based backend, Development repository — arrived in `0.4.6 dev-split`. `REBUILT.diagnose()` in the console prints the build, the channel (`stable` / `development` / `local` / `unknown`), the host and which backend is in use.

## Tests

```
node tests/auth.test.js          # unit checks (no dependencies, no network)
node tests/dev-repo.test.js      # repository guards: no CNAME, only site files published, no secrets, SQL pack complete
node tests/release.test.js       # promote / rollback, on throw-away local repositories
bash tests/browser/run-all.sh    # Full Regression Sweep (Playwright; browser suites run against an in-browser test double)
```

The first three need no dependencies and no network (the browser suites need Playwright). Together they fail if any shipped file points at a local address (`localhost:3000` included) or
carries a secret key; if the sign-up redirect target is not the canonical published address
(`https://omarelzanaty1.github.io/rebuilt0.4/`); if a page is served from a non-official address but would use the production project, or a development address ever creates a Supabase client; if password
recovery starts sending a redirect target again or stops using `resetPasswordForEmail → verifyOtp(type "recovery") →
updateUser`; if a malformed code reaches Supabase; if the cooldown / hourly / wrong-code limits stop holding; if a
Google secret or client id appears in the repository; if linking ever uses `signInWithOAuth` (or sign-in uses
`linkIdentity`); if a return from Google (success, cancel, "already linked") is read wrongly; or if different Supabase
errors collapse into one message again; if a confirmation link is shown as success without Supabase confirming it, if a `recovery` token_hash is accepted as a confirmation, if a failed check (no connection, rate limit) burns the link, if the link's one-time session is left signed in, or if the resend button stops waiting between two e-mails. It cannot check the Supabase or Google Cloud settings above and does not talk
to either of them.

## Fonts

Cairo (Arabic text) and Archivo Narrow (the narrow wordmark/numerals style) load from Google Fonts via `<link>` in
`index.html`; if they can't load, the interface falls back to system fonts and stays usable.
