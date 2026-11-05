# REBUILT — بيئتان منفصلتان: Development و Stable

> المرجع الكامل للفصل بين نسخة التطوير والنسخة الرسمية. (تفاصيل الإعدادات اليدوية داخل Supabase/Google ما زالت في `WEB-DEPLOYMENT.md`.)

## 1. الخريطة

| | **Stable — النسخة الرسمية** | **Development — التطوير** |
|---|---|---|
| المستودع | [`omarelzanaty1/rebuilt0.4`](https://github.com/omarelzanaty1/rebuilt0.4) (عام) | [`omarelzanaty1/REBUILT-Developer`](https://github.com/omarelzanaty1/REBUILT-Developer) (**خاص**) |
| الفرع الذي يُنشر | `main` | `main` |
| الرابط | https://getrebuilt.online/ (وهو نفسه `https://omarelzanaty1.github.io/rebuilt0.4/`) | https://omarelzanaty1.github.io/REBUILT-Developer/ |
| طريقة النشر | GitHub Pages «من الفرع `main`» + ملف `CNAME` (لم يتغيّر) | GitHub Pages «من GitHub Actions» (`.github/workflows/pages.yml`: test → build → deploy → verify) تلقائيًا عند كل push ناجح على `main` |
| من يغيّره | `scripts/release.sh` فقط، بعد موافقتك الصريحة على commit بعينه | أي push على `main` في مستودع التطوير |
| قاعدة البيانات | مشروع Supabase الحالي `jvyhtpfedkypwdzyadba` (المستخدمون الحقيقيون) | مشروع منفصل **`REBUILT-Dev`** (`zdqwhbtsjjlfkzdywsqt`، eu-west-3) — **على موقع Developer وحده**، بالوضع الصارم (القسم 9). أي عنوان آخر غير رسمي = وضع محلي بلا أي طلب إلى Supabase |
| للمستخدمين؟ | نعم | **لا** — للمبرمجين والاختبار فقط |

**الفصل لا يعتمد على إعداد يمكن نسيانه:** `js/supabaseClient.js` يقرّر مشروع Supabase **من العنوان الذي حُمّلت منه الصفحة**، وثلاث حالات فقط:

| العنوان | ماذا يتصل به |
|---|---|
| عنوان رسمي (`getrebuilt.online` و`www.` و`omarelzanaty1.github.io/rebuilt0.4/`) | مشروع الإنتاج |
| موقع Developer فقط: `https://omarelzanaty1.github.io/REBUILT-Developer/` | مشروع التطوير `REBUILT-Dev` (صارم) |
| أي عنوان آخر: `localhost` و`127.0.0.1` وملف و`*.vercel.app` وأي عنوان غير معروف (حتى على `omarelzanaty1.github.io` نفسه) | **لا شيء** — وضع محلي في المتصفح، لا عميل Supabase ولا أي طلب إلى `*.supabase.co`، والوضع الصارم مغلق |

لذلك حتى لو نُسخ ملف التطوير بالغلط إلى مكان آخر، لا يلمس بيانات المستخدمين الحقيقيين ولا يمسّ `REBUILT-Dev` إلا موقع Developer. (يثبّت ذلك `auth.test.js` و`strict.test.js` و`run_channels.js` و`run_strict.js`؛ وجُرِّب بإزالة القيد في نسخة تجريبية فسقطت 6 اختبارات وحدة و9 فحوص متصفح.)

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

على `localhost` يعمل التطبيق في الوضع المحلي (حسابات وبيانات داخل المتصفح فقط) — لا يتصل بأي Supabase، **ولا حتى بـ`REBUILT-Dev`**: الاتصال به لموقع Developer فقط (القسم 1). لتجربة المشروع الحقيقي افتح موقع Developer المنشور.

## 4. نشر نسخة التطوير (موقع المعاينة)

دورة العمل المعتمدة:

```
Developer (push إلى main) → GitHub Actions → موقع المعاينة → مراجعتك → موافقتك الصريحة → Stable
```

كل `git push` على `main` في مستودع التطوير يشغّل `.github/workflows/pages.yml` بأربع مراحل متتالية، وكل مرحلة تعتمد على نجاح السابقة:

1. **test** — اختبارات الوحدة + حراس المستودع + اختبارات `release.sh`. أي فشل يوقف الباقي.
2. **build** — يجمّع الموقع من الملفات المذكورة في `scripts/site-files.txt` **فقط** (`index.html` و`css/` و`js/` و`assets/` و`manifest.webmanifest` و`sw.js`)، ويفشل إن وُجد `CNAME` أو أي من `supabase/` و`tests/` و`docs/` و`scripts/` و`.github/` داخل الناتج، ثم يرفعه كـ artifact.
3. **deploy** — ينشر الـ artifact على Pages الخاص بهذا المستودع.
4. **verify** — يفتح العنوان المنشور ويقارن الـ Build Marker المقدَّم بالمتوقّع، ويتأكد أن `/CNAME` و`/supabase/…` و`/tests/…` و`/docs/…` و`/scripts/…` و`/.github/…` تردّ **404**، وأن `supabaseClient.js` المنشور فيه ملف التطوير.

الـ token في كل المراحل للقراءة فقط عدا `deploy` (`pages: write`, `id-token: write`) ولمستودع التطوير وحده؛ لا يملك أي صلاحية على `rebuilt0.4`. الانتقال إلى Stable لا يحدث من هنا أبدًا — فقط `scripts/release.sh` بعد موافقتك (القسم 7).

**إعداد يدوي لمرة واحدة** (لا يمكن عمله من ملف ولا من جلسة Claude، فالـ proxy يمنع مسار Pages API): في المستودع الخاص ← Settings ← Pages ← Build and deployment ← Source = **GitHub Actions**. قبل ذلك تفشل مرحلة `deploy` برسالة `Get Pages site failed … Not Found` (والمراحل قبلها تنجح)؛ بعد تفعيله اضغط على أي run ← **Re-run failed jobs** فيُنشر نفس الـ artifact بدون commit جديد.

> **الخطة:** وفق توثيق GitHub، Pages للمستودعات **الخاصة** متاح في خطط GitHub Pro / Team / Enterprise فقط؛ الخطة المجانية للمستودعات العامة فقط ([GitHub Docs](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)). لا أستطيع قراءة خطة حسابك من الجلسة؛ تعرف النتيجة فور فتح Settings ← Pages (إن لم تتوفر الخطة تظهر رسالة بذلك بدل خيار Source). **وفي الخطط غير Enterprise Cloud يكون عنوان الموقع مفتوحًا لمن يعرفه حتى لو المستودع خاص** — لا أسرار فيه (مفتاح publishable فقط لمشروع `REBUILT-Dev`)، وفيه `noindex`، لكن `noindex` ليس تحكمًا في الوصول.

## 5. الاختبارات

| ماذا | الأمر | ماذا يثبت |
|---|---|---|
| وحدات (بلا تبعيات) | `node tests/auth.test.js` | المصادقة، الأمان، عدم وجود أسرار/عناوين محلية، **فصل البيئات** (أي عنوان يستخدم أي مشروع) |
| هيكل المستودع | `node tests/dev-repo.test.js` | لا `CNAME`، المنشور = ملفات الموقع فقط، لا أسرار، ملفات SQL كاملة وغير مدمّرة، **وكل ملف `tests/*.test.js` يعمل داخل job الاختبار في `pages.yml`** (فشل أي اختبار يمنع النشر) |
| الوضع الصارم (المرحلة 3) | `node tests/strict.test.js` | فشل الكتابة يُبلَّغ ولا يُبتلع، التحميل الجزئي خطأ لا قائمة فاضية، لا قراءة ولا كتابة لـ `rebuilt_state_v1`، لا دخول محلي حين يكون الـbackend مُعدًّا ولا يعمل، الجداول الكبيرة تُقرأ كاملة؛ وسلوك Stable مثبَّت كما هو. **ثغرة معروفة:** تثبيت إصدار supabase-js (انظر أدناه) |
| سكربت الإصدار | `node tests/release.test.js` | promote/rollback على مستودعات محلية مؤقتة (انظر 7 و 8) |
| Full Regression Sweep | `npm install && npx playwright install chromium && bash tests/browser/run-all.sh` (أو Actions ← «Full regression sweep» ← Run workflow، يدويًا فقط وبصلاحية قراءة فقط) | 10 مجموعات متصفح: الوضع المحلي، الاستيراد/التصدير، الوضع المتصل، service worker، استعادة الباسورد (OTP)، Google، تأكيد البريد، **القنوات**، **الوضع الصارم** (`run_strict.js`: السيرفر واقع، جدول فاشل، كتابة مرفوضة، المكتبة محجوبة، 2500 صف، Stable دون تغيير) |

**حدود هذه الاختبارات:** اختبارات المتصفح تعمل على **نسخة محاكاة** لـ Supabase وGoogle داخل المتصفح (`tests/browser/fake-supabase.js`). تثبت ما يرسله التطبيق وكيف يتصرف عند كل ردّ، **لا** ما يردّ به Supabase/Google الحقيقيان. تسجيل حساب حقيقي، وصول رسالة بريد حقيقية، OTP حقيقي، وGoogle OAuth حقيقي — كلها تُجرَّب يدويًا على بيئة لها مشروع Supabase (ولا تُجرَّب بحسابات حقيقية في التطوير).

اختبار قاعدة البيانات (قراءة فقط على الإنتاج): `supabase/verify/schema_signature.sql` يعطي «بصمة» للمخطط (أعمدة، قيود، فهارس، سياسات RLS، دوال، triggers، صلاحيات). تُشغَّل على أي مشروع وتُقارن الأرقام. القيم المعتمدة الآن (إنتاج = ملفات SQL):

```
columns 89 · constraints 32 · fn_grants 4 · functions 2 · indexes 18 · policies 13 · rls 10 · table_grants 231 · triggers 4 · view_options 1 · views 1
```

**تصحيح (المرحلة 3):** كان الاستعلام يستثني دالة المنصة `rls_auto_enable` من بند `functions` ولا يستثنيها من `fn_grants`، فكان `fn_grants` يخرج **6** لا 4 على أي مشروع. صار يستثنيها في الموضعين. جُرِّب الاستعلام المعدّل **قراءةً فقط على REBUILT-Dev**: `fn_grants` = 4 وبصمته `6e8be116…` (مطابقة للمرجع). **لم يُجرَّب على Production** (يحتاج موافقة جديدة)؛ المتوقع أن يعطي 4 أيضًا لأن الدالة نفسها موجودة هناك، لكن هذا غير مُتحقَّق منه.

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

### مشروع التطوير `REBUILT-Dev` — الحالة

1. **(تم — أنت)** المشروع `REBUILT-Dev` (`zdqwhbtsjjlfkzdywsqt`، eu-west-3، Postgres 17). كلمة سر قاعدة البيانات في مدير كلمات المرور فقط (لا تُكتب في Git ولا في المحادثة).
2. **(تم — Claude)** تطبيق `supabase/migrations/20261022214309_*` ثم `20261022214525_*`؛ تشغيل `04_verify` (المتوقع 69 `OK`) و`05_isolation_test` و`schema_signature.sql` ومقارنة البصمة بالإنتاج. **لا** `06` (AI، متوقف) ولا `07` (لا مستخدمين لنقلهم).
3. **(لم يُنفَّذ — أنت، يدويًا في لوحة REBUILT-Dev؛ لا تُقرأ ولا تُكتب من هنا)** إعدادات Auth للمشروع الجديد: Site URL و Redirect URLs = `https://omarelzanaty1.github.io/REBUILT-Developer/` ؛ Confirm email مفعّل؛ الحد الأدنى للباسورد 8؛ قالب Confirm signup: `…/REBUILT-Developer/?token_hash={{ .TokenHash }}&type=email` ؛ قالب Reset Password يعرض `{{ .Token }}`؛ Google (اختياري): إضافة `https://<ref-التطوير>.supabase.co/auth/v1/callback` إلى Authorized redirect URIs لنفس OAuth client (أو client منفصل) وتفعيل المزوّد بـ Client ID/Secret داخل لوحة Supabase فقط.
4. **(تم محليًا — Claude)** وُضع **URL ومفتاح publishable** فقط (`https://zdqwhbtsjjlfkzdywsqt.supabase.co` و`sb_publishable_…`) في `PROFILES.development` داخل `js/supabaseClient.js`؛ لا `service_role` ولا كلمة سر قاعدة بيانات في أي ملف (الاختبار يرفض أي مفتاح غير publishable أو أي عنوان/مفتاح إنتاج، ويثبت أن هذين المعرّفين لا يظهران إلا في هذا الملف). **لم يُرفع ولم يُنشر بعد.**
5. البريد: بريد Supabase الافتراضي يرسل لأعضاء الفريق فقط وبحد صغير — يكفي للتطوير؛ استخدم عناوين الفريق/الحسابات التجريبية.

**لا يُنقل:** مستخدمون، جلسات، tokens، كلمات مرور، صفوف بيانات. **المخاطر:** المشروع المجاني يتوقف بعد نحو أسبوع بلا نشاط (وهذا مقبول للتطوير)؛ إنشاء المشروع ليس تدميريًا ولا يمس الإنتاج؛ الخطأ الوحيد المحتمل هو لصق مفتاح الإنتاج في ملف التطوير — والاختبارات تمنعه.

### إعدادات Auth اليدوية لـ`REBUILT-Dev` (من لوحة Supabase — لا تُقرأ ولا تُكتب من الجلسة)

لوحة المشروع ← Authentication. بدونها يعمل الاتصال والقراءة والكتابة، لكن **تأكيد البريد** وإرجاع المستخدم للموقع الصحيح لن يعملا (يرجعه Supabase إلى الـSite URL الافتراضي `http://localhost:3000`).

| أين | القيمة |
|---|---|
| URL Configuration ← **Site URL** | `https://omarelzanaty1.github.io/REBUILT-Developer/` |
| URL Configuration ← **Redirect URLs** | `https://omarelzanaty1.github.io/REBUILT-Developer/` (بالشرطة المائلة في الآخر: هذا بالضبط ما يرسله التطبيق كـ`emailRedirectTo`/`redirectTo`) |
| Sign In / Providers ← **Email** | مفعَّل، **Confirm email** مفعَّل، الحد الأدنى للباسورد 8 |
| Email Templates ← **Confirm signup** | الرابط: `https://omarelzanaty1.github.io/REBUILT-Developer/?token_hash={{ .TokenHash }}&type=email` (التطبيق يتحقق منه بـ`verifyOtp`) |
| Email Templates ← **Reset Password** | يعرض الكود `{{ .Token }}` ولا يحوي `{{ .ConfirmationURL }}` (الاستعادة بكود رقمي قصير، انظر `WEB-DEPLOYMENT.md`) |
| البريد (SMTP / حدود الإرسال) | البريد الافتراضي يرسل لأعضاء الفريق فقط وبحد صغير في الساعة: استخدم عنوانك أو عناوين الفريق (`@example.com` لا يستلم شيئًا). لا تحتاج SMTP مخصصًا للتطوير |
| Providers ← **Google** | اختياري ومغلق افتراضيًا: لو أردته أضف `https://zdqwhbtsjjlfkzdywsqt.supabase.co/auth/v1/callback` إلى Authorized redirect URIs في Google Cloud، وضع Client ID/Secret داخل لوحة Supabase فقط. بدونه يفحص التطبيق قبل التحويل ويعرض رسالة بدل صفحة خطأ (انظر `WEB-DEPLOYMENT.md`) |
| Attack Protection ← Leaked password protection | اختياري ولا يؤثر على الاتصال (في الإنتاج مغلق حاليًا — انظر ملاحظات المستشار أعلاه) |

ملاحظة: مشروع التطوير **لا حسابات فيه** (`auth.users` = 0 وكل جداول التطبيق فارغة وقت الفحص)، وحساباته منفصلة تمامًا عن الإنتاج: من سجّل في `getrebuilt.online` يحتاج حسابًا جديدًا هنا، ولا يُنقل أحد.

### الوضع الصارم (Strict mode) — المرحلة 3

**القاعدة:** backend مُعدّ وفشل = خطأ يراه المستخدم، لا تخزين محلي صامت. يُشتق في `js/supabaseClient.js` (`mustUseBackend()`) من العنوان فقط: يعمل **على موقع Developer** (الوحيد الذي له backend غير الإنتاج)، ولا يعمل أبدًا في `stable`، ولا في أي عنوان بلا backend (`localhost` وغيره = الوضع المحلي المقصود). `REBUILT.diagnose()` يعرض `strict`.

| الحالة (strict) | السلوك |
|---|---|
| السيرفر واقع / شبكة | شاشة خطأ حاجبة (`#backend-error`) بزر «جرّب تاني» وزر خروج؛ التطبيق مخفي؛ لا بيانات قديمة |
| فشل جدول واحد من الـ11 | الشاشة نفسها وتذكر اسم الجدول؛ لا قائمة فاضية؛ لا state جزئي |
| كتابة رُفضت (RLS/شبكة/جدول مفقود) | رسالة ظاهرة، ثم إعادة تحميل من السيرفر فتعود الشاشة للمحفوظ فعلًا؛ التعديلات التابعة لإنشاء فاشل لا تُرسل |
| تكرار إنجاز العادة (23505) | يُعدّ نجاحًا |
| انتهاء الجلسة (JWT/401) | شاشة الدخول، لا خطأ قاعدة بيانات |
| المكتبة لم تُحمَّل | شاشة «السيرفر مش متاح»؛ لا دخول بالإيميل على الجهاز فقط (`UnavailableProvider`) |
| `rebuilt_state_v1` | لا قراءة ولا كتابة (تبقى `clear()` عند الخروج لإزالة نسخة قديمة) |
| الجداول الكبيرة | تُقرأ بالصفحات (`range` + عدّ كلي) وتُقارن بالعدد الذي أعلنه السيرفر؛ نقص = خطأ لا تحميل جزئي |
| ترتيب الصفوف | كل جدول يُرتَّب في السيرفر ترتيبًا كاملًا ثابتًا: العادات والمهام والجدول وإنجازات العادات (`habit_completions`) بـ`created_at` ثم `id`؛ `unlocked_achievements` بـ`unlocked_at` ثم `achievement_id`؛ `daily_history` بـ`date`؛ المحادثات بـ`created_at` ثم `id`. الـ`id` هو UUID عشوائي فيكسر التعادل فقط ولا يكون المفتاح الأول (الصفحة الصحيحة تتطلب ترتيبًا كاملًا حتى لا يتكرر صف أو يُفوَّت بين صفحتين) |

شارة صغيرة في الزاوية: `Dev · REBUILT-Dev` حين يكون الـbackend هو مشروع التطوير، و«وضع محلي» حين لا يوجد سيرفر (CSS فقط من `data-backend` / `data-mode` على `<html>`).

**ما لا يغطيه (معروف ومُعلَن):**
- **حدود `created_at` (وقت الإنشاء):** العادات والمهام تُكتب الآن بلحظة الإنشاء (`createdStamp` من `Data.stampNow()`: توقيت الجهاز المحلي بلا منطقة زمنية، ومتتابع حتى داخل نفس الميلي ثانية) فيُحفظ ترتيب الإنشاء داخل اليوم الواحد وبعد «تراجع» الحذف (الحقل يرافق الكائن فتُكتب لحظته الأصلية). ما بقي:
  - **صفوف قديمة (كُتبت «يوم + `T00:00:00`»):** لا Migration لها (ممنوعة)؛ تبقى متعادلة داخل يومها وتُرتَّب بالـ`id` كما كانت، وتأتي قبل صفوف اليوم نفسه الجديدة. وأي كائن بلا `createdStamp` (نسخة محلية قديمة، ملف مستورد، بيانات تجريبية) يُكتب كما في السابق: اليوم فقط.
  - **الإطار الزمني:** قيمة `created_at` للعادات والمهام هي ساعة الجهاز المحلية مخزَّنة كأنها UTC (نفس إطار القيمة القديمة `T00:00:00`، ولهذا لا يتحرك اليوم المقروء `createdAt` أبدًا) — فهي ليست لحظة UTC حقيقية؛ لا تُقارَن بساعة السيرفر. تغيير المنطقة الزمنية للجهاز أثناء اليوم نفسه قد يعكس ترتيب عنصرين.
  - **`schedule_items` و`habit_completions`:** لم تكن تاريخًا فقط أصلًا؛ ساعة السيرفر `now()` تختمها ولا يُرسَل شيء عند الإنشاء (عند «التراجع» يُعاد إرسال القيمة الأصلية للجدول). `unlocked_achievements` عمودها `unlocked_at` تاريخ فقط ولا `created_at` له، فلا وقت يُسجَّل بدون Migration.
  - فُحص على `REBUILT-Dev` (SQL): أعمدة `created_at` كلها `timestamptz` بافتراضي `now()`، و`to_json` لقيمة بلا منطقة زمنية يُرجِع `2026-11-05T10:20:30.123456+00:00` (المنطقة الافتراضية للجلسة UTC، فتُقرأ القيمة بلا منطقة كـUTC تمامًا كما يفترض `createdAtFor`) — وهو الشكل الذي تحاكيه الاختبارات. **لم يُجرَّب** مسار PostgREST الحقيقي من التطبيق (لا اتصال من بيئة العمل إلى `*.supabase.co`)؛ لو اختلف الشكل يرجع «التراجع» للسلوك القديم (اليوم فقط) دون خطأ.
- **UPDATE/DELETE بصفر صفوف:** RLS قد يجعل تعديلًا يطابق صفر صف يرجع بلا خطأ؛ لا يُكتشف (يلزم `.select()` بعد كل تعديل). غير منفَّذ.
- **supabase-js غير مثبَّت:** `index.html` ما زال يحمّل `@supabase/supabase-js@2` (عائم) بلا `integrity`. السكربت `scripts/pin-supabase-js.sh <x.y.z>` يثبّته ويحسب الـhash من الحزمة والـCDN معًا، لكنه يحتاج إنترنت ولم يمكن تشغيله حيث نُفِّذ العمل. اختبار `strict.test.js` يسجّله `todo()` ويصير ناجحًا حين يُنفَّذ؛ وبعد التثبيت يجب أن تقدّم اختبارات المتصفح `index.html` بلا `integrity` (المكتبة فيها مزيّفة).
- **سقف 1000 صف الحقيقي:** مُحاكى فقط (`maxRows` في الاختبارات)؛ لم يُقرأ سقف REBUILT-Dev الفعلي ولم يُجرَّب `Content-Range` الحقيقي.
- **Stable:** سلوكه مثبَّت باختبارات (فشل الكتابة صامت، الرجوع إلى النسخة المحلية)؛ تفعيل الصارم عليه قرار ترقية مستقل بموافقتك.
- **ربط `PROFILES.development` (تم محليًا، لم يُرفع):** بعد الرفع يتصل **موقع Developer وحده** بـREBUILT-Dev. جلسة اختبار حقيقية (حساب جديد، دخول/خروج، حفظ عادة ومهمة، إعادة تحميل) **لم تُجرَّ بعد** — تتم يدويًا على الموقع المنشور بعد ضبط Auth (أدناه)؛ اختبارات المتصفح محاكاة (انظر «حدود هذه الاختبارات»).
- **نسخة قديمة على الجهاز:** المفتاح `rebuilt_state_v1` مشترك بين كل مواقع `omarelzanaty1.github.io` على نفس المتصفح (المصدر نفسه)، فقد تحمل صفحة Developer بيانات قديمة من موقع آخر. الوضع الصارم لا يقرؤها ولا يكتب عليها، وتُمسح عند تسجيل الخروج (`Storage.clear()`).

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
