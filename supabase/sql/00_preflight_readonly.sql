-- ============================================================
-- REBUILT 0.4 — 00_preflight_readonly.sql
-- READ-ONLY. Changes nothing. Run it FIRST in the new project's
-- SQL Editor and compare with "Expected on a brand-new project".
--
-- Nothing in this repository assumes that tables or users already
-- exist in the new project; this script shows what is really there.
-- ============================================================

select 'public tables' as item,
       coalesce(string_agg(tablename, ', ' order by tablename), '(none)') as found
from pg_tables where schemaname = 'public'
union all
select 'public views',
       coalesce(string_agg(viewname, ', ' order by viewname), '(none)')
from pg_views where schemaname = 'public'
union all
select 'public functions (non-extension)',
       coalesce(string_agg(p.proname, ', ' order by p.proname), '(none)')
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
union all
select 'rows in auth.users', count(*)::text from auth.users
union all
select 'user triggers on auth.users',
       coalesce(string_agg(tgname, ', ' order by tgname), '(none)')
from pg_trigger
where tgrelid = 'auth.users'::regclass and not tgisinternal
union all
select 'postgres version', version();

-- Expected on a brand-new project:
--   public tables ............ (none)
--   public views ............. (none)
--   public functions ......... (none)
--   rows in auth.users ....... 0   (if > 0, run 07_optional_backfill_existing_users.sql AFTER 02)
--   user triggers on auth.users (none)
--
-- If anything other than "(none)" shows up in the first three rows, or in the "user triggers" row, STOP and
-- send me the output: 01_schema.sql uses plain CREATE TABLE on purpose, so it
-- fails loudly instead of silently skipping something that already exists.
