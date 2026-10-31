# REBUILT — بيئتان منفصلتان: Development و Stable

> المرجع الكامل للفصل بين نسخة التطوير والنسخة الرسمية. (تفاصيل الإعدادات اليدوية داخل Supabase/Google ما زالت في `WEB-DEPLOYMENT.md`.)

## 1. الخريطة

| | **Stable — النسخة الرسمية** | **Development — التطوير** |
|---|---|---|
| المستودع | [`omarelzanaty1/rebuilt0.4`](https://github.com/omarelzanaty1/rebuilt0.4) (عام) | [`omarelzanaty1/REBUILT-Developer`](https://github.com/omarelzanaty1/REBUILT-Developer) (**خاص**) |
| الفرع الذي يُنشر | `main` | `main` |
| الرابط | https://getrebuilt.online/ (وهو نفسه `https://omarelzanaty1.github.io/rebuilt0.4/`) | https://omarelzanaty1.github.io/REBUILT-Developer/ |
| طريقة النشر | GitHub Pages «من الفرع `main`» + ملف `CNAME` (لم يتغيّر) | GitHub Pages «من GitHub Actions» (`.github/workflows/pages.yml`) بعد نجاح الاختبارات |
| من يغيّره | `scripts/release.sh` فقط، بعد موافقتك الصريحة على commit بعينه | أي push على `main` في مستودع التطوير |
| قاعدة البيانات | مشروع Supabase الحالي `jvyhtpfedkypwdzyadba` (المستخدمون الحقيقيون) | **لا مشروع حتى الآن** ← التطبيق يعمل محليًا في المتصفح بدون أي طلب إلى Supabase؛ مشروع تطوير منفصل مخطط له (القسم 8) |
| للمستخدمين؟ | نعم | **لا** — للمبرمجين والاختبار فقط |

**الفصل لا يعتمد على إعداد يمكن نسيانه:** `js/supabaseClient.js` يقرّر مشروع Supabase **من العنوان الذي حُمّلت منه الصفحة**. عنوان رسمي ⇐ مشروع الإنتاج؛ أي عنوان آخر (التطوير، `localhost`، أي عنوان غير معروف) ⇐ ملف التطوير. لذلك حتى لو نُسخ ملف التطوير بالغلط إلى مكان آخر، لا يلمس بيانات المستخدمين الحقيقيين.

القنوات (`REBUILT.diagnose().channel` و `<html data-channel>`): `stable` · `development` · `local` · `unknown`.

## 2. قواعد لا تُكسر

1. التطوير كله يبدأ في `REBUILT-Developer`. لا commit مباشر على `rebuilt0.4`.
2. `rebuilt0.4` يتغيّر **فقط** عبر `scripts/release.sh promote`، بعد موافقتك على الـ commit.
3. `CNAME` لا يوجد في مستودع التطوير أبدًا، و`release.sh` يرفض أي تغيير يمسّه في Stable.
4. لا Secret ولا `service_role` ولا كلمة سر قاعدة بيانات في أي ملف أو سجل اختبار. مفاتيح الواجهة **publishable** فقط. (خصوصية المستودع ليست حماية للأسرار.)
5. لا بيانات مستخدمين حقيقية في اختبارات التطوير: حسابات تجريبية (`@example.com`) أو عناوين فريقك فقط.
6. لا force-push، ولا حذف للمستودع الرسمي أو قاعدة الإنتاج.

## 3. تشغيل المشروع محليًا

موقع ساكن بلا build:

```
python3 -m http.server 4173      # ثم افتح http://localhost:4173/
```

على `localhost` يعمل التطبيق في الوضع المحلي (حسابات وبيانات داخل المتصفح فقط) — لا يتصل بأي Supabase.

## 4. نشر نسخة التطوير

كل `git push` على `main` في مستودع التطوير يشغّل `pages.yml`: يجري الاختبارات، ثم ينشر **ملفات الموقع فقط** (القائمة في `scripts/site-files.txt`: `index.html` و`css/` و`js/` و`assets/` و`manifest.webmanifest` و`sw.js`). مجلدات `supabase/` و`tests/` و`docs/` و`scripts/` و`.github/` **لا تُنشر**. الخطوة تتأكد أن `CNAME` غير موجود.

**إعداد يدوي لمرة واحدة** (لا يمكن عمله من ملف): في المستودع الخاص ← Settings ← Pages ← Build and deployment ← Source = **GitHub Actions**.

> **تنبيه مهم (تحقق منه قبل الاعتماد على هذا المسار):** وفق توثيق GitHub، Pages متاح للمستودعات **الخاصة** فقط في خطط GitHub Pro / Team / Enterprise؛ في الخطة المجانية Pages للمستودعات العامة فقط ([GitHub Docs](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)). وفي الخطط غير Enterprise Cloud يكون عنوان الموقع **مفتوحًا لمن يعرفه** حتى لو المستودع خاص (لم أستطع تأكيد هذه الجملة من الصفحة المتاحة لي — راجع Settings ← Pages بنفسك). موقع التطوير لا يحتوي أسرارًا (مفتاح publishable فقط، ولا مشروع تطوير بعد) وفيه `noindex`، لكن `noindex` ليس تحكمًا في الوصول. إن كان حسابك مجانيًا فالخيارات: ترقية الحساب إلى Pro، أو تشغيل التطوير محليًا (القسم 3)، أو (ممنوع حاليًا بقرارك) جعل المستودع عامًا.

## 5. الاختبارات

| ماذا | الأمر | ماذا يثبت |
|---|---|---|
| وحدات (بلا تبعيات) | `node tests/auth.test.js` | المصادقة، الأمان، عدم وجود أسرار/عناوين محلية، **فصل البيئات** (أي عنوان يستخدم أي مشروع) |
| هيكل المستودع | `node tests/dev-repo.test.js` | لا `CNAME`، المنشور = ملفات الموقع فقط، لا أسرار، ملفات SQL كاملة وغير مدمّرة |
| سكربت الإصدار | `node tests/release.test.js` | promote/rollback على مستودعات محلية مؤقتة (انظر 7 و 8) |
| Full Regression Sweep | `npm install && npx playwright install chromium && bash tests/browser/run-all.sh` (أو Actions ← «Full regression sweep») | 9 مجموعات متصفح: الوضع المحلي، الاستيراد/التصدير، الوضع المتصل، service worker، استعادة الباسورد (OTP)، Google، تأكيد البريد، **القنوات** |

**حدود هذه الاختبارات:** اختبارات المتصفح تعمل على **نسخة محاكاة** لـ Supabase وGoogle داخل المتصفح (`tests/browser/fake-supabase.js`). تثبت ما يرسله التطبيق وكيف يتصرف عند كل ردّ، **لا** ما يردّ به Supabase/Google الحقيقيان. تسجيل حساب حقيقي، وصول رسالة بريد حقيقية، OTP حقيقي، وGoogle OAuth حقيقي — كلها تُجرَّب يدويًا على بيئة لها مشروع Supabase (ولا تُجرَّب بحسابات حقيقية في التطوير).

اختبار قاعدة البيانات (قراءة فقط على الإنتاج): `supabase/verify/schema_signature.sql` يعطي «بصمة» للمخطط (أعمدة، قيود، فهارس، سياسات RLS، دوال، triggers، صلاحيات). تُشغَّل على أي مشروع وتُقارن الأرقام. القيم المعتمدة الآن (إنتاج = ملفات SQL):

```
columns 89 · constraints 32 · fn_grants 4 · functions 2 · indexes 18 · policies 13 · rls 10 · table_grants 231 · triggers 4 · view_options 1 · views 1
```

وفحوص الصحة: `supabase/sql/04_verify_readonly.sql` (كل الصفوف `OK`، المتوقع 69) و`05_isolation_test_rolled_back.sql` (ينتهي بخطأ مقصود يقول `0 check(s) failed`، ولا يحفظ شيئًا).

## 6. اعتماد إصدار جديد

1. التعديل يتم في `REBUILT-Developer` ويُدفع إلى `main`؛ ينجح `pages.yml` ويظهر على رابط التطوير.
2. ارفع رقم الـ Build Marker في `index.html` (`<meta name="rebuilt-build">` و`generator`) — السكربت يرفض إصدارًا بنفس الرقم.
3. Full Regression Sweep كاملًا + الاختبارات اليدوية الممكنة (تسجيل، تأكيد بريد، استعادة باسورد، Google) على بيئة لها مشروع Supabase.
4. `scripts/release.sh status` يعرض الفروق: ما في Development ولم يصل إلى Stable.
5. تُعرض عليك: قائمة الـ commits، الملفات التي ستنتقل، الـ Build Marker الحالي والمقترح. **لا يُنفَّذ شيء قبل موافقتك على الـ commit بعينه.**

## 7. نشر Stable بأمان

```
scripts/release.sh promote <commit-sha-على-main-التطوير>
```

يفعل بالترتيب: (أ) يشغّل الاختبارات على نسخة نظيفة من الـ commit؛ (ب) يضع ملفات الإصدار (`scripts/site-files.txt` + `tests/auth.test.js`) فوق نسخة جديدة من Stable ويُبقي كل ما عداها (خصوصًا `CNAME` و`WEB-DEPLOYMENT.md` الرسمي)؛ (ج) يتأكد أن `CNAME` = `getrebuilt.online`؛ (د) يعرض الفروق ويشغّل الاختبارات على الناتج؛ (هـ) يطلب كتابة `PUBLISH`؛ (و) ينشئ **commit واحدًا** على `main` في `rebuilt0.4` فيه `Release-From: <مستودع>@<sha>` و`Build-Marker`، ويدفعه دفعًا عاديًا (بلا force). مستودع التطوير لا يتغيّر.

بعدها: انتظر نحو دقيقة (Pages)، افتح https://getrebuilt.online/ وتأكد أن الـ marker يطابق (`view-source` أو `REBUILT.diagnose().build` في الـ console)، وأضف سطرًا في سجل الإصدارات أدناه.

يحتاج صلاحية كتابة على `rebuilt0.4` (بيانات اعتماد Git الخاصة بك أو جلسة مربوط بها المستودعان).

## 8. الرجوع إلى آخر إصدار مستقر

```
scripts/release.sh status                         # يعرض الحالة
git log --oneline (داخل نسخة rebuilt0.4)          # اختر الإصدار الجيد
scripts/release.sh rollback <commit-sha-الجيد>
```

ينشئ **commit واحدًا جديدًا** على `main` فيه ملفات ذلك الإصدار بالضبط (التاريخ يبقى، بلا force)، بعد اختبارها، ويرفض لو سيُسقط `CNAME`. نقطة الرجوع الحالية الموثقة:

> **`005e4299611674eee774e7497839e369c5d5fb72`** — `0.4.5 confirm-email` (آخر إصدار مستقر قبل الفصل).

> ملاحظة: لم أتمكن من دفع tag `release-0.4.5` (الـ proxy رفضه برسالة 403)؛ ينفع أن تنشئه أنت (`git tag -a release-0.4.5 005e429 && git push origin release-0.4.5`). SHA كافٍ للرجوع.

بعد أي رجوع: في نسخة التطوير نفّذ `git merge -s ours <stable-tip>` كي لا يتعارض الـ promote التالي.

## 9. Supabase لكل بيئة

### الوضع الحالي (مفحوص قراءةً فقط)

مشروع واحد `jvyhtpfedkypwdzyadba` (`REBUILT`، eu-west-1، Free). محتواه: 10 جداول في `public` كلها RLS مفعّل و13 سياسة (لا سياسة لـ `anon`)، view واحد (`user_xp_totals`)، دالتان للتطبيق (`handle_new_user` و`set_updated_at`) ودالة المنصة `rls_auto_enable`، 4 triggers (3 لـ `updated_at` + `on_auth_user_created` على `auth.users`)، ملحقات `pgcrypto` و`uuid-ossp` و`pg_stat_statements` و`supabase_vault`. **لا** Storage buckets (0 ملف)، **لا** Edge Functions، **لا** أسرار في Vault، **لا** cron ولا Realtime. المستخدمون: 7 (4 مؤكدون). ملاحظات المستشار (لم تُغيَّر): Leaked password protection مغلق، وفهرس مفقود لمفتاح `habit_completions_habit_id_user_id_fkey`، وفهرس `tasks_user_date_idx` غير مستخدم. كل مخطط الإنتاج موجود في Git الآن: `supabase/` (ملفات SQL + الـ migrations المطبّقة) — وأثبتُّ أنها تعيد إنشاءه **مطابقًا** (بصمة 11/11 فئة).

### الخطة لمشروع التطوير (لم تُنفَّذ — تحتاج موافقتك)

1. **(أنت)** في Supabase ← New project داخل المنظمة `rebuilt`: الاسم `REBUILT-Dev`، المنطقة eu-west-1، كلمة سر قاعدة البيانات تُحفظ في مدير كلمات المرور فقط (لا تُكتب في Git ولا في المحادثة). الخطة المجانية تسمح غالبًا بمشروعين نشطين؛ لوحة التحكم تؤكد.
2. **(Claude بعد موافقتك)** تطبيق `supabase/migrations/20261022214309_*` ثم `20261022214525_*`؛ تشغيل `04_verify` (المتوقع 69 `OK`) و`05_isolation_test` و`schema_signature.sql` ومقارنة البصمة بالإنتاج. **لا** `06` (AI، متوقف) ولا `07` (لا مستخدمين لنقلهم).
3. **(أنت)** إعدادات Auth للمشروع الجديد: Site URL و Redirect URLs = `https://omarelzanaty1.github.io/REBUILT-Developer/` ؛ Confirm email مفعّل؛ الحد الأدنى للباسورد 8؛ قالب Confirm signup: `…/REBUILT-Developer/?token_hash={{ .TokenHash }}&type=email` ؛ قالب Reset Password يعرض `{{ .Token }}`؛ Google (اختياري): إضافة `https://<ref-التطوير>.supabase.co/auth/v1/callback` إلى Authorized redirect URIs لنفس OAuth client (أو client منفصل) وتفعيل المزوّد بـ Client ID/Secret داخل لوحة Supabase فقط.
4. **(Claude)** وضع **URL ومفتاح publishable** للمشروع الجديد في `PROFILES.development` داخل `js/supabaseClient.js` (الاختبار يرفض أي مفتاح غير publishable أو عنوان الإنتاج)، ثم commit وفحص.
5. البريد: بريد Supabase الافتراضي يرسل لأعضاء الفريق فقط وبحد صغير — يكفي للتطوير؛ استخدم عناوين الفريق/الحسابات التجريبية.

**لا يُنقل:** مستخدمون، جلسات، tokens، كلمات مرور، صفوف بيانات. **المخاطر:** المشروع المجاني يتوقف بعد نحو أسبوع بلا نشاط (وهذا مقبول للتطوير)؛ إنشاء المشروع ليس تدميريًا ولا يمس الإنتاج؛ الخطأ الوحيد المحتمل هو لصق مفتاح الإنتاج في ملف التطوير — والاختبارات تمنعه.

## 10. إيقاف Vercel (لم يُنفَّذ — يحتاج صلاحياتك)

Vercel (`rebuilt-jet.vercel.app`، مشروع `rebuilt` في الفريق `rebuilt1`) ما زال يبني `main` من `rebuilt0.4`. لم أمسّ شيئًا فيه. بعد نجاح موقع التطوير على Pages:

- **قبل** نشر الإصدار `0.4.6` على Stable: افصل المشروع أو أوقفه، لأن العنوان `*.vercel.app` صار «development» ⇐ لا قاعدة بيانات (الوضع المحلي)، وقد يرى أحدٌ أن التسجيل «توقّف» على ذلك الرابط.
- Vercel ← مشروع `rebuilt` ← Settings ← Git ← **Disconnect** (أو Settings ← Advanced ← حذف المشروع). **لم أستطع رؤية** إعدادات الدومين/DNS في Vercel ولا عند مزوّد الدومين (الـ sandbox لا يصل إليها). ما أعرفه: `getrebuilt.online` مربوط بـ GitHub Pages عبر ملف `CNAME` ونشر Pages يعرضه كـ environment_url. قبل الفصل تحقق من Vercel ← Settings ← Domains أن `getrebuilt.online` **غير مضاف هناك**، ومن سجلات DNS عند المزوّد أنها تشير إلى GitHub Pages؛ إن كان مضافًا في Vercel فلا تحذف المشروع قبل أن نراجع الأثر معًا.
- بعد الإيقاف احذف `https://rebuilt-jet.vercel.app/` من Redirect URLs في Supabase (إن أردت).

## 11. سجل الإصدارات

| الإصدار | Build Marker | Commit | الحالة |
|---|---|---|---|
| Stable الحالي (قبل الفصل) | `0.4.5 confirm-email 2026-10-26` | `005e429` على `rebuilt0.4` | آخر نشر Pages موثق 2026-10-28 10:36 UTC؛ المحتوى الحيّ على الدومين **لم يُتحقق منه** من هذه الجلسة |
| Development | `0.4.6 dev-split 2026-10-29` | (يُحدَّد عند الرفع) | غير مرفوع بعد |

## 12. خطوات لا يمكن تنفيذها من داخل GitHub (ملخص)

1. تفعيل Pages للمستودع الخاص (Source = GitHub Actions) + التأكد من خطة الحساب (القسم 4).
2. إنشاء مشروع Supabase للتطوير وإعدادات Auth/Google له (القسم 9).
3. إيقاف Vercel (القسم 10).
4. إعدادات الإنتاج المعلقة من قبل: Site URL/Redirect URLs/قوالب البريد وتفعيل Google في مشروع الإنتاج (انظر `WEB-DEPLOYMENT.md`).
5. حذف الفرع `develop` من `rebuilt0.4` (آمن: مطابق لـ `main` ولا يُنشر منه شيء) وإنشاء tag الرجوع.
