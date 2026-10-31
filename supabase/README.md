# REBUILT — قاعدة البيانات (Supabase)

هذا المجلد **لا يُنشر** مع الموقع (`scripts/site-files.txt` لا يضمّه). فيه كل ما يصف قاعدة بيانات الإنتاج `jvyhtpfedkypwdzyadba`.

## الملفات

| المسار | الغرض |
|---|---|
| `migrations/20261022214309_rebuilt_0_4_schema.sql` | **المخطط كاملًا في migration واحدة** (01+02+03): 10 جداول + view الـXP + دوال + triggers + RLS + صلاحيات. هذه هي الصيغة المطبَّقة على الإنتاج بتاريخ 2026-10-22 |
| `migrations/20261022214525_revoke_rls_auto_enable_execute.sql` | سحب EXECUTE على دالة المنصة `rls_auto_enable` من أدوار الـAPI. (نص التنفيذ الأصلي غير محفوظ في Git؛ هذا الملف يعيد إنتاج **أثره**، وقد تحققت أن الإنتاج مطابق له) |
| `sql/00…07` | نفس المخطط مقسومًا لملفات مرقمة + فحوص: `00` فحص مسبق (قراءة)، `01` مخطط، `02` دوال/triggers، `03` RLS وصلاحيات، `04` تحقق (قراءة؛ المتوقع **69 صفًا كلها OK**)، `05` اختبار عزل المستخدمين (ينتهي بخطأ مقصود `0 check(s) failed` ولا يحفظ شيئًا)، `06` AI **ممنوع تشغيله** (حاجز مقصود، غير مطبّق على الإنتاج)، `07` استعادة صفوف مستخدمين موجودين (اختياري) |
| `verify/schema_signature.sql` | **بصمة المخطط** (قراءة فقط): تُشغَّل على أي مشروع وتُقارَن القيم |
| `verify/local_auth_stub.sql` | بديل أدنى لما يوفره Supabase (أدوار + `auth.users` + `auth.uid()`) لتجربة الملفات على Postgres محلي — للاختبار فقط |

## ما تم إثباته (على Postgres 16 محلي مؤقت، وقراءة فقط من الإنتاج)

- تطبيق الـ migration على قاعدة فارغة ⇒ `04_verify`: 69 `OK`، و`05`: `0 check(s) failed`.
- ملفات `01→03` + migration الثانية تعطي بصمة **مطابقة** لتلك المبنية من الـ migration.
- بصمة الإنتاج (استعلام قراءة فقط عبر Supabase) = بصمة النسخة المحلية في **11 من 11 فئة**:

```
columns 89 · constraints 32 · fn_grants 4 · functions 2 · indexes 18 · policies 13 · rls 10 · table_grants 231 · triggers 4 · view_options 1 · views 1
```

(صلاحيات الجداول لـ `service_role` تعتمد على الـ default privileges التي تضعها المنصة؛ `verify/local_auth_stub.sql` يحاكيها.)

## الاستخدام لمشروع تطوير جديد

الخطة الكاملة في `docs/ENVIRONMENTS.md` §9. باختصار: مشروع جديد فارغ ⇒ `migrations/…schema.sql` ثم `…revoke_rls_auto_enable…` ⇒ `sql/04_verify_readonly.sql` ⇒ `sql/05_isolation_test_rolled_back.sql` ⇒ `verify/schema_signature.sql` وقارن الأرقام أعلاه. **لا تشغّل أي ملف هنا على مشروع الإنتاج** (التطبيق عليه بالفعل).

## قواعد

- لا `drop` ولا `truncate` ولا `delete` غير محصور بهويات الاختبار الوهمية في أي ملف هنا (يتحقق منه `tests/dev-repo.test.js`).
- لا بيانات مستخدمين ولا كلمات مرور ولا tokens ولا مفاتيح سرية. الواجهة تستخدم **publishable key فقط**.
