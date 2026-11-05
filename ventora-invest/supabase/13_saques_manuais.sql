-- Ventora V13: pedidos de saque com pagamento manual fora da plataforma.
-- Instala somente funções e colunas. NÃO altera saldos ou saques existentes.
BEGIN;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS manual_payment_reference text;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS manual_completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS manual_completed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_manual_reference_unique
  ON public.withdrawals (upper(btrim(manual_payment_reference)))
  WHERE manual_payment_reference IS NOT NULL;

CREATE OR REPLACE FUNCTION public.server_create_manual_withdrawal(
  p_user_id uuid, p_amount numeric, p_pix_key_type text,
  p_pix_key text, p_receiver_national_registration text
) RETURNS public.withdrawals
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog','public'
AS $fn$
DECLARE
  v_wallet public.wallets%rowtype;
  v_row public.withdrawals%rowtype;
  v_amount numeric(14,2);
  v_fee numeric(14,2);
  v_net numeric(14,2);
  v_brasilia timestamp;
  v_doc text;
  v_key text;
BEGIN
  v_brasilia := clock_timestamp() AT TIME ZONE 'America/Sao_Paulo';
  IF extract(isodow from v_brasilia)>5 OR extract(hour from v_brasilia)<9 OR extract(hour from v_brasilia)>=18 THEN
    RAISE EXCEPTION 'Saques permitidos somente de segunda a sexta, das 9h às 18h (Brasília).';
  END IF;
  IF p_user_id IS NULL OR p_amount IS NULL OR p_amount<>round(p_amount,2)
    OR p_amount < 1.05 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'Informe um valor entre R$ 1,05 e R$ 100.000,00.';
  END IF;
  v_amount := p_amount;
  v_fee := round(v_amount * 0.04,2);
  v_net := v_amount - v_fee;
  IF v_net < 1 THEN RAISE EXCEPTION 'Valor líquido inferior a R$ 1,00.'; END IF;
  IF p_pix_key_type NOT IN ('cpf','email','phone','random') THEN
    RAISE EXCEPTION 'Tipo de chave PIX inválido.';
  END IF;
  v_key := btrim(coalesce(p_pix_key,''));
  v_doc := regexp_replace(coalesce(p_receiver_national_registration,''),'[^0-9]','','g');
  IF char_length(v_key) < 3 OR char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'Chave PIX inválida.';
  END IF;
  IF char_length(v_doc) NOT IN (11,14) THEN
    RAISE EXCEPTION 'Informe CPF ou CNPJ do titular.';
  END IF;
  IF p_pix_key_type='cpf' AND (regexp_replace(v_key,'[^0-9]','','g')<>v_doc OR char_length(v_doc)<>11) THEN
    RAISE EXCEPTION 'CPF do titular precisa ser igual à chave PIX.';
  END IF;
  -- A trava da carteira impede duas reservas simultâneas na mesma conta.
  SELECT * INTO v_wallet FROM public.wallets WHERE user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Carteira não encontrada.'; END IF;
  IF EXISTS (SELECT 1 FROM public.withdrawals WHERE user_id=p_user_id AND status='pending') THEN
    RAISE EXCEPTION 'Você já tem um saque pendente de análise. Aguarde a conclusão ou cancelamento.';
  END IF;
  IF v_wallet.balance < v_amount THEN RAISE EXCEPTION 'Saldo insuficiente.'; END IF;
  UPDATE public.wallets SET balance=balance-v_amount,updated_at=now() WHERE user_id=p_user_id;
  INSERT INTO public.withdrawals(
     user_id,amount,pix_key_type,pix_key,receiver_national_registration,
     status,provider_status,fee_amount,net_amount
  ) VALUES(
     p_user_id,v_amount,p_pix_key_type,v_key,v_doc,
     'pending','manual_pending',v_fee,v_net
  ) RETURNING * INTO v_row;
  INSERT INTO public.transactions(user_id,type,amount,description,status,reference_id)
  VALUES(p_user_id,'withdrawal',v_amount,
     'Solicitação de saque aguardando pagamento manual · Taxa 4%: R$ '||v_fee::text||' · Líquido: R$ '||v_net::text,
     'pending',v_row.id);
  INSERT INTO public.notifications(user_id,title,message)
  VALUES(p_user_id,'Saque solicitado','Sua solicitação foi registrada e aguarda pagamento pelo responsável.');
  RETURN v_row;
