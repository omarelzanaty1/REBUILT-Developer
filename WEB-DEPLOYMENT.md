# REBUILT — Web deployment

Static site (no build step, no environment variables). The repository root is the site root: `index.html`, `css/`,
`js/`, `assets/`. All URLs inside the app are relative, so it works at a domain root (Vercel) and under a
sub-path (GitHub Pages `/rebuilt0.4/`).

## Where it is served

| Host | Address | Deployed from |
|---|---|---|
| **Vercel** (the one in use) | `https://rebuilt-jet.vercel.app/` | project `rebuilt` (team `rebuilt1`) ← this repository, branch `main` |
| GitHub Pages | `https://omarelzanaty1.github.io/rebuilt0.4/` | this repository, branch `main` (Actions workflow) |
| GitHub Pages, custom domain | `https://getrebuilt.online/` | the `CNAME` file on `main` (added by the owner on 2026-10-25). Needs its DNS records and the domain set under Settings → Pages; once active, GitHub redirects the `github.io` address to it |

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

### What stays link-based: the sign-up confirmation e-mail

Confirming a new account still uses a link, so Supabase → Authentication → **URL Configuration** still matters
(otherwise Supabase replaces the app's address with its Site URL, which on a new project is
`http://localhost:3000` — that is how a link used to end on `ERR_CONNECTION_REFUSED`). Password recovery no longer
depends on it.

| Setting | Value |
|---|---|
| **Site URL** | `https://rebuilt-jet.vercel.app/` |
| **Redirect URLs** (add each) | `https://rebuilt-jet.vercel.app/`, and for every other address the app is opened from: `https://omarelzanaty1.github.io/rebuilt0.4/` and `https://getrebuilt.online/` |

Do not keep `http://localhost:3000` as the Site URL. A new host or a custom domain = one more entry in Redirect URLs
(the app always asks to be sent back to the address it is opened from, `js/auth.js → redirectUrlFor`; an address that
is not on the list is silently replaced by the Site URL — here the Vercel site — so someone using `getrebuilt.online` would
come back on a different address and lose the session they started with).
The sign-up link is **one-time**: after fixing the settings, sign up / resend again — an old link shows the
"link not working" screen.

Also in Supabase → Authentication: **Confirm email** ON; Email provider enabled.

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
| Authentication → URL Configuration | Site URL / Redirect URLs | Site URL `https://rebuilt-jet.vercel.app/`; Redirect URLs `https://rebuilt-jet.vercel.app/`, `https://omarelzanaty1.github.io/rebuilt0.4/`, **`https://getrebuilt.online/`** (new custom domain) |

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
independent of what GitHub shows. Code-based recovery arrived in build `0.4.2 otp-reset`; Google sign-in and linking in `0.4.3 google-auth`; the "is Google switched on?" preflight in `0.4.4 google-preflight`.

## Tests

```
node tests/auth.test.js
```

No dependencies, no network. It fails if any shipped file points at a local address (`localhost:3000` included) or
carries a secret key; if the sign-up redirect target is not the canonical published address
(`https://omarelzanaty1.github.io/rebuilt0.4/`, `https://rebuilt-jet.vercel.app/` for the hosts above); if password
recovery starts sending a redirect target again or stops using `resetPasswordForEmail → verifyOtp(type "recovery") →
updateUser`; if a malformed code reaches Supabase; if the cooldown / hourly / wrong-code limits stop holding; if a
Google secret or client id appears in the repository; if linking ever uses `signInWithOAuth` (or sign-in uses
`linkIdentity`); if a return from Google (success, cancel, "already linked") is read wrongly; or if different Supabase
errors collapse into one message again. It cannot check the Supabase or Google Cloud settings above and does not talk
to either of them.

## Fonts

Cairo (Arabic text) and Archivo Narrow (the narrow wordmark/numerals style) load from Google Fonts via `<link>` in
`index.html`; if they can't load, the interface falls back to system fonts and stays usable.
