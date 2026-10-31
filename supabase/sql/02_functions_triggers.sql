-- ============================================================
-- REBUILT 0.4 — 02_functions_triggers.sql
-- Run AFTER 01_schema.sql and BEFORE the first signup.
--
--   handle_new_user()  — when someone signs up through Supabase Auth, create
--                        their profiles / user_profiles / ai_profiles rows.
--                        The app depends on this: if the profile row is
--                        missing, the app cannot load the account's data.
--   set_updated_at()   — keeps updated_at accurate on the three profile tables.
--
-- Both are internal trigger functions: nobody can call them through the API.
-- (On Supabase, EXECUTE is granted to anon/authenticated automatically when a
-- function is created, so the REVOKE has to name those roles explicitly.)
-- ============================================================

begin;

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''), new.email)
  on conflict (id) do nothing;

  insert into public.user_profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.ai_profiles   (user_id) values (new.id) on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.set_updated_at()  from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger set_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

create trigger set_ai_profiles_updated_at
  before update on public.ai_profiles
  for each row execute function public.set_updated_at();

-- The signup hook. Supabase allows the SQL Editor's role to create this trigger.
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

commit;
