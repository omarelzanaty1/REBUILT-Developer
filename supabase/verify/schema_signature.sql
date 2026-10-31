with sig as (
 select 'columns' k, format('%s.%s:%s:%s:%s:%s', table_name, column_name, data_type, is_nullable, coalesce(column_default,''), coalesce(character_maximum_length::text,'')) v from information_schema.columns where table_schema='public'
 union all select 'constraints', conrelid::regclass::text||'.'||conname||':'||pg_get_constraintdef(oid) from pg_constraint where connamespace='public'::regnamespace
 union all select 'indexes', indexdef from pg_indexes where schemaname='public'
 union all select 'policies', format('%s.%s:%s:%s:%s:%s', tablename, policyname, cmd, permissive, roles::text, coalesce(qual,'')||'|'||coalesce(with_check,'')) from pg_policies where schemaname='public'
 union all select 'rls', c.relname||':'||c.relrowsecurity::text||':'||c.relforcerowsecurity::text from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r'
 union all select 'functions', p.proname||':'||md5(pg_get_functiondef(p.oid)) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname<>'rls_auto_enable'
 union all select 'views', viewname||':'||md5(definition) from pg_views where schemaname='public'
 union all select 'triggers', event_object_schema||'.'||event_object_table||'.'||trigger_name||':'||action_timing||':'||event_manipulation||':'||md5(action_statement) from information_schema.triggers where trigger_schema in ('public','auth')
 union all select 'table_grants', c.relname||':'||r||':'||p||':'||has_table_privilege(r,c.oid,p)::text from pg_class c, unnest(array['anon','authenticated','service_role']) r, unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p where c.relnamespace='public'::regnamespace and c.relkind in ('r','v')
 union all select 'fn_grants', p.proname||':'||r||':'||has_function_privilege(r,p.oid,'execute')::text from pg_proc p, unnest(array['anon','authenticated']) r where p.pronamespace='public'::regnamespace
 union all select 'view_options', c.relname||':'||coalesce(array_to_string(c.reloptions,','),'') from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v'
)
select k, count(*) n, md5(string_agg(v, E'\n' order by v)) h from sig group by k order by k;