END;
$fn$;
REVOKE ALL ON FUNCTION public.server_create_manual_withdrawal(uuid,numeric,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.server_create_manual_withdrawal(uuid,numeric,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_withdrawals_snapshot()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private'
AS $fn$
DECLARE v_rows jsonb;
BEGIN
  IF NOT private.is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) INTO v_rows
  FROM (
    SELECT w.id,w.user_id,w.amount,w.fee_amount,w.net_amount,
           w.pix_key_type,w.pix_key,w.receiver_national_registration,
           w.status,w.provider_status,w.cashout_id,w.cashout_error,
           w.manual_payment_reference,w.created_at,w.paid_at,
           p.name AS user_name,p.email AS user_email
    FROM public.withdrawals w
    LEFT JOIN public.profiles p ON p.id=w.user_id
  ) x;
  RETURN v_rows;
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_withdrawals_snapshot() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_withdrawals_snapshot() TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_resolve_manual_withdrawal(
  p_withdrawal_id uuid, p_action text, p_payment_reference text DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','private'
AS $fn$
DECLARE
  v_row public.withdrawals%rowtype;
  v_admin uuid;
  v_email text;
  v_ref text;
  v_reason text;
  v_count integer;
BEGIN
  v_admin := auth.uid();
  IF v_admin IS NULL OR NOT private.is_admin() THEN RAISE EXCEPTION 'ADMIN_REQUIRED'; END IF;
  IF p_withdrawal_id IS NULL OR p_action IS NULL OR p_action NOT IN ('complete','cancel') THEN
    RAISE EXCEPTION 'SOLICITACAO_INVALIDA';
  END IF;
  SELECT * INTO v_row FROM public.withdrawals WHERE id=p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SAQUE_NAO_ENCONTRADO'; END IF;
  IF v_row.status='completed' AND v_row.provider_status='manual_paid' AND p_action='complete'
    AND upper(btrim(coalesce(p_payment_reference,'')))=v_row.manual_payment_reference THEN
    RETURN jsonb_build_object('ok',true,'alreadyApplied',true,'status','completed');
  END IF;
  IF v_row.status='cancelled' AND v_row.provider_status='manual_cancelled' AND p_action='cancel' THEN
    RETURN jsonb_build_object('ok',true,'alreadyApplied',true,'status','cancelled');
  END IF;
  -- Nunca marcar como pago nem devolver uma transferência já enviada a um gateway.
  IF v_row.status<>'pending' OR v_row.cashout_id IS NOT NULL
    OR v_row.provider_status IS DISTINCT FROM 'manual_pending' THEN
    RAISE EXCEPTION 'SAQUE_EM_REVISAO_OU_JA_PROCESSADO';
  END IF;
  IF v_row.net_amount IS NULL OR v_row.fee_amount <> round(v_row.amount*0.04,2)
    OR v_row.net_amount <> v_row.amount-v_row.fee_amount THEN
    RAISE EXCEPTION 'VALORES_FINANCEIROS_INCONSISTENTES';
  END IF;
  SELECT count(*) INTO v_count FROM public.transactions
    WHERE user_id=v_row.user_id AND reference_id=v_row.id
      AND type='withdrawal' AND status='pending';
  IF v_count<>1 THEN RAISE EXCEPTION 'RESERVA_FINANCEIRA_INCONSISTENTE'; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id=v_admin;
  IF p_action='complete' THEN
    v_ref := upper(btrim(coalesce(p_payment_reference,'')));
    IF char_length(v_ref)<8 OR char_length(v_ref)>160 OR v_ref ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION 'REFERENCIA_DO_COMPROVANTE_OBRIGATORIA';
    END IF;
    -- Reflete confirmação MANUAL do administrador, não confirmação do gateway.
    UPDATE public.withdrawals SET status='completed',provider_status='manual_paid',
      paid_at=now(),manual_completed_at=now(),manual_completed_by=v_admin,
      manual_payment_reference=v_ref,updated_at=now() WHERE id=v_row.id;
    UPDATE public.transactions SET status='completed',
      description='Saque pago externamente, confirmado pelo administrador (referência '||left(v_ref,160)||')'
      WHERE user_id=v_row.user_id AND reference_id=v_row.id AND type='withdrawal' AND status='pending';
    GET DIAGNOSTICS v_count=ROW_COUNT;
    IF v_count<>1 THEN RAISE EXCEPTION 'TRANSACAO_AUSENTE'; END IF;
    UPDATE public.wallets SET total_withdrawn=total_withdrawn+v_row.amount,
      updated_at=now() WHERE user_id=v_row.user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'CARTEIRA_AUSENTE'; END IF;
    INSERT INTO public.notifications(user_id,title,message)
    VALUES(v_row.user_id,'Saque concluído','Seu saque foi marcado como pago após conferência de pagamento externo pelo responsável.');
    INSERT INTO public.admin_audit_logs(actor_id,actor_email,action,target_id,detail)
    VALUES(v_admin,coalesce(v_email,'Administrador'),'manual_withdrawal_completed',v_row.id::text,
      jsonb_build_object('user_id',v_row.user_id,'amount',v_row.amount,
        'fee',v_row.fee_amount,'net',v_row.net_amount,'payment_reference',v_ref));
    RETURN jsonb_build_object('ok',true,'status','completed','alreadyApplied',false);
  ELSE
    v_reason := btrim(coalesce(p_reason,''));
    IF char_length(v_reason)<8 OR char_length(v_reason)>240 THEN
      RAISE EXCEPTION 'MOTIVO_DO_CANCELAMENTO_OBRIGATORIO';
    END IF;
    UPDATE public.withdrawals SET status='cancelled',provider_status='manual_cancelled',
      cashout_error=left(v_reason,240),updated_at=now() WHERE id=v_row.id;
    UPDATE public.transactions SET status='cancelled',
      description='Solicitação cancelada antes do pagamento; valor integral estornado'
      WHERE user_id=v_row.user_id AND reference_id=v_row.id AND type='withdrawal' AND status='pending';
    GET DIAGNOSTICS v_count=ROW_COUNT;
    IF v_count<>1 THEN RAISE EXCEPTION 'TRANSACAO_AUSENTE'; END IF;
    UPDATE public.wallets SET balance=balance+v_row.amount,updated_at=now()
      WHERE user_id=v_row.user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'CARTEIRA_AUSENTE'; END IF;
    INSERT INTO public.notifications(user_id,title,message)
    VALUES(v_row.user_id,'Saque cancelado','A solicitação não foi paga e o valor reservado voltou integralmente à carteira.');
    INSERT INTO public.admin_audit_logs(actor_id,actor_email,action,target_id,detail)
    VALUES(v_admin,coalesce(v_email,'Administrador'),'manual_withdrawal_cancelled',v_row.id::text,
      jsonb_build_object('user_id',v_row.user_id,'refunded',v_row.amount,'reason',v_reason));
    RETURN jsonb_build_object('ok',true,'status','cancelled','alreadyApplied',false,'refunded',v_row.amount);
  END IF;
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_resolve_manual_withdrawal(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_manual_withdrawal(uuid,text,text,text) TO authenticated;
COMMIT;
