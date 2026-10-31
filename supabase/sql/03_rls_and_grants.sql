-- ============================================================
-- REBUILT 0.4 — 03_rls_and_grants.sql
-- Row Level Security + table privileges. Run AFTER 01 and 02.
--
-- Rule for every table: a signed-in user can only see/change rows whose
-- owner is their own auth.uid(). auth.uid() is wrapped as (select auth.uid())
-- so Postgres evaluates it once per query instead of once per row.
--
-- Deliberate differences from the old project (none changes app behaviour —
-- the app never does anything the stricter rules forbid):
--   D1  policies are `to authenticated`, and the `anon` role gets NO table
--       privileges at all (the old project relied on RLS alone for anon).
--       Signing up / signing in / password recovery go through the Auth API,
--       not these tables, so the logged-out app never needs them.
--   D2  profiles / user_profiles / ai_profiles: signed-in users can only
--       SELECT and UPDATE. Rows are created by handle_new_user() and removed
--       only by deleting the auth user (cascade). A client can no longer
--       delete its own profile row (which would orphan the account) or insert
--       a second/fake one. js/supabaseData.js only ever updates these tables.
--   Also: authenticated gets only SELECT/INSERT/UPDATE/DELETE — not
--       TRUNCATE / REFERENCES / TRIGGER.
-- ============================================================

begin;

alter table public.profiles              enable row level security;
alter table public.user_profiles         enable row level security;
alter table public.ai_profiles           enable row level security;
alter table public.habits                enable row level security;
alter table public.habit_completions     enable row level security;
alter table public.tasks                 enable row level security;
alter table public.schedule_items        enable row level security;
alter table public.daily_history         enable row level security;
alter table public.unlocked_achievements enable row level security;
alter table public.ai_conversations      enable row level security;

-- Tables the app never inserts into / deletes from: read + update only.
create policy "own profile read" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "own profile update" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "own user_profile read" on public.user_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own user_profile update" on public.user_profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "own ai_profile read" on public.ai_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own ai_profile update" on public.ai_profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Data tables: full access to your own rows only.
create policy "own habits" on public.habits
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own habit_completions" on public.habit_completions
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own tasks" on public.tasks
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own schedule_items" on public.schedule_items
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own daily_history" on public.daily_history
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own unlocked_achievements" on public.unlocked_achievements
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own ai_conversations" on public.ai_conversations
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------- table privileges ----------
-- Start from nothing for the two API roles, then grant exactly what is needed.
-- (service_role is untouched; it bypasses RLS and must never be used in the browser.)
revoke all on
  public.profiles, public.user_profiles, public.ai_profiles, public.habits, public.habit_completions,
  public.tasks, public.schedule_items, public.daily_history, public.unlocked_achievements,
  public.ai_conversations, public.user_xp_totals
from anon, authenticated;

grant select, update on public.profiles, public.user_profiles, public.ai_profiles to authenticated;

grant select, insert, update, delete on
  public.habits, public.habit_completions, public.tasks, public.schedule_items,
  public.daily_history, public.unlocked_achievements, public.ai_conversations
to authenticated;

-- The view runs with the caller's rights (security_invoker), so RLS on the
-- underlying tables still applies: each user sees only their own total.
grant select on public.user_xp_totals to authenticated;

commit;
