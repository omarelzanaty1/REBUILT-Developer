-- ============================================================
-- REBUILT 0.4 — 05_isolation_test_rolled_back.sql   (OPTIONAL but recommended)
--
-- Proves, inside the real database, that the security rules hold:
-- two throw-away users, each acting through the same `authenticated` role the
-- app uses. EVERYTHING IS ROLLED BACK at the end — no user, row or change
-- survives. Safe to run on the new project after 01 + 02 + 03.
--
-- HOW TO READ THE RESULT: the script ends with an INTENTIONAL error whose text is
-- the list of checks: "ISOLATION TEST FINISHED - 0 check(s) failed" followed by
-- one PASS/FAIL line per check. 0 failed + all lines PASS = the security rules
-- hold. (Raising the error is what forces the rollback.) If you instead get a
-- different error, nothing is saved either — send me the error text.
-- ============================================================

begin;

-- SAFETY GUARD: refuse to run (changing nothing) unless 01-03 are in place and the two
-- throw-away identities are free. Every data statement below touches ONLY these two ids.
do $$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.user_xp_totals') is null
     or to_regprocedure('public.handle_new_user()') is null
     or not exists (select 1 from pg_trigger
                    where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created' and not tgisinternal) then
    raise exception 'STOP: run 01, 02 and 03 first (schema or signup trigger missing). Nothing was changed.';
  end if;
  if exists (select 1 from auth.users
             where id in ('aaaaaaaa-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b')
                or email in ('iso-a@example.invalid', 'iso-b@example.invalid')) then
    raise exception 'STOP: a test identity already exists in auth.users. Nothing was changed.';
  end if;
end $$;

create temp table t_results (n serial, test text, passed boolean);
grant all on t_results to public;
grant usage on sequence t_results_n_seq to public;

-- ---- two throw-away users (the signup trigger must create their rows) ----
insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'iso-a@example.invalid', '{"name":"User A"}'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'iso-b@example.invalid', '{"name":"User B"}');

insert into t_results (test, passed)
select 'signup trigger created profile + user_profile + ai_profile for both users',
       (select count(*) from public.profiles      where id      in ('aaaaaaaa-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b')) = 2
   and (select count(*) from public.user_profiles where user_id in ('aaaaaaaa-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b')) = 2
   and (select count(*) from public.ai_profiles   where user_id in ('aaaaaaaa-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b')) = 2;

insert into t_results (test, passed)
select 'trigger copied the name from signup metadata',
       (select name from public.profiles where id = 'aaaaaaaa-0000-4000-8000-00000000000a') = 'User A';

-- ---- act as user B: create a habit ----
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true);

insert into public.habits (id, user_id, title, xp)
values ('bbbbbbbb-1111-4000-8000-00000000000b', 'bbbbbbbb-0000-4000-8000-00000000000b', 'B habit', 20);

-- ---- act as user A ----
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);

do $$
declare
  a constant uuid := 'aaaaaaaa-0000-4000-8000-00000000000a';
  b constant uuid := 'bbbbbbbb-0000-4000-8000-00000000000b';
  n int;
  v int;
