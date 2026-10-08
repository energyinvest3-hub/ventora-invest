-- Ventora Invest — Saque PIX PushinPay v1
-- Reserva saldo de forma atômica, envia CashOut e liquida por webhook.
begin;

alter table public.transactions add column if not exists reference_id uuid;
create index if not exists transactions_reference_id_idx on public.transactions(reference_id) where reference_id is not null;

create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  pix_key_type text not null check (pix_key_type in ('cpf','email','phone','random')),
  pix_key text not null,
  receiver_national_registration text not null,
  status text not null default 'pending' check (status in ('pending','completed','cancelled','review')),
  cashout_id text,
  provider_status text,
  end_to_end_id text,
  receiver_name text,
  cashout_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);

create unique index if not exists withdrawals_cashout_id_unique on public.withdrawals(cashout_id) where cashout_id is not null;
create index if not exists withdrawals_user_created_idx on public.withdrawals(user_id, created_at desc);

alter table public.withdrawals enable row level security;
drop policy if exists "withdrawals_select_own" on public.withdrawals;
create policy "withdrawals_select_own" on public.withdrawals for select to authenticated using (user_id = auth.uid());
revoke all on public.withdrawals from public, anon, authenticated;
grant select on public.withdrawals to authenticated;

create or replace function public.server_create_pushinpay_withdrawal(
  p_user_id uuid, p_amount numeric, p_pix_key_type text, p_pix_key text, p_receiver_national_registration text
) returns public.withdrawals
language plpgsql security definer set search_path = ''
as $$
declare
  v_wallet public.wallets%rowtype;
  v_row public.withdrawals%rowtype;
  v_amount numeric(14,2) := round(p_amount,2);
begin
  if p_user_id is null then raise exception 'Usuário inválido.'; end if;
  if v_amount is null or v_amount < 1 or v_amount > 100000 then raise exception 'Informe um valor entre R$ 1,00 e R$ 100.000,00.'; end if;
  if p_pix_key_type not in ('cpf','email','phone','random') then raise exception 'Tipo de chave PIX inválido.'; end if;
  if nullif(trim(coalesce(p_pix_key,'')), '') is null then raise exception 'Informe a chave PIX.'; end if;
  if length(regexp_replace(coalesce(p_receiver_national_registration,''), '\D','','g')) not in (11,14) then
    raise exception 'Informe o CPF ou CNPJ do titular da chave PIX.';
  end if;

  if exists (
    select 1 from public.withdrawals
    where user_id=p_user_id and status in ('pending','review')
      and created_at > now() - interval '30 minutes'
  ) then
    raise exception 'Você já possui um saque em processamento. Aguarde a conclusão.';
  end if;

  select * into v_wallet from public.wallets where user_id=p_user_id for update;
  if not found then raise exception 'Carteira não encontrada.'; end if;
  if v_wallet.balance < v_amount then raise exception 'Saldo insuficiente.'; end if;

  update public.wallets set balance=balance-v_amount, updated_at=now() where user_id=p_user_id;

  insert into public.withdrawals(user_id,amount,pix_key_type,pix_key,receiver_national_registration,status)
  values(p_user_id,v_amount,p_pix_key_type,trim(p_pix_key),
    regexp_replace(p_receiver_national_registration,'\D','','g'),'pending')
  returning * into v_row;

  insert into public.transactions(user_id,type,amount,description,status,reference_id)
  values(p_user_id,'withdrawal',v_amount,'Saque PIX em processamento','pending',v_row.id);

  return v_row;
end $$;

revoke all on function public.server_create_pushinpay_withdrawal(uuid,numeric,text,text,text) from public,anon,authenticated;
grant execute on function public.server_create_pushinpay_withdrawal(uuid,numeric,text,text,text) to service_role;

create or replace function public.attach_pushinpay_withdrawal(
  p_withdrawal_id uuid, p_cashout_id text, p_value_cents bigint, p_status text,
  p_end_to_end_id text default null, p_receiver_name text default null
) returns public.withdrawals
language plpgsql security definer set search_path = ''
as $$
declare v_row public.withdrawals%rowtype; v_expected bigint;
begin
  select * into v_row from public.withdrawals where id=p_withdrawal_id for update;
  if not found then raise exception 'Saque não encontrado.'; end if;
  if v_row.status not in ('pending','review') then raise exception 'Este saque já foi finalizado.'; end if;
  v_expected := round(v_row.amount*100)::bigint;
  if v_expected <> p_value_cents then raise exception 'Valor do gateway não confere com o saque.'; end if;
  if v_row.cashout_id is not null and v_row.cashout_id <> p_cashout_id then raise exception 'Saque já vinculado a outro CashOut.'; end if;

  update public.withdrawals
  set cashout_id=p_cashout_id, provider_status=lower(coalesce(p_status,'')),
      end_to_end_id=coalesce(p_end_to_end_id,end_to_end_id),
      receiver_name=coalesce(p_receiver_name,receiver_name),
      status='pending', cashout_error=null, updated_at=now()
  where id=p_withdrawal_id returning * into v_row;
  return v_row;
