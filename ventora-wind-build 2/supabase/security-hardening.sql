-- VENTORA — SECURITY HARDENING
-- Run AFTER supabase/schema.sql.
-- Safe to run more than once.

begin;

-- 1) Keep client roles from creating objects in the exposed schema.
revoke create on schema public from public, anon, authenticated;
revoke usage on schema public from anon;
grant usage on schema public to authenticated, service_role;

-- 2) Future objects are DENY-BY-DEFAULT for Data API roles.
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

-- 3) Strip all existing client grants, then explicitly grant the minimum required.
revoke all on table public.profiles from anon, authenticated;
revoke all on table public.wallets from anon, authenticated;
revoke all on table public.wind_projects from anon, authenticated;
revoke all on table public.user_projects from anon, authenticated;
revoke all on table public.transactions from anon, authenticated;
revoke all on table public.notifications from anon, authenticated;

-- Signed-in users may read only what RLS allows.
grant select on table public.profiles to authenticated;
grant update (name, phone) on table public.profiles to authenticated;
grant select on table public.wallets to authenticated;
grant select on table public.wind_projects to authenticated;
grant select on table public.user_projects to authenticated;
grant select on table public.transactions to authenticated;
grant select on table public.notifications to authenticated;
grant update (read) on table public.notifications to authenticated;

-- Secret/service role remains server-only and has explicit access.
grant all on table public.profiles, public.wallets, public.wind_projects,
  public.user_projects, public.transactions, public.notifications to service_role;

-- 4) Enforce RLS even if future code accidentally broadens grants.
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wind_projects enable row level security;
alter table public.user_projects enable row level security;
alter table public.transactions enable row level security;
alter table public.notifications enable row level security;

alter table public.profiles force row level security;
alter table public.wallets force row level security;
alter table public.wind_projects force row level security;
alter table public.user_projects force row level security;
alter table public.transactions force row level security;
alter table public.notifications force row level security;

-- Recreate policies so this migration is idempotent.
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists wallets_select_own on public.wallets;
drop policy if exists projects_read_authenticated on public.wind_projects;
drop policy if exists holdings_select_own on public.user_projects;
drop policy if exists transactions_select_own on public.transactions;
drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;

create policy profiles_select_own
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy wallets_select_own
  on public.wallets for select to authenticated
  using ((select auth.uid()) = user_id);

create policy projects_read_authenticated
  on public.wind_projects for select to authenticated
  using (true);

create policy holdings_select_own
  on public.user_projects for select to authenticated
  using ((select auth.uid()) = user_id);

create policy transactions_select_own
  on public.transactions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy notifications_select_own
  on public.notifications for select to authenticated
  using ((select auth.uid()) = user_id);

create policy notifications_update_own
  on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 5) Tighten user-controlled field sizes.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_name_length_chk') then
    alter table public.profiles add constraint profiles_name_length_chk check (char_length(name) between 1 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_email_length_chk') then
    alter table public.profiles add constraint profiles_email_length_chk check (char_length(email) <= 320);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_phone_length_chk') then
    alter table public.profiles add constraint profiles_phone_length_chk check (char_length(phone) <= 32);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wind_projects_slug_length_chk') then
    alter table public.wind_projects add constraint wind_projects_slug_length_chk check (char_length(slug) between 3 and 64);
  end if;
end $$;

-- 6) Harden trigger function. No Data API role can execute it directly.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, name, email, phone)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), 'Investidor'), 120),
    left(coalesce(new.email, ''), 320),
    left(coalesce(new.raw_user_meta_data->>'phone', ''), 32)
  )
  on conflict (id) do nothing;

  insert into public.wallets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

-- 7) Atomic purchase function: ignores client-supplied money values, locks rows,
-- serializes same-user/project purchases, and never allows negative balances.
create or replace function public.purchase_wind_project(p_project_slug text, p_units integer)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_project public.wind_projects%rowtype;
  v_cost numeric(14,2);
  v_existing integer;
  v_holding uuid;
begin
  if v_user is null then
    raise exception 'Faça login para continuar.';
  end if;
  if p_project_slug is null or p_project_slug !~ '^[a-z0-9-]{3,64}$' then
    raise exception 'Projeto não encontrado.';
  end if;
  if p_units is null or p_units < 1 or p_units > 100 then
    raise exception 'Quantidade inválida.';
  end if;

  -- Prevent concurrent requests for the same user/project from bypassing max_units.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_project_slug, 0));

  select * into v_project
  from public.wind_projects
  where slug = p_project_slug
  for update;

  if not found then raise exception 'Projeto não encontrado.'; end if;
  if v_project.status not in ('available', 'closing') then raise exception 'Projeto indisponível.'; end if;
  if v_project.available_units < p_units then raise exception 'Quantidade indisponível.'; end if;

  select coalesce(sum(quantity), 0)::integer into v_existing
  from public.user_projects
  where user_id = v_user
    and project_slug = p_project_slug
    and status = 'active';

  if v_existing + p_units > v_project.max_units_per_user then
    raise exception 'Limite por usuário excedido.';
  end if;

  -- Price is ALWAYS read from the database, never trusted from the browser.
  v_cost := v_project.unit_value * p_units;

  update public.wallets
  set balance = balance - v_cost,
      updated_at = now()
  where user_id = v_user
    and balance >= v_cost;

  if not found then raise exception 'Saldo insuficiente.'; end if;

  update public.wind_projects
  set available_units = available_units - p_units,
      updated_at = now()
  where slug = p_project_slug;

  insert into public.user_projects (
    user_id, project_slug, quantity, amount_invested, ends_at
  ) values (
    v_user,
    p_project_slug,
    p_units,
    v_cost,
    now() + make_interval(days => v_project.duration_days)
  ) returning id into v_holding;

  insert into public.transactions (user_id, type, amount, description, status)
  values (v_user, 'purchase', v_cost, 'Participação em ' || v_project.name, 'completed');

  return jsonb_build_object('ok', true, 'holding_id', v_holding, 'amount', v_cost);
end;
$$;

revoke all on function public.purchase_wind_project(text, integer) from public, anon, authenticated;
grant execute on function public.purchase_wind_project(text, integer) to authenticated, service_role;

-- 8) Indexes avoid unnecessarily expensive user-scoped queries.
create index if not exists user_projects_user_created_idx
  on public.user_projects (user_id, created_at desc);
create index if not exists user_projects_user_project_status_idx
  on public.user_projects (user_id, project_slug, status);
create index if not exists transactions_user_created_idx
  on public.transactions (user_id, created_at desc);
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

commit;

-- SECURITY CHECK: expected output should contain ONLY intentional authenticated grants.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by grantee, table_name, privilege_type;
