-- Second migration recorded on the production project (20261022214525 revoke_rls_auto_enable_execute).
-- Supabase creates public.rls_auto_enable() itself (an event-trigger helper that switches Row Level Security on
-- for every new table). It must not be callable through the Data API, so EXECUTE is taken away from the API roles.
-- Guarded: a project without that platform function (e.g. a plain local Postgres) simply skips it.
-- NOTE: the exact text applied to production is not stored anywhere in Git; this file reproduces its effect
-- (verified: production shows anon/authenticated without EXECUTE on this function).
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
