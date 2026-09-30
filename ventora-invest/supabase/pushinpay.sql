-- VENTORA + PUSHINPAY PIX CASH-IN
-- Execute AFTER schema.sql, security-hardening.sql and energy-parity-admin-referrals.sql.
-- Safe to run more than once.

begin;

alter table public.transactions add column if not exists reference_id uuid;

create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','completed','cancelled')),
  provider text not null default 'pushinpay',
  gateway_id text,
  provider_status text,
  pix_code text,
  qr_code_base64 text,
  end_to_end_id text,
  paid_at timestamptz,
  reversal_pending boolean not null default false,
  provider_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists deposits_gateway_id_uq
  on public.deposits(gateway_id)
  where gateway_id is not null;
create index if not exists deposits_user_created_idx
  on public.deposits(user_id, created_at desc);
create index if not exists deposits_pushinpay_user_status_idx
  on public.deposits(user_id, status, created_at desc)
  where provider='pushinpay';
create index if not exists transactions_reference_idx
  on public.transactions(reference_id)
  where reference_id is not null;

alter table public.deposits enable row level security;
alter table public.deposits force row level security;
drop policy if exists deposits_select_own on public.deposits;
create policy deposits_select_own
  on public.deposits for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.deposits from public,anon,authenticated;
grant select on table public.deposits to authenticated;
grant all on table public.deposits to service_role;

-- Client creates only a local pending record. Money values are validated again by the gateway attach/settlement functions.
create or replace function public.create_pushinpay_deposit(p_amount numeric)
returns public.deposits
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_deposit public.deposits%rowtype;
  v_pending_count integer;
begin
  if v_user_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 100000 then
    raise exception 'Informe um valor entre R$ 1,00 e R$ 100.000,00.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':pushinpay',0));

  update public.deposits
  set status='cancelled',
      provider_status=coalesce(provider_status,'expired_local'),
      updated_at=now()
  where user_id=v_user_id
    and provider='pushinpay'
    and status='pending'
    and created_at < now()-interval '30 minutes';

  update public.transactions t
  set status='cancelled'
  where t.user_id=v_user_id
    and t.type='deposit'
    and t.status='pending'
    and t.reference_id in (
      select d.id from public.deposits d
      where d.user_id=v_user_id
        and d.provider='pushinpay'
        and d.status='cancelled'
        and d.provider_status='expired_local'
    );

  select count(*)::integer into v_pending_count
  from public.deposits
  where user_id=v_user_id
    and provider='pushinpay'
    and status='pending'
    and created_at >= now()-interval '30 minutes';

  if v_pending_count >= 5 then
    raise exception 'Você já possui 5 PIX aguardando pagamento.';
  end if;

  insert into public.deposits(user_id,amount,status,provider,provider_status,updated_at)
  values(v_user_id,round(p_amount,2),'pending','pushinpay','creating',now())
  returning * into v_deposit;

  insert into public.transactions(user_id,type,amount,description,status,reference_id)
  values(v_user_id,'deposit',v_deposit.amount,'Recarga via PIX · PushinPay','pending',v_deposit.id);

  return v_deposit;
end;
$$;
revoke all on function public.create_pushinpay_deposit(numeric) from public,anon,authenticated;
grant execute on function public.create_pushinpay_deposit(numeric) to authenticated,service_role;

-- Server attaches the charge returned by PushinPay and checks that the amount is exactly the same.
create or replace function public.attach_pushinpay_charge(
  p_deposit_id uuid,
  p_gateway_id text,
  p_qr_code text,
  p_qr_code_base64 text,
  p_provider_status text,
  p_value_cents bigint
) returns public.deposits
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deposit public.deposits%rowtype;
  v_amount numeric(14,2);
begin
  if nullif(trim(coalesce(p_gateway_id,'')),'') is null then raise exception 'GATEWAY_ID_REQUIRED'; end if;
  if nullif(trim(coalesce(p_qr_code,'')),'') is null then raise exception 'PIX_CODE_REQUIRED'; end if;
  if p_value_cents is null or p_value_cents < 50 then raise exception 'INVALID_PIX_VALUE'; end if;

  select * into v_deposit
  from public.deposits
  where id=p_deposit_id and provider='pushinpay'
  for update;
  if not found then raise exception 'DEPOSIT_NOT_FOUND'; end if;

  v_amount := round(p_value_cents::numeric/100,2);
  if round(v_deposit.amount,2) <> v_amount then raise exception 'DEPOSIT_AMOUNT_MISMATCH'; end if;
  if v_deposit.status <> 'pending' then raise exception 'DEPOSIT_NOT_PENDING'; end if;

  update public.deposits
  set gateway_id=p_gateway_id,
      pix_code=p_qr_code,
      qr_code_base64=p_qr_code_base64,
      provider_status=lower(trim(coalesce(p_provider_status,'created'))),
      updated_at=now()
  where id=p_deposit_id
  returning * into v_deposit;

  return v_deposit;
