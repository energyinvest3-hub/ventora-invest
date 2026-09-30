-- VENTORA — PERFIL + CONVITES/EQUIPE + ADMIN SEGURO
-- Execute APÓS schema.sql e security-hardening.sql.
-- Pode ser executado mais de uma vez.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Perfil compatível com a experiência da EnergyInvest.
alter table public.profiles add column if not exists role text not null default 'USER';
alter table public.profiles add column if not exists invite_code text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='profiles_role_chk') then
    alter table public.profiles add constraint profiles_role_chk check (role in ('USER','ADMIN'));
  end if;
end $$;

update public.profiles
set invite_code = 'VW' || upper(substr(replace(id::text,'-',''),1,10))
where invite_code is null or invite_code='';

create unique index if not exists profiles_invite_code_uq on public.profiles(invite_code);

create table if not exists public.referral_program_settings (
  id smallint primary key default 1 check (id=1),
  active boolean not null default true,
  reward_amount numeric(14,2) not null default 20 check (reward_amount >= 0),
  min_purchase_amount numeric(14,2) not null default 50 check (min_purchase_amount >= 0),
  updated_at timestamptz not null default now()
);
insert into public.referral_program_settings(id,active,reward_amount,min_purchase_amount)
values(1,true,20,50) on conflict(id) do nothing;

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referred_id uuid not null unique references public.profiles(id) on delete cascade,
  qualified boolean not null default false,
  reward_amount numeric(14,2) not null default 0 check (reward_amount >= 0),
  qualified_at timestamptz,
  created_at timestamptz not null default now(),
  check (referrer_id <> referred_id)
);
create index if not exists referrals_referrer_created_idx on public.referrals(referrer_id,created_at desc);

alter table public.referral_program_settings enable row level security;
alter table public.referrals enable row level security;
alter table public.referral_program_settings force row level security;
alter table public.referrals force row level security;

-- Não expõe as tabelas de indicação diretamente ao navegador.
revoke all on public.referral_program_settings, public.referrals from public, anon, authenticated;
grant all on public.referral_program_settings, public.referrals to service_role;

-- Tabela privada de administradores: autorização é por UUID, não por texto no frontend.
create table if not exists private.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  created_at timestamptz not null default now()
);
revoke all on private.admin_users from public, anon, authenticated;

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  actor_email text not null default '',
  action text not null,
  target_id text not null default '',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_logs enable row level security;
alter table public.admin_audit_logs force row level security;
revoke all on public.admin_audit_logs from public,anon,authenticated;
grant all on public.admin_audit_logs to service_role;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select exists(select 1 from private.admin_users a where a.user_id = auth.uid());
$$;
revoke all on function private.is_admin() from public,anon,authenticated;

-- Cadastro: cria carteira/perfil, código de convite e vínculo de equipe.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text;
  v_referrer uuid;
begin
  v_code := 'VW' || upper(substr(replace(new.id::text,'-',''),1,10));

  insert into public.profiles(id,name,email,phone,role,invite_code)
  values(
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'name'),''),'Investidor'),120),
    left(coalesce(new.email,''),320),
    left(coalesce(new.raw_user_meta_data->>'phone',''),32),
    'USER',
    v_code
  )
  on conflict(id) do update set
    email=excluded.email,
    name=case when public.profiles.name='Investidor' then excluded.name else public.profiles.name end,
    phone=case when public.profiles.phone='' then excluded.phone else public.profiles.phone end,
    invite_code=coalesce(nullif(public.profiles.invite_code,''),excluded.invite_code);

  insert into public.wallets(user_id) values(new.id) on conflict(user_id) do nothing;

  if coalesce(trim(new.raw_user_meta_data->>'inviteCode'),'') <> '' then
    select id into v_referrer
    from public.profiles
    where invite_code = upper(trim(new.raw_user_meta_data->>'inviteCode'))
      and id <> new.id
    limit 1;

    if v_referrer is not null then
      insert into public.referrals(referrer_id,referred_id)
      values(v_referrer,new.id)
      on conflict(referred_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public,anon,authenticated;
grant execute on function public.handle_new_user() to service_role;

-- Resumo seguro da própria equipe. Não dá acesso direto às tabelas internas.
create or replace function public.get_my_referral_summary()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user uuid := auth.uid();
  v_code text := '';
  v_active boolean := true;
  v_reward numeric := 0;
  v_min numeric := 0;
  v_invited integer := 0;
  v_qualified integer := 0;
  v_total numeric := 0;
  v_members jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  select coalesce(invite_code,'') into v_code from public.profiles where id=v_user;
  select active,reward_amount,min_purchase_amount into v_active,v_reward,v_min from public.referral_program_settings where id=1;
  select count(*)::integer,
         count(*) filter(where r.qualified)::integer,
         coalesce(sum(r.reward_amount),0)
    into v_invited,v_qualified,v_total
  from public.referrals r where r.referrer_id=v_user;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',r.id,
      'name',coalesce(nullif(p.name,''),'Membro Ventora'),
      'joinedAt',r.created_at,
      'qualified',r.qualified,
      'rewardAmount',r.reward_amount
    ) order by r.created_at desc),'[]'::jsonb)
  into v_members
  from public.referrals r
  join public.profiles p on p.id=r.referred_id
  where r.referrer_id=v_user;

  return jsonb_build_object(
    'active',coalesce(v_active,true),
    'inviteCode',v_code,
    'rewardAmount',coalesce(v_reward,0),
    'minPurchaseAmount',coalesce(v_min,0),
    'invitedCount',v_invited,
    'qualifiedCount',v_qualified,
    'totalBonus',v_total,
    'referrals',v_members
  );
