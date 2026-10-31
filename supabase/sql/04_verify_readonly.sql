-- ============================================================
-- REBUILT 0.4 — 04_verify_readonly.sql
-- READ-ONLY. Run after 01 + 02 + 03. Every row should say OK.
-- ============================================================

with
tbl(name, policies_expected, can_delete) as (values
  ('profiles',              2, false),
  ('user_profiles',         2, false),
  ('ai_profiles',           2, false),
  ('habits',                1, true),
  ('habit_completions',     1, true),
  ('tasks',                 1, true),
  ('schedule_items',        1, true),
  ('daily_history',         1, true),
  ('unlocked_achievements', 1, true),
  ('ai_conversations',      1, true)
),
checks as (
  -- 1. table exists
  select 10 as ord, 'table exists: ' || name as item,
         to_regclass('public.' || name) is not null as ok,
         '' as detail
  from tbl
  union all
  -- 2. RLS enabled
  select 20, 'RLS enabled: ' || name,
         coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.' || name)), false),
         ''
  from tbl
  union all
  -- 3. policy count
  select 30, 'policies on ' || name || ' (expected ' || policies_expected || ')',
         (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = tbl.name) = policies_expected,
         (select count(*)::text from pg_policies p where p.schemaname = 'public' and p.tablename = tbl.name) || ' found'
  from tbl
  union all
  -- 4. anon has no access at all
  select 40, 'anon has NO privileges on ' || name,
         not has_table_privilege('anon', 'public.' || name, 'select,insert,update,delete'),
         ''
  from tbl
  union all
  -- 5. authenticated can read; delete only where intended
  select 50, 'authenticated can SELECT ' || name,
         has_table_privilege('authenticated', 'public.' || name, 'select'), ''
  from tbl
  union all
  select 55, 'authenticated DELETE on ' || name || ' is ' || case when can_delete then 'allowed' else 'blocked' end,
         has_table_privilege('authenticated', 'public.' || name, 'delete') = can_delete, ''
  from tbl
  union all
  -- 6. XP view
  select 60, 'view user_xp_totals exists with security_invoker',
         exists (select 1 from pg_class c where c.oid = to_regclass('public.user_xp_totals')
                 and c.relkind = 'v' and 'security_invoker=true' = any (c.reloptions)),
         ''
  union all
  select 61, 'anon cannot read user_xp_totals',
         not has_table_privilege('anon', 'public.user_xp_totals', 'select'), ''
  union all
  -- 7. triggers
  select 70, 'trigger on_auth_user_created on auth.users',
         exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created' and not tgisinternal),
         ''
  union all
  select 71, 'updated_at triggers (3 expected)',
         (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and t.tgname like 'set\_%\_updated\_at' and not t.tgisinternal) = 3,
         ''
  union all
  -- 8. function hardening
  select 80, 'handle_new_user is SECURITY DEFINER with a pinned search_path',
         coalesce((select p.prosecdef and p.proconfig is not null and exists (select 1 from unnest(p.proconfig) s where s like 'search_path=%')
                   from pg_proc p where p.oid = to_regprocedure('public.handle_new_user()')), false),
         ''
  union all
  select 81, 'handle_new_user cannot be called by anon / authenticated',
         coalesce(not has_function_privilege('anon', to_regprocedure('public.handle_new_user()'), 'execute')
                  and not has_function_privilege('authenticated', to_regprocedure('public.handle_new_user()'), 'execute'), false),
         ''
  union all
  select 82, 'set_updated_at cannot be called by anon / authenticated',
         coalesce(not has_function_privilege('anon', to_regprocedure('public.set_updated_at()'), 'execute')
                  and not has_function_privilege('authenticated', to_regprocedure('public.set_updated_at()'), 'execute'), false),
         ''
  union all
  -- 9. the composite FK that ties a completion to a habit of the SAME user
  select 90, 'habit_completions → habits composite FK (habit_id, user_id)',
         exists (select 1 from pg_constraint where conrelid = 'public.habit_completions'::regclass and contype = 'f'
                 and array_length(conkey, 1) = 2 and confrelid = 'public.habits'::regclass),
         ''
  union all
  -- 10. one completion per habit per day
  select 91, 'unique (habit_id, completed_on) on habit_completions',
         exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'habit_completions'
                 and indexdef ilike '%unique%' and indexdef ilike '%(habit_id, completed_on)%'),
         ''
)
select item,
       case when ok then 'OK' else 'FAIL' end as status,
       detail
from checks
order by ord, item;
