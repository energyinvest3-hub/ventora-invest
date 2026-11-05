-- Ventora V14 - Cria uma variante da função de saque que permite
-- ignorar o horário somente quando a API autenticada verificou o administrador.
-- A função existente de clientes NÃO é removida nem modificada.
BEGIN;
DO $migration$
DECLARE
  definition text;
  old_guard text := 'IF extract(isodow from v_brasilia)>5 OR extract(hour from v_brasilia)<9 OR extract(hour from v_brasilia)>=18 THEN';
BEGIN
  SELECT pg_get_functiondef('public.server_create_manual_withdrawal(uuid,numeric,text,text,text)'::regprocedure)
    INTO definition;
  IF definition IS NULL OR strpos(definition, old_guard) = 0 THEN
    RAISE EXCEPTION 'V13 não identificada ou estrutura inesperada. Nenhuma alteração aplicada.';
  END IF;
  definition := replace(definition, 'server_create_manual_withdrawal(', 'server_create_manual_withdrawal_admin_aware(');
  definition := regexp_replace(definition,
    '\)\s+RETURNS\s+', ', p_admin_override boolean) RETURNS ', 'i');
  IF strpos(definition, 'p_admin_override boolean') = 0 THEN
    RAISE EXCEPTION 'Não foi possível incluir a verificação de administrador.';
  END IF;
  definition := replace(definition, old_guard,
    'IF NOT p_admin_override AND (extract(isodow from v_brasilia)>5 OR extract(hour from v_brasilia)<9 OR extract(hour from v_brasilia)>=18) THEN');
  EXECUTE definition;
END;
$migration$;

-- Somente a service role do backend pode chamar esta variante.
REVOKE ALL ON FUNCTION public.server_create_manual_withdrawal_admin_aware(uuid,numeric,text,text,text,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.server_create_manual_withdrawal_admin_aware(uuid,numeric,text,text,text,boolean)
  TO service_role;
COMMIT;