end;
$$;
revoke all on function public.get_my_referral_summary() from public,anon,authenticated;
grant execute on function public.get_my_referral_summary() to authenticated,service_role;

-- Compra atômica + recompensa de indicação calculada somente no banco.
create or replace function public.purchase_wind_project(p_project_slug text,p_units integer)
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
  v_referral public.referrals%rowtype;
  v_setting public.referral_program_settings%rowtype;
  v_bonus numeric(14,2) := 0;
begin
  if v_user is null then raise exception 'Faça login para continuar.'; end if;
  if p_project_slug is null or p_project_slug !~ '^[a-z0-9-]{3,64}$' then raise exception 'Projeto não encontrado.'; end if;
  if p_units is null or p_units < 1 or p_units > 100 then raise exception 'Quantidade inválida.'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_project_slug,0));
  select * into v_project from public.wind_projects where slug=p_project_slug for update;
  if not found then raise exception 'Projeto não encontrado.'; end if;
  if v_project.status not in ('available','closing') then raise exception 'Projeto indisponível.'; end if;
  if v_project.available_units < p_units then raise exception 'Quantidade indisponível.'; end if;

  select coalesce(sum(quantity),0)::integer into v_existing from public.user_projects
  where user_id=v_user and project_slug=p_project_slug and status='active';
  if v_existing+p_units > v_project.max_units_per_user then raise exception 'Limite por usuário excedido.'; end if;

  v_cost := v_project.unit_value*p_units;
  update public.wallets set balance=balance-v_cost,updated_at=now()
  where user_id=v_user and balance>=v_cost;
  if not found then raise exception 'Saldo insuficiente.'; end if;

  update public.wind_projects set available_units=available_units-p_units,updated_at=now() where slug=p_project_slug;
  insert into public.user_projects(user_id,project_slug,quantity,amount_invested,ends_at)
  values(v_user,p_project_slug,p_units,v_cost,now()+make_interval(days=>v_project.duration_days)) returning id into v_holding;
  insert into public.transactions(user_id,type,amount,description,status)
  values(v_user,'purchase',v_cost,'Participação em '||v_project.name,'completed');

  select * into v_referral from public.referrals where referred_id=v_user and qualified=false for update;
  select * into v_setting from public.referral_program_settings where id=1;
  if found and v_referral.id is not null and v_setting.active and v_cost>=v_setting.min_purchase_amount then
    v_bonus := v_setting.reward_amount;
    update public.referrals set qualified=true,reward_amount=v_bonus,qualified_at=now() where id=v_referral.id;
    update public.wallets set balance=balance+v_bonus,total_earned=total_earned+v_bonus,updated_at=now() where user_id=v_referral.referrer_id;
    insert into public.transactions(user_id,type,amount,description,status)
    values(v_referral.referrer_id,'bonus',v_bonus,'Bônus de convite Ventora','completed');
    insert into public.notifications(user_id,title,message)
    values(v_referral.referrer_id,'Convite qualificado','Uma indicação cumpriu os critérios e o bônus foi registrado na sua carteira.');
  end if;

  return jsonb_build_object('ok',true,'holding_id',v_holding,'amount',v_cost,'referral_bonus',v_bonus);
end;
$$;
revoke all on function public.purchase_wind_project(text,integer) from public,anon,authenticated;
grant execute on function public.purchase_wind_project(text,integer) to authenticated,service_role;

-- Snapshot administrativo: só o UUID cadastrado em private.admin_users recebe dados.
create or replace function public.admin_dashboard_snapshot()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_result jsonb;
begin
  if not private.is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  select jsonb_build_object(
    'profiles',(select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc),'[]'::jsonb) from public.profiles p),
    'wallets',(select coalesce(jsonb_agg(to_jsonb(w) order by w.updated_at desc),'[]'::jsonb) from public.wallets w),
    'wind_projects',(select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc),'[]'::jsonb) from public.wind_projects p),
    'user_projects',(select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc),'[]'::jsonb) from public.user_projects h),
    'transactions',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]'::jsonb) from public.transactions t),
    'referrals',(select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (
       select r.*,p.name as referred_name from public.referrals r join public.profiles p on p.id=r.referred_id
    ) x),
    'referral_program_settings',(select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from public.referral_program_settings s),
    'admin_audit_logs',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]'::jsonb) from public.admin_audit_logs a)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_dashboard_snapshot() from public,anon,authenticated;
grant execute on function public.admin_dashboard_snapshot() to authenticated,service_role;

commit;