end;
$$;
revoke all on function public.attach_pushinpay_charge(uuid,text,text,text,text,bigint) from public,anon,authenticated;
grant execute on function public.attach_pushinpay_charge(uuid,text,text,text,text,bigint) to service_role;

create or replace function public.cancel_pushinpay_deposit(
  p_deposit_id uuid,
  p_reason text default 'creation_failed'
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.deposits
  set status='cancelled',provider_status=left(coalesce(p_reason,'creation_failed'),100),updated_at=now()
  where id=p_deposit_id and provider='pushinpay' and status='pending';

  update public.transactions
  set status='cancelled'
  where reference_id=p_deposit_id and type='deposit' and status='pending';
end;
$$;
revoke all on function public.cancel_pushinpay_deposit(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_pushinpay_deposit(uuid,text) to service_role;

-- Prevents browser polling from hammering the provider. Only the server service role may claim a check.
create or replace function public.claim_pushinpay_reconciliation(
  p_deposit_id uuid,
  p_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deposit public.deposits%rowtype;
begin
  select * into v_deposit
  from public.deposits
  where id=p_deposit_id
    and user_id=p_user_id
    and provider='pushinpay'
  for update;

  if not found then return jsonb_build_object('claimed',false,'reason','not_found'); end if;
  if v_deposit.gateway_id is null then return jsonb_build_object('claimed',false,'reason','gateway_missing'); end if;
  if v_deposit.status='completed' then return jsonb_build_object('claimed',false,'reason','completed'); end if;
  if v_deposit.provider_checked_at is not null and v_deposit.provider_checked_at > now()-interval '5 seconds' then
    return jsonb_build_object('claimed',false,'reason','recently_checked');
  end if;

  update public.deposits set provider_checked_at=now(),updated_at=now() where id=v_deposit.id;
  return jsonb_build_object('claimed',true,'gatewayId',v_deposit.gateway_id);
end;
$$;
revoke all on function public.claim_pushinpay_reconciliation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_pushinpay_reconciliation(uuid,uuid) to service_role;

-- Source of truth for balance credit. FOR UPDATE + completed state makes the credit idempotent.
create or replace function public.settle_pushinpay_deposit(
  p_gateway_id text,
  p_value_cents bigint,
  p_status text,
  p_end_to_end_id text default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deposit public.deposits%rowtype;
  v_tx_id uuid;
  v_status text := lower(trim(coalesce(p_status,'')));
  v_amount numeric(14,2);
  v_referral public.referrals%rowtype;
  v_setting public.referral_program_settings%rowtype;
  v_bonus numeric(14,2) := 0;
begin
  if nullif(trim(coalesce(p_gateway_id,'')),'') is null then raise exception 'GATEWAY_ID_REQUIRED'; end if;
  if p_value_cents is null or p_value_cents < 0 then raise exception 'INVALID_VALUE'; end if;
  v_amount := round(p_value_cents::numeric/100,2);

  select * into v_deposit
  from public.deposits
  where provider='pushinpay' and gateway_id=p_gateway_id
  for update;

  if not found then
    return jsonb_build_object('processed',false,'reason','deposit_not_found','gatewayId',p_gateway_id);
  end if;

  if round(v_deposit.amount,2) <> v_amount then raise exception 'DEPOSIT_AMOUNT_MISMATCH'; end if;

  if v_status='paid' then
    if v_deposit.status='completed' then
      update public.deposits
      set provider_status=v_status,
          end_to_end_id=coalesce(nullif(p_end_to_end_id,''),end_to_end_id),
          provider_checked_at=now(),updated_at=now()
      where id=v_deposit.id;
      return jsonb_build_object('processed',true,'idempotent',true,'depositId',v_deposit.id,'status','completed');
    end if;

    if v_deposit.status='cancelled' then
      return jsonb_build_object('processed',false,'reason','deposit_already_cancelled','depositId',v_deposit.id);
    end if;

    update public.deposits
    set status='completed',provider_status=v_status,
        end_to_end_id=coalesce(nullif(p_end_to_end_id,''),end_to_end_id),
        paid_at=coalesce(paid_at,now()),provider_checked_at=now(),updated_at=now(),reversal_pending=false
    where id=v_deposit.id
    returning * into v_deposit;

    update public.wallets
    set balance=balance+v_deposit.amount,
        total_deposited=total_deposited+v_deposit.amount,
        updated_at=now()
    where user_id=v_deposit.user_id;
    if not found then raise exception 'WALLET_UNAVAILABLE'; end if;

    select id into v_tx_id
    from public.transactions
    where reference_id=v_deposit.id and type='deposit'
    order by created_at desc limit 1;

    if v_tx_id is null then
      insert into public.transactions(user_id,type,amount,description,status,reference_id)
      values(v_deposit.user_id,'deposit',v_deposit.amount,'Recarga via PIX · PushinPay','completed',v_deposit.id);
    else
      update public.transactions
      set amount=v_deposit.amount,description='Recarga via PIX · PushinPay',status='completed'
      where id=v_tx_id;
    end if;

    insert into public.notifications(user_id,title,message)
    values(v_deposit.user_id,'PIX confirmado','Seu pagamento PIX foi confirmado e o saldo já está disponível.');

    -- Same referral behavior as the EnergyInvest flow: the first qualifying deposit OR purchase can qualify the invite.
    select * into v_referral
    from public.referrals
    where referred_id=v_deposit.user_id and qualified=false
    for update;

    if v_referral.id is not null then
      select * into v_setting from public.referral_program_settings where id=1;
      if v_setting.active and v_deposit.amount >= v_setting.min_purchase_amount then
        v_bonus := v_setting.reward_amount;
        update public.referrals
        set qualified=true,reward_amount=v_bonus,qualified_at=now()
        where id=v_referral.id;

        update public.wallets
        set balance=balance+v_bonus,total_earned=total_earned+v_bonus,updated_at=now()
        where user_id=v_referral.referrer_id;

        insert into public.transactions(user_id,type,amount,description,status)
        values(v_referral.referrer_id,'bonus',v_bonus,'Bônus de convite Ventora','completed');

        insert into public.notifications(user_id,title,message)
        values(v_referral.referrer_id,'Convite qualificado','Uma indicação realizou a primeira operação elegível e o bônus foi registrado na sua carteira.');
      end if;
    end if;

    return jsonb_build_object('processed',true,'credited',true,'depositId',v_deposit.id,'status','completed','referralBonus',v_bonus);
  end if;

  if v_status in ('canceled','cancelled','expired') then
    if v_deposit.status='completed' then
      update public.deposits
      set provider_status=v_status,reversal_pending=true,provider_checked_at=now(),updated_at=now()
      where id=v_deposit.id;
      return jsonb_build_object('processed',true,'reviewRequired',true,'depositId',v_deposit.id,'status','completed');
    end if;

    update public.deposits
    set status='cancelled',provider_status=v_status,
        end_to_end_id=coalesce(nullif(p_end_to_end_id,''),end_to_end_id),
        provider_checked_at=now(),updated_at=now()
    where id=v_deposit.id
    returning * into v_deposit;

    update public.transactions
    set status='cancelled'
    where reference_id=v_deposit.id and type='deposit' and status='pending';

    return jsonb_build_object('processed',true,'cancelled',true,'depositId',v_deposit.id,'status','cancelled');
  end if;

  update public.deposits
  set provider_status=nullif(v_status,''),
      end_to_end_id=coalesce(nullif(p_end_to_end_id,''),end_to_end_id),
      provider_checked_at=now(),updated_at=now()
  where id=v_deposit.id;

  return jsonb_build_object('processed',true,'credited',false,'depositId',v_deposit.id,'status',v_deposit.status,'providerStatus',v_status);
end;
$$;
revoke all on function public.settle_pushinpay_deposit(text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.settle_pushinpay_deposit(text,bigint,text,text) to service_role;

-- Keep admin dashboard aligned with EnergyInvest and include PIX deposits.
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
    'deposits',(select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc),'[]'::jsonb) from public.deposits d),
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

-- Verification: ANON should have no rows here; AUTHENTICATED should have only SELECT on deposits.
select grantee,table_name,privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name='deposits'
  and grantee in ('anon','authenticated')
order by grantee,privilege_type;
