-- Ventora Admin V11: ajustes de carteira com auditoria, idempotencia e autorizacao de administrador.
-- Execute apos publicar o codigo V11 no site. Nenhum saldo e alterado por esta migracao.
BEGIN;

CREATE TABLE IF NOT EXISTS private.admin_wallet_adjustments (
  request_id uuid PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  mode text NOT NULL CHECK (mode IN ('credit','debit','set')),
  amount numeric(14,2) NOT NULL CHECK(amount >= 0),
  delta numeric(14,2) NOT NULL CHECK (delta <> 0),
  balance_before numeric(14,2) NOT NULL,
  balance_after numeric(14,2) NOT NULL CHECK (balance_after >= 0),
  reason text NOT NULL,
  transaction_id uuid NOT NULL UNIQUE REFERENCES public.transactions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE private.admin_wallet_adjustments FROM PUBLIC, anon, authenticated;
CREATE INDEX IF NOT EXISTS admin_wallet_adjustments_user_time_idx
  ON private.admin_wallet_adjustments(user_id, created_at DESC);

-- Tipo de transacao proprio: nenhum ajuste deve ser tratado como deposito ou saque PIX.
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check CHECK (
  type = ANY (ARRAY['deposit','purchase','credit','withdrawal','refund','bonus','admin_credit','admin_debit']::text[])
);

CREATE OR REPLACE FUNCTION public.admin_adjust_wallet_secure(
  p_user_id uuid,
  p_mode text,
  p_amount numeric,
  p_expected_balance numeric,
  p_reason text,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_admin uuid;
  v_admin_email text;
  v_existing private.admin_wallet_adjustments%rowtype;
  v_balance numeric(14,2);
  v_target numeric(14,2);
  v_delta numeric(14,2);
  v_tx uuid;
  v_reason text := btrim(coalesce(p_reason,''));
  v_mode text := btrim(coalesce(p_mode,''));
BEGIN
  v_admin := auth.uid();
  IF v_admin IS NULL OR NOT private.is_admin() THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED';
  END IF;
  IF p_request_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'DADOS_INVALIDOS';
  END IF;
  IF v_mode NOT IN ('credit','debit','set') THEN
    RAISE EXCEPTION 'MODO_INVALIDO';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 OR p_amount > 50000 OR p_amount <> round(p_amount,2)
    OR (v_mode IN ('credit','debit') AND p_amount = 0) THEN
    RAISE EXCEPTION 'VALOR_INVALIDO';
  END IF;
  IF p_expected_balance IS NULL OR p_expected_balance < 0
    OR p_expected_balance <> round(p_expected_balance,2) THEN
    RAISE EXCEPTION 'SALDO_ESPERADO_INVALIDO';
  END IF;
  IF char_length(v_reason) < 8 OR char_length(v_reason) > 240 THEN
    RAISE EXCEPTION 'MOTIVO_OBRIGATORIO';
  END IF;

  -- Serializa retries da mesma solicitacao, inclusive em instancias diferentes da API.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  SELECT * INTO v_existing FROM private.admin_wallet_adjustments
    WHERE request_id = p_request_id;
  IF FOUND THEN
    IF v_existing.admin_id <> v_admin OR v_existing.user_id <> p_user_id
       OR v_existing.mode <> v_mode OR v_existing.amount <> p_amount
       OR v_existing.balance_before <> p_expected_balance OR v_existing.reason <> v_reason THEN
       RAISE EXCEPTION 'SOLICITACAO_DUPLICADA_DIVERGENTE';
    END IF;
    RETURN jsonb_build_object('ok',true,'alreadyApplied',true,'oldBalance',v_existing.balance_before,
      'newBalance',v_existing.balance_after,'delta',v_existing.delta,'transactionId',v_existing.transaction_id,
      'requestId',p_request_id);
  END IF;

  SELECT balance INTO STRICT v_balance FROM public.wallets
    WHERE user_id=p_user_id FOR UPDATE;
  IF v_balance <> p_expected_balance THEN
    RAISE EXCEPTION 'SALDO_ALTERADO_ATUALIZE_PAINEL';
  END IF;

  IF v_mode='credit' THEN
    v_target := v_balance + p_amount;
  ELSIF v_mode='debit' THEN
    v_target := v_balance - p_amount;
  ELSE
    v_target := p_amount;
  END IF;
  v_delta := v_target-v_balance;
  IF v_target < 0 THEN
    RAISE EXCEPTION 'SALDO_INSUFICIENTE';
  END IF;
  IF abs(v_delta) > 50000 THEN
    RAISE EXCEPTION 'AJUSTE_SUPERA_LIMITE';
  END IF;
  IF v_delta = 0 THEN
    RAISE EXCEPTION 'SEM_ALTERACAO';
  END IF;

  UPDATE public.wallets
  SET balance=v_target,updated_at=now()
  WHERE user_id=p_user_id;

  INSERT INTO public.transactions(user_id,type,amount,description,status,reference_id)
  VALUES(p_user_id,CASE WHEN v_delta > 0 THEN 'admin_credit' ELSE 'admin_debit' END,
         abs(v_delta),CASE WHEN v_delta > 0 THEN 'Crédito administrativo de saldo'
                           ELSE 'Débito administrativo de saldo' END,
         'completed',p_request_id)
  RETURNING id INTO v_tx;

  INSERT INTO private.admin_wallet_adjustments(
    request_id,admin_id,user_id,mode,amount,delta,balance_before,balance_after,reason,transaction_id
  ) VALUES(p_request_id,v_admin,p_user_id,v_mode,p_amount,v_delta,v_balance,v_target,v_reason,v_tx);

  SELECT coalesce(nullif(email,''),'Administrador') INTO v_admin_email
  FROM public.profiles WHERE id=v_admin;
  INSERT INTO public.admin_audit_logs(actor_id,actor_email,action,target_id,detail)
  VALUES(v_admin,coalesce(v_admin_email,'Administrador'),'wallet_adjustment',p_user_id::text,
    jsonb_build_object('request_id',p_request_id,'transaction_id',v_tx,
                       'mode',v_mode,'amount',p_amount,'delta',v_delta,
                       'balance_before',v_balance,'balance_after',v_target,
                       'reason',v_reason));

  RETURN jsonb_build_object('ok',true,'alreadyApplied',false,
    'oldBalance',v_balance,'newBalance',v_target,'delta',v_delta,
    'transactionId',v_tx,'requestId',p_request_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_adjust_wallet_secure(uuid,text,numeric,numeric,text,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_wallet_secure(uuid,text,numeric,numeric,text,uuid)
  TO authenticated;
COMMIT;
