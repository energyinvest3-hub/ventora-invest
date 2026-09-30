-- Ventora production base schema
-- Apply to a dedicated Supabase project for Ventora.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Investidor',
  email text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric(14,2) not null default 0 check (balance >= 0),
  total_deposited numeric(14,2) not null default 0 check (total_deposited >= 0),
  total_withdrawn numeric(14,2) not null default 0 check (total_withdrawn >= 0),
  total_earned numeric(14,2) not null default 0 check (total_earned >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.wind_projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null default '',
  city text not null,
  region text not null,
  image text not null default '',
  capacity_mw numeric(10,2) not null default 0 check (capacity_mw >= 0),
  unit_value numeric(14,2) not null check (unit_value > 0),
  duration_days integer not null check (duration_days > 0),
  projected_scenario numeric(14,2) not null default 0 check (projected_scenario >= 0),
  available_units integer not null default 0 check (available_units >= 0),
  max_units_per_user integer not null default 100 check (max_units_per_user > 0),
  featured boolean not null default false,
  status text not null default 'available' check (status in ('available','closing','paused','finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_slug text not null references public.wind_projects(slug),
  quantity integer not null check (quantity > 0),
  amount_invested numeric(14,2) not null check (amount_invested >= 0),
  total_received numeric(14,2) not null default 0 check (total_received >= 0),
  started_at timestamptz not null default now(),
  ends_at timestamptz,
  status text not null default 'active' check (status in ('active','finished','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('deposit','purchase','credit','withdrawal','refund','bonus')),
  amount numeric(14,2) not null check (amount >= 0),
  description text not null default '',
  status text not null default 'completed' check (status in ('pending','completed','failed','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id,name,email,phone)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name',''),'Investidor'),
    coalesce(new.email,''),
    coalesce(new.raw_user_meta_data->>'phone','')
  ) on conflict (id) do nothing;
  insert into public.wallets (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.purchase_wind_project(p_project_slug text, p_units integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_project public.wind_projects%rowtype;
  v_cost numeric(14,2);
  v_existing integer;
  v_holding uuid;
begin
  if v_user is null then raise exception 'Faça login para continuar.'; end if;
  if p_units is null or p_units < 1 then raise exception 'Quantidade inválida.'; end if;

  select * into v_project from public.wind_projects where slug=p_project_slug for update;
  if not found then raise exception 'Projeto não encontrado.'; end if;
  if v_project.status not in ('available','closing') then raise exception 'Projeto indisponível.'; end if;
  if v_project.available_units < p_units then raise exception 'Quantidade indisponível.'; end if;

  select coalesce(sum(quantity),0) into v_existing from public.user_projects
  where user_id=v_user and project_slug=p_project_slug and status='active';
  if v_existing + p_units > v_project.max_units_per_user then raise exception 'Limite por usuário excedido.'; end if;

  v_cost := v_project.unit_value * p_units;
  update public.wallets set balance=balance-v_cost, updated_at=now()
  where user_id=v_user and balance >= v_cost;
  if not found then raise exception 'Saldo insuficiente.'; end if;

  update public.wind_projects set available_units=available_units-p_units, updated_at=now() where slug=p_project_slug;
  insert into public.user_projects(user_id,project_slug,quantity,amount_invested,ends_at)
  values(v_user,p_project_slug,p_units,v_cost,now()+(v_project.duration_days||' days')::interval)
  returning id into v_holding;
  insert into public.transactions(user_id,type,amount,description,status)
  values(v_user,'purchase',v_cost,'Participação em '||v_project.name,'completed');

  return jsonb_build_object('ok',true,'holding_id',v_holding,'amount',v_cost);
end;
$$;

revoke all on function public.purchase_wind_project(text,integer) from public;
grant execute on function public.purchase_wind_project(text,integer) to authenticated;

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.wind_projects enable row level security;
alter table public.user_projects enable row level security;
alter table public.transactions enable row level security;
alter table public.notifications enable row level security;

create policy "profiles_select_own" on public.profiles for select to authenticated using (id=auth.uid());
create policy "profiles_update_own" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy "wallets_select_own" on public.wallets for select to authenticated using (user_id=auth.uid());
create policy "projects_read_authenticated" on public.wind_projects for select to authenticated using (true);
create policy "holdings_select_own" on public.user_projects for select to authenticated using (user_id=auth.uid());
create policy "transactions_select_own" on public.transactions for select to authenticated using (user_id=auth.uid());
create policy "notifications_select_own" on public.notifications for select to authenticated using (user_id=auth.uid());
create policy "notifications_update_own" on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

insert into public.wind_projects(slug,name,description,city,region,image,capacity_mw,unit_value,duration_days,projected_scenario,available_units,max_units_per_user,featured,status)
values
('ventos-sertao','Ventos do Sertão','Projeto eólico no Nordeste brasileiro.','Mossoró','RN','/wind-vales.png',18,50,15,78,420,100,true,'available'),
('atlas-litoral','Atlas Litoral','Complexo eólico em região litorânea.','Aracati','CE','/wind-litoral.png',32,120,20,174,260,100,true,'available'),
('serra-azul','Serra Azul Wind','Projeto em região serrana com forte potencial eólico.','Caetité','BA','/wind-serra.png',44,250,20,352,176,100,true,'available'),
('pampa-wind','Pampa Wind','Projeto eólico na região Sul.','Santana do Livramento','RS','/wind-campos.png',61,490,25,676,92,100,false,'closing'),
('nordeste-prime','Nordeste Prime','Parque eólico de maior capacidade no Nordeste.','Parnaíba','PI','/wind-hero.png',86,890,30,1190,64,100,false,'available'),
('offshore-one','Offshore One','Projeto eólico marítimo ilustrativo.','Costa Brasileira','BR','/wind-offshore.png',120,1490,35,1950,38,100,false,'closing')
on conflict (slug) do update set
name=excluded.name,description=excluded.description,city=excluded.city,region=excluded.region,image=excluded.image,
capacity_mw=excluded.capacity_mw,unit_value=excluded.unit_value,duration_days=excluded.duration_days,
projected_scenario=excluded.projected_scenario,available_units=excluded.available_units,max_units_per_user=excluded.max_units_per_user,
featured=excluded.featured,status=excluded.status,updated_at=now();
