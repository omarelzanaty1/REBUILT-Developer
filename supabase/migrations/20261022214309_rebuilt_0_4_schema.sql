-- REBUILT 0.4 schema: 01_schema + 02_functions_triggers + 03_rls_and_grants as ONE atomic migration

-- >>>>>>>>>> 01_schema.sql
-- ============================================================
-- REBUILT 0.4 — 01_schema.sql
-- Tables, constraints, indexes and the XP view for a NEW, empty project.
--
-- This is the final state of the schema the app was built and tested against
-- (the 5 migrations rebuilt_core_schema … rebuilt_profile_onboarded_flag),
-- consolidated into one file. Table and column names are exactly what
-- js/supabaseData.js reads and writes — do not rename anything.
--
-- Runs as a single transaction: if any statement fails, nothing is created.
-- Plain CREATE TABLE (no IF NOT EXISTS) on purpose — see 00_preflight.
--
-- Deliberate differences from the old project (none changes app behaviour):
--   D4  profiles.avatar default is '' (was an emoji; avatars are now the
--       name's initial) and habits.icon default is 'flame' (was an emoji; the
--       app stores icon-set keys).
--   D3  habit_completions has a composite foreign key (habit_id, user_id) →
--       habits (id, user_id), so a completion can only ever point at a habit
--       owned by the same user (RLS alone cannot stop a user from pointing a
--       completion at someone else's habit id).
-- ============================================================


-- ---------- profiles: 1:1 with auth.users (created by the signup trigger) ----------
create table public.profiles (
  id              uuid primary key references auth.users (id) on delete cascade,
  name            text        not null default '',
  email           text,
  avatar          text        not null default '',
  -- xp_total / streak_*: NOT used by the app (XP and streaks are always derived
  -- from the ledger tables). Kept because the dormant ai-chat Edge Function
  -- selects them; they always stay 0.
  xp_total        integer     not null default 0,
  streak_current  integer     not null default 0,
  streak_longest  integer     not null default 0,
  settings        jsonb       not null default '{"notifications": true, "theme": "dark", "reduceMotion": false}'::jsonb,
  is_onboarded    boolean     not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ---------- user_profiles: onboarding answers + goals (see js/goals.js) ----------
create table public.user_profiles (
  user_id           uuid primary key references public.profiles (id) on delete cascade,
  occupation        text        not null default '',
  occupation_custom text        not null default '',
  life_description  text        not null default '',
  skills            text[]      not null default '{}',
  hobbies           text[]      not null default '{}',
  -- goals: one entry per goal, "rbg1:" + compact JSON (older plain-text entries are also read)
  goals             text[]      not null default '{}',
  challenges        text        not null default '',
  updated_at        timestamptz not null default now()
);

-- ---------- ai_profiles: learned AI context (dormant while AI is "Coming Soon") ----------
create table public.ai_profiles (
  user_id                   uuid primary key references public.profiles (id) on delete cascade,
  user_type                 text,
  communication_style       text,
  motivation_style          text,
  preferred_response_length text        not null default 'medium',
  productivity_style        text,
  discipline_level          text,
  planning_preference       text,
  common_patterns           jsonb       not null default '[]'::jsonb,
  known_challenges          jsonb       not null default '[]'::jsonb,
  updated_at                timestamptz not null default now()
);

-- ---------- habits ----------
create table public.habits (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid        not null references public.profiles (id) on delete cascade,
  title           text        not null,
  description     text        not null default '',
  icon            text        not null default 'flame',
  xp              integer     not null default 20 check (xp > 0),
  frequency       text        not null default 'daily' check (frequency in ('daily', 'weekly', 'custom')),
  target_days     integer[]   not null default '{}',
  time            text,
  -- current_streak / longest_streak: not used by the app (derived client-side); kept for ai-chat.
  current_streak  integer     not null default 0,
  longest_streak  integer     not null default 0,
  created_at      timestamptz not null default now(),
  unique (id, user_id)        -- target of the composite FK below
);
create index habits_user_id_idx on public.habits (user_id);

-- ---------- habit_completions: one row per day a habit was completed (the XP ledger for habits) ----------
create table public.habit_completions (
  id           uuid primary key default gen_random_uuid(),
  habit_id     uuid        not null,
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  completed_on date        not null,
  created_at   timestamptz not null default now(),
  xp_awarded   integer     not null default 0 check (xp_awarded >= 0),
  unique (habit_id, completed_on),                       -- blocks double completion / XP farming
  foreign key (habit_id, user_id) references public.habits (id, user_id) on delete cascade
);
create index habit_completions_user_date_idx on public.habit_completions (user_id, completed_on);

-- ---------- tasks ----------
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null references public.profiles (id) on delete cascade,
  title        text        not null,
  description  text        not null default '',
  priority     text        not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  date         date,
  time         text,
  xp           integer     not null default 25 check (xp > 0),
  completed    boolean     not null default false,
  completed_at date,
  created_at   timestamptz not null default now(),
  xp_awarded   integer     not null default 0 check (xp_awarded >= 0)
);
create index tasks_user_date_idx      on public.tasks (user_id, date);
create index tasks_user_completed_idx on public.tasks (user_id, completed);

-- ---------- schedule_items: the Planner ("يومي") ----------
create table public.schedule_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  title       text        not null,
  type        text        not null default 'event' check (type in ('task', 'habit', 'event', 'break')),
  date        date        not null,
  start_time  text        not null,
  end_time    text,
  notes       text        not null default '',
  completed   boolean     not null default false,
  created_at  timestamptz not null default now()
);
create index schedule_items_user_date_idx on public.schedule_items (user_id, date);

-- ---------- daily_history: per-day rollup that drives streaks + analytics ----------
create table public.daily_history (
  user_id              uuid    not null references public.profiles (id) on delete cascade,
  date                 date    not null,
  habits_completed     integer not null default 0,
  total_habits         integer not null default 0,
  tasks_completed      integer not null default 0,
  xp_earned            integer not null default 0,
  all_habits_completed boolean not null default false,
  primary key (user_id, date)
);

-- ---------- unlocked_achievements: definitions live in the client; this stores unlock state + XP ----------
create table public.unlocked_achievements (
  user_id        uuid    not null references public.profiles (id) on delete cascade,
  achievement_id text    not null,
  unlocked_at    date    not null default current_date,
  xp_awarded     integer not null default 0 check (xp_awarded >= 0),
  primary key (user_id, achievement_id)
);

-- ---------- ai_conversations: chat log (read by the app; written by the ai-chat Edge Function when AI is live) ----------
create table public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles (id) on delete cascade,
  role        text        not null check (role in ('user', 'assistant')),
  content     text        not null,
  created_at  timestamptz not null default now()
);
create index ai_conversations_user_created_idx on public.ai_conversations (user_id, created_at);

-- ---------- XP: always derived from the ledger, never a stored counter ----------
create view public.user_xp_totals
with (security_invoker = true) as
select
  p.id as user_id,
  coalesce(hc.total, 0) + coalesce(t.total, 0) + coalesce(a.total, 0) as total_xp
from public.profiles p
left join (select user_id, sum(xp_awarded) as total from public.habit_completions group by user_id) hc on hc.user_id = p.id
left join (select user_id, sum(xp_awarded) as total from public.tasks where completed = true group by user_id) t on t.user_id = p.id
left join (select user_id, sum(xp_awarded) as total from public.unlocked_achievements group by user_id) a on a.user_id = p.id;


-- >>>>>>>>>> 02_functions_triggers.sql
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


-- >>>>>>>>>> 03_rls_and_grants.sql
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

