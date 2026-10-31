-- ============================================================
-- REBUILT 0.4 — 07_optional_backfill_existing_users.sql   (OPTIONAL)
--
-- Only needed if somebody signed up in the new project BEFORE 02_functions_triggers.sql
-- was run (00_preflight shows "rows in auth.users" > 0). Those accounts have no
-- profile rows, and the app would silently fall back to device-only mode for them.
-- This creates the missing rows. It is idempotent: running it twice changes nothing
-- the second time, and it never touches rows that already exist.
-- ============================================================

begin;

insert into public.profiles (id, name, email)
select u.id, coalesce(u.raw_user_meta_data ->> 'name', ''), u.email
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

insert into public.user_profiles (user_id)
select p.id from public.profiles p
where not exists (select 1 from public.user_profiles x where x.user_id = p.id);

insert into public.ai_profiles (user_id)
select p.id from public.profiles p
where not exists (select 1 from public.ai_profiles x where x.user_id = p.id);

-- What it did (users without a profile should now be 0):
select
  (select count(*) from auth.users)                                                       as auth_users,
  (select count(*) from public.profiles)                                                  as profiles,
  (select count(*) from auth.users u where not exists (select 1 from public.profiles p where p.id = u.id)) as users_without_profile;

commit;
