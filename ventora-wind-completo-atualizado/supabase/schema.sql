-- Ventora base schema (DEMO / starting point)
-- Review with legal/security/compliance teams before real-money use.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key,
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.wind_projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  city text not null,
  region text not null,
  capacity_mw numeric not null check (capacity_mw >= 0),
  unit_value numeric not null check (unit_value >= 0),
  status text not null default 'draft' check (status in ('draft','available','paused','finished')),
  created_at timestamptz not null default now()
);

create table if not exists public.holdings_demo (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid references public.wind_projects(id),
  units integer not null check (units > 0),
  amount numeric not null check (amount >= 0),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.wind_projects enable row level security;
alter table public.holdings_demo enable row level security;

-- Add explicit RLS policies only after connecting auth and defining your access model.
