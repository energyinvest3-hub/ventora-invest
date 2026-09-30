-- VENTORA — SECURITY VERIFICATION (read-only)
-- Run after security-hardening.sql. All rows in the first result should be PASS.

with checks as (
  select 'anon cannot SELECT profiles' as check_name,
         not has_table_privilege('anon','public.profiles','SELECT') as ok
  union all select 'anon cannot SELECT wallets',
         not has_table_privilege('anon','public.wallets','SELECT')
  union all select 'anon cannot SELECT projects',
         not has_table_privilege('anon','public.wind_projects','SELECT')
  union all select 'anon cannot SELECT holdings',
         not has_table_privilege('anon','public.user_projects','SELECT')
  union all select 'anon cannot SELECT transactions',
         not has_table_privilege('anon','public.transactions','SELECT')
  union all select 'anon cannot SELECT notifications',
         not has_table_privilege('anon','public.notifications','SELECT')
  union all select 'authenticated cannot UPDATE wallets',
         not has_table_privilege('authenticated','public.wallets','UPDATE')
  union all select 'authenticated cannot INSERT transactions',
         not has_table_privilege('authenticated','public.transactions','INSERT')
  union all select 'authenticated cannot DELETE holdings',
         not has_table_privilege('authenticated','public.user_projects','DELETE')
  union all select 'anon cannot execute purchase function',
         not has_function_privilege('anon','public.purchase_wind_project(text,integer)','EXECUTE')
  union all select 'authenticated can execute purchase function',
         has_function_privilege('authenticated','public.purchase_wind_project(text,integer)','EXECUTE')
)
select check_name, case when ok then 'PASS' else 'FAIL' end as result
from checks
order by check_name;

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname='public'
  and c.relname in ('profiles','wallets','wind_projects','user_projects','transactions','notifications')
order by c.relname;

select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and grantee in ('anon','authenticated')
order by grantee, table_name, privilege_type;