end $$;

revoke all on function public.attach_pushinpay_withdrawal(uuid,text,bigint,text,text,text) from public,anon,authenticated;
grant execute on function public.attach_pushinpay_withdrawal(uuid,text,bigint,text,text,text) to service_role;

create or replace function public.settle_pushinpay_withdrawal(
  p_cashout_id text, p_value_cents bigint, p_status text, p_end_to_end_id text default null
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare v_row public.withdrawals%rowtype; v_status text:=lower(coalesce(p_status,'')); v_expected bigint;
begin
  select * into v_row from public.withdrawals where cashout_id=p_cashout_id for update;
  if not found then return jsonb_build_object('processed',false,'reason','withdrawal_not_found'); end if;

  v_expected := round(v_row.amount*100)::bigint;
  if v_expected <> p_value_cents then
    update public.withdrawals set status='review',cashout_error='Valor do gateway não confere.',updated_at=now() where id=v_row.id;
    return jsonb_build_object('processed',true,'reason','value_mismatch');
  end if;

  update public.withdrawals
  set provider_status=v_status,end_to_end_id=coalesce(p_end_to_end_id,end_to_end_id),updated_at=now()
  where id=v_row.id;

  if v_status='paid' then
    if v_row.status='completed' then return jsonb_build_object('processed',true,'reason','already_completed'); end if;
    update public.withdrawals set status='completed',provider_status='paid',paid_at=coalesce(paid_at,now()),cashout_error=null,updated_at=now() where id=v_row.id;
    update public.transactions set status='completed',description='Saque PIX concluído'
      where reference_id=v_row.id and user_id=v_row.user_id and type='withdrawal' and status='pending';
    update public.wallets set total_withdrawn=total_withdrawn+v_row.amount,updated_at=now() where user_id=v_row.user_id;
    insert into public.notifications(user_id,title,message) values(v_row.user_id,'Saque concluído','Seu PIX foi enviado e confirmado pela PushinPay.');
    return jsonb_build_object('processed',true,'reason','paid','withdrawal_id',v_row.id);
  end if;

  if v_status in ('canceled','cancelled') then
    if v_row.status='cancelled' then return jsonb_build_object('processed',true,'reason','already_cancelled'); end if;
    if v_row.status='completed' then return jsonb_build_object('processed',true,'reason','already_completed'); end if;
    update public.withdrawals set status='cancelled',provider_status='canceled',updated_at=now() where id=v_row.id;
    update public.wallets set balance=balance+v_row.amount,updated_at=now() where user_id=v_row.user_id;
    update public.transactions set status='cancelled',description='Saque PIX cancelado'
      where reference_id=v_row.id and user_id=v_row.user_id and type='withdrawal' and status='pending';
    insert into public.notifications(user_id,title,message) values(v_row.user_id,'Saque cancelado','O valor reservado voltou para sua carteira.');
    return jsonb_build_object('processed',true,'reason','canceled','withdrawal_id',v_row.id);
  end if;

  return jsonb_build_object('processed',true,'reason','provider_pending','status',v_status);
end $$;

revoke all on function public.settle_pushinpay_withdrawal(text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.settle_pushinpay_withdrawal(text,bigint,text,text) to service_role;

create or replace function public.cancel_unsubmitted_pushinpay_withdrawal(p_withdrawal_id uuid,p_reason text default 'gateway_rejected')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_row public.withdrawals%rowtype;
begin
  select * into v_row from public.withdrawals where id=p_withdrawal_id for update;
  if not found then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if v_row.status<>'pending' then return jsonb_build_object('ok',false,'reason','not_pending'); end if;
  if v_row.cashout_id is not null then return jsonb_build_object('ok',false,'reason','already_sent'); end if;

  update public.withdrawals set status='cancelled',provider_status='rejected',
    cashout_error=left(coalesce(p_reason,'gateway_rejected'),500),updated_at=now() where id=v_row.id;
  update public.wallets set balance=balance+v_row.amount,updated_at=now() where user_id=v_row.user_id;
  update public.transactions set status='cancelled',description='Saque PIX não enviado'
    where reference_id=v_row.id and user_id=v_row.user_id and type='withdrawal' and status='pending';
  return jsonb_build_object('ok',true);
end $$;

revoke all on function public.cancel_unsubmitted_pushinpay_withdrawal(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_unsubmitted_pushinpay_withdrawal(uuid,text) to service_role;

create or replace function public.mark_pushinpay_withdrawal_review(p_withdrawal_id uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  update public.withdrawals set status='review',
    cashout_error=left(coalesce(p_reason,'Falha ambígua no gateway.'),500),updated_at=now()
  where id=p_withdrawal_id and status='pending';
  return jsonb_build_object('ok',true);
end $$;

revoke all on function public.mark_pushinpay_withdrawal_review(uuid,text) from public,anon,authenticated;
grant execute on function public.mark_pushinpay_withdrawal_review(uuid,text) to service_role;

commit;
