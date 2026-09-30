-- VENTORA + PUSHINPAY — SERVER-SIDE DEPOSIT HOTFIX
-- Run AFTER supabase/pushinpay.sql.
-- Safe to run more than once.

begin;

-- Financial record creation is server-only. The browser authenticates the user,
-- but this function can only be executed with the Supabase secret/service role.
create or replace function public.server_create_pushinpay_deposit(
  p_user_id uuid,
  p_amount numeric
) returns public.deposits
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_deposit public.deposits%rowtype;
  v_pending_count integer;
begin
  if p_user_id is null then
    raise exception 'AUTH_USER_REQUIRED';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'AUTH_USER_NOT_FOUND';
  end if;

  if p_amount is null or p_amount < 1 or p_amount > 100000 then
    raise exception 'INVALID_AMOUNT';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_user_id::text || ':pushinpay', 0)
  );

  -- Expire old local pending PIX records.
  update public.deposits
  set status = 'cancelled',
      provider_status = coalesce(provider_status, 'expired_local'),
      updated_at = now()
  where user_id = p_user_id
    and provider = 'pushinpay'
    and status = 'pending'
    and created_at < now() - interval '30 minutes';

  update public.transactions t
  set status = 'cancelled'
  where t.user_id = p_user_id
    and t.type = 'deposit'
    and t.status = 'pending'
    and t.reference_id in (
      select d.id
      from public.deposits d
      where d.user_id = p_user_id
        and d.provider = 'pushinpay'
        and d.status = 'cancelled'
        and d.provider_status = 'expired_local'
    );

  select count(*)::integer
  into v_pending_count
  from public.deposits
  where user_id = p_user_id
    and provider = 'pushinpay'
    and status = 'pending'
    and created_at >= now() - interval '30 minutes';

  if v_pending_count >= 5 then
    raise exception 'Você já possui 5 PIX aguardando pagamento.';
  end if;

  insert into public.deposits (
    user_id, amount, status, provider, provider_status, updated_at
  ) values (
    p_user_id, round(p_amount, 2), 'pending', 'pushinpay', 'creating', now()
  )
  returning * into v_deposit;

  insert into public.transactions (
    user_id, type, amount, description, status, reference_id
  ) values (
    p_user_id,
    'deposit',
    v_deposit.amount,
    'Recarga via PIX · PushinPay',
    'pending',
    v_deposit.id
  );

  return v_deposit;
end;
$$;

revoke all on function public.server_create_pushinpay_deposit(uuid,numeric)
  from public, anon, authenticated;
grant execute on function public.server_create_pushinpay_deposit(uuid,numeric)
  to service_role;

-- Keep required server grants explicit even on projects with deny-by-default settings.
grant usage on schema public to service_role;
grant all on table public.deposits to service_role;
grant all on table public.transactions to service_role;
grant all on table public.wallets to service_role;
grant all on table public.notifications to service_role;

-- Force PostgREST to refresh its RPC/table schema cache immediately.
notify pgrst, 'reload schema';

commit;

-- Expected:
-- service_role | true
-- authenticated | false
select
  r.rolname as role_name,
  has_function_privilege(
    r.rolname,
    'public.server_create_pushinpay_deposit(uuid,numeric)',
    'EXECUTE'
  ) as can_execute
from pg_roles r
where r.rolname in ('service_role','authenticated')
order by r.rolname;
