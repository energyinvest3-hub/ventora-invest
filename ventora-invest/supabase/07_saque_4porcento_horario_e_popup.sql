-- Ventora V7: saques novos com taxa de 4% e horário Brasília (09:00-09:59:59 seg-sex)
-- IMPORTANTE: aplicar APÓS publicar o código V7. Saques anteriores preservados.
BEGIN;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS fee_amount numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS net_amount numeric(14,2);
DO $v7$
DECLARE v_create text; v_attach text; v_settle text; v_old text; v_new text; v_count integer;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO STRICT v_create FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='server_create_pushinpay_withdrawal'
    AND pg_get_function_identity_arguments(p.oid)='p_user_id uuid, p_amount numeric, p_pix_key_type text, p_pix_key text, p_receiver_national_registration text';
  IF position('v_fee numeric' IN v_create)=0 THEN
    v_old:='v_amount numeric(14,2) := round(p_amount,2);';
    v_new:='v_amount numeric(14,2) := round(p_amount,2);' || E'\n' ||
      '  v_fee numeric(14,2); v_net numeric(14,2); v_local_time timestamp;';
    IF position(v_old IN v_create)=0 THEN RAISE EXCEPTION 'Unexpected RPC withdrawal declaration'; END IF;
    v_create:=replace(v_create,v_old,v_new);

    v_old:='if p_user_id is null then raise exception';
    v_new:='v_local_time := clock_timestamp() AT TIME ZONE ''America/Sao_Paulo'';' || E'\n' ||
      '  if extract(isodow from v_local_time)>5 or extract(hour from v_local_time)<>9 then' || E'\n' ||
      '    raise exception ''Saques permitidos somente de segunda a sexta, das 9h às 10h (Brasília).'';' || E'\n' ||
      '  end if;' || E'\n' || '  if p_user_id is null then raise exception';
    IF position(v_old IN v_create)=0 THEN RAISE EXCEPTION 'Unexpected RPC withdrawal body'; END IF;
    v_create:=replace(v_create,v_old,v_new);

    v_old:='if v_amount is null or v_amount < 1 or v_amount > 100000';
    v_new:='if v_amount is null or v_amount < 1.05 or v_amount > 100000';
    IF position(v_old IN v_create)=0 THEN RAISE EXCEPTION 'Unexpected RPC withdrawal min amount'; END IF;
    v_create:=replace(v_create,v_old,v_new);
    v_create:=replace(v_create,'Informe um valor entre R$ 1,00 e R$ 100.000,00.','Informe um valor entre R$ 1,05 e R$ 100.000,00.');

    v_old:='if p_pix_key_type not in';
    v_new:='v_fee := round(v_amount*0.04, 2); v_net := v_amount-v_fee;' || E'\n' ||
       '  if v_net < 1 then raise exception ''O valor líquido do saque deve ser de pelo menos R$ 1,00.''; end if;' || E'\n' || '  if p_pix_key_type not in';
    IF position(v_old IN v_create)=0 THEN RAISE EXCEPTION 'Unexpected RPC withdrawal keytype'; END IF;
    v_create:=replace(v_create,v_old,v_new);

    v_old:='insert into public.withdrawals(user_id,amount,pix_key_type,pix_key,receiver_national_registration,status)';
    v_new:='insert into public.withdrawals(user_id,amount,pix_key_type,pix_key,receiver_national_registration,status,fee_amount,net_amount)';
    IF position(v_old IN v_create)=0 THEN RAISE EXCEPTION 'Unexpected RPC withdrawal insert'; END IF;
    v_create:=replace(v_create,v_old,v_new);
    v_old:='),''pending'')';
    v_new:='),''pending'',v_fee,v_net)';
    IF position(v_old IN v_create)=0 THEN RAISE EXCEPTION 'Unexpected RPC withdrawal values'; END IF;
    v_create:=replace(v_create,v_old,v_new);
    v_old:='''Saque PIX em processamento''';
    v_new:='format(''Saque PIX em processamento · Taxa 4%%: R$ %s · Líquido: R$ %s'',v_fee,v_net)';
    IF position(v_old IN v_create)=0 THEN RAISE EXCEPTION 'Unexpected RPC withdrawal history'; END IF;
    v_create:=replace(v_create,v_old,v_new);
    EXECUTE v_create;
  END IF;

  SELECT pg_get_functiondef(p.oid) INTO STRICT v_attach FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='attach_pushinpay_withdrawal';
  IF position('coalesce(v_row.net_amount,v_row.amount)' IN v_attach)=0 THEN
    v_old:='round(v_row.amount*100)::bigint';
    IF position(v_old IN v_attach)=0 THEN RAISE EXCEPTION 'Unexpected RPC attach calculation'; END IF;
    v_attach:=replace(v_attach,v_old,'round(coalesce(v_row.net_amount,v_row.amount)*100)::bigint');
    EXECUTE v_attach;
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO STRICT v_settle FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='settle_pushinpay_withdrawal';
  IF position('coalesce(v_row.net_amount,v_row.amount)' IN v_settle)=0 THEN
    v_old:='round(v_row.amount*100)::bigint';
    IF position(v_old IN v_settle)=0 THEN RAISE EXCEPTION 'Unexpected RPC settle calculation'; END IF;
    v_settle:=replace(v_settle,v_old,'round(coalesce(v_row.net_amount,v_row.amount)*100)::bigint');
    v_settle:=replace(v_settle,'''Saque PIX concluído''',
        'format(''Saque PIX concluído · Taxa: R$ %s · Líquido: R$ %s'',v_row.fee_amount,coalesce(v_row.net_amount,v_row.amount))');
    EXECUTE v_settle;
  END IF;
END $v7$;
COMMIT;