begin
  -- reads are scoped to the caller
  select count(*) into n from public.profiles;
  insert into t_results (test, passed) values ('A sees only their own profile row', n = 1);
  select count(*) into n from public.habits where user_id = b;
  insert into t_results (test, passed) values ('A cannot read B''s habits', n = 0);
  select count(*) into n from public.user_xp_totals;
  insert into t_results (test, passed) values ('XP view shows only A''s own row', n = 1);

  -- A's normal work succeeds
  insert into public.habits (id, user_id, title, xp) values ('aaaaaaaa-1111-4000-8000-00000000000a', a, 'A habit', 20);
  insert into public.habit_completions (habit_id, user_id, completed_on, xp_awarded)
    values ('aaaaaaaa-1111-4000-8000-00000000000a', a, current_date, 20);
  insert into public.tasks (user_id, title, xp, completed, completed_at, xp_awarded)
    values (a, 'A task', 25, true, current_date, 25);
  insert into public.unlocked_achievements (user_id, achievement_id, xp_awarded) values (a, 'first_step', 15);
  insert into public.daily_history (user_id, date, habits_completed, total_habits) values (a, current_date, 1, 1);
  insert into public.schedule_items (user_id, title, date, start_time) values (a, 'A item', current_date, '09:00');
  insert into public.ai_conversations (user_id, role, content) values (a, 'user', 'hi');
  update public.user_profiles set goals = array['rbg1:{"id":"g1","title":"x"}'] where user_id = a;
  update public.profiles set is_onboarded = true, settings = '{"reduceMotion": true}'::jsonb where id = a;
  get diagnostics n = row_count;
  insert into t_results (test, passed) values ('A can create/update their own habits, completions, tasks, achievements, history, planner, chat, profile', n = 1);

  select total_xp into v from public.user_xp_totals;
  insert into t_results (test, passed) values ('derived XP = 20 (habit) + 25 (task) + 15 (achievement) = 60', v = 60);

  -- the 42501 / 23xxx cases: each MUST raise
  begin
    insert into public.habits (user_id, title) values (b, 'planted in B');
    insert into t_results (test, passed) values ('A cannot create a habit owned by B', false);
  exception when insufficient_privilege then
    insert into t_results (test, passed) values ('A cannot create a habit owned by B', true);
  end;

  begin
    insert into public.habit_completions (habit_id, user_id, completed_on, xp_awarded)
      values ('bbbbbbbb-1111-4000-8000-00000000000b', a, current_date, 999);
    insert into t_results (test, passed) values ('A cannot complete B''s habit (composite FK)', false);
  exception when foreign_key_violation then
    insert into t_results (test, passed) values ('A cannot complete B''s habit (composite FK)', true);
  end;

  begin
    insert into public.habit_completions (habit_id, user_id, completed_on, xp_awarded)
      values ('aaaaaaaa-1111-4000-8000-00000000000a', a, current_date, 20);
    insert into t_results (test, passed) values ('same habit cannot be completed twice on one day', false);
  exception when unique_violation then
    insert into t_results (test, passed) values ('same habit cannot be completed twice on one day', true);
  end;

  begin
    insert into public.habits (user_id, title, xp) values (a, 'bad xp', 0);
    insert into t_results (test, passed) values ('xp must be positive (check constraint)', false);
  exception when check_violation then
    insert into t_results (test, passed) values ('xp must be positive (check constraint)', true);
  end;

  begin
    insert into public.profiles (id, name) values (gen_random_uuid(), 'fake');
    insert into t_results (test, passed) values ('client cannot insert a profile row', false);
  exception when insufficient_privilege then
    insert into t_results (test, passed) values ('client cannot insert a profile row', true);
  end;

  begin
    delete from public.profiles where id = a;
    insert into t_results (test, passed) values ('client cannot delete their own profile row', false);
  exception when insufficient_privilege then
    insert into t_results (test, passed) values ('client cannot delete their own profile row', true);
  end;

  -- writes to B's rows are silently invisible (RLS filters them out: 0 rows touched)
  update public.profiles set name = 'hacked' where id = b;
  get diagnostics n = row_count;
  insert into t_results (test, passed) values ('A cannot update B''s profile (0 rows touched)', n = 0);
  update public.tasks set title = 'hacked' where user_id = b;
  get diagnostics n = row_count;
  insert into t_results (test, passed) values ('A cannot update B''s tasks (0 rows touched)', n = 0);
  delete from public.habits where id = 'bbbbbbbb-1111-4000-8000-00000000000b';
  get diagnostics n = row_count;
  insert into t_results (test, passed) values ('A cannot delete B''s habit (0 rows touched)', n = 0);
end $$;

-- ---- logged-out visitor (anon role) ----
set local role anon;
do $$
begin
  begin
    perform count(*) from public.habits;
    insert into t_results (test, passed) values ('logged-out (anon) cannot read habits', false);
  exception when insufficient_privilege then
    insert into t_results (test, passed) values ('logged-out (anon) cannot read habits', true);
  end;
  begin
    perform count(*) from public.profiles;
    insert into t_results (test, passed) values ('logged-out (anon) cannot read profiles', false);
  exception when insufficient_privilege then
    insert into t_results (test, passed) values ('logged-out (anon) cannot read profiles', true);
  end;
end $$;

-- ---- back to the admin role: deleting an auth user must remove ALL of their data ----
reset role;
delete from auth.users where id = 'aaaaaaaa-0000-4000-8000-00000000000a';
insert into t_results (test, passed)
select 'deleting the auth user cascades to every table (account deletion leaves nothing behind)',
       (select count(*) from public.profiles where id = 'aaaaaaaa-0000-4000-8000-00000000000a')
     + (select count(*) from public.user_profiles where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a')
     + (select count(*) from public.ai_profiles where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a')
     + (select count(*) from public.habits where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a')
     + (select count(*) from public.habit_completions where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a')
     + (select count(*) from public.tasks where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a')
     + (select count(*) from public.schedule_items where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a')
     + (select count(*) from public.daily_history where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a')
     + (select count(*) from public.unlocked_achievements where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a')
     + (select count(*) from public.ai_conversations where user_id = 'aaaaaaaa-0000-4000-8000-00000000000a') = 0;

-- The result list is delivered INSIDE an intentional error. Raising it is what
-- guarantees that the whole transaction (users, rows, everything) is rolled back,
-- and it makes the list show up reliably in the SQL Editor's error panel.
do $$
declare
  r text;
  fails int;
begin
  select string_agg(case when passed then 'PASS  ' else 'FAIL  ' end || test, E'\n' order by n),
         count(*) filter (where not passed)
    into r, fails
  from t_results;
  raise exception E'ISOLATION TEST FINISHED - % check(s) failed.\n(This error is intentional: it forces the rollback. Nothing was saved.)\n\n%', fails, r;
end $$;

rollback;
