-- Ventora: créditos diários 24h após a compra; valores conforme cenário cadastrado.
-- Esta atualização NÃO altera valores de depósitos PIX.
-- Créditos são lançamentos financeiros REAIS; validar política de repasses antes de ativar.
BEGIN;

ALTER TABLE public.user_projects
  ADD COLUMN IF NOT EXISTS projected_total_at_purchase numeric(14,2),
  ADD COLUMN IF NOT EXISTS term_days_at_purchase integer,
  ADD COLUMN IF NOT EXISTS credit_days_paid integer NOT NULL DEFAULT 0;

UPDATE public.user_projects h
SET projected_total_at_purchase = round(p.projected_scenario * h.quantity,2),
    term_days_at_purchase = p.duration_days
FROM public.wind_projects p
WHERE h.project_slug = p.slug
  AND (h.projected_total_at_purchase IS NULL OR h.term_days_at_purchase IS NULL);

-- Histórico idempotente. Só servidor/agendador pode alterar.
CREATE TABLE IF NOT EXISTS public.project_daily_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id uuid NOT NULL REFERENCES public.user_projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day_number integer NOT NULL CHECK(day_number >= 1),
  amount numeric(14,2) NOT NULL CHECK(amount > 0),
  due_at timestamptz NOT NULL,
  credited_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(holding_id,day_number)
);
CREATE INDEX IF NOT EXISTS project_daily_credits_user_date_idx ON public.project_daily_credits(user_id, credited_at DESC);
ALTER TABLE public.project_daily_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS project_daily_credits_select_own ON public.project_daily_credits;
CREATE POLICY project_daily_credits_select_own ON public.project_daily_credits FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
REVOKE ALL ON public.project_daily_credits FROM public,anon,authenticated;
GRANT SELECT ON public.project_daily_credits TO authenticated;
GRANT ALL ON public.project_daily_credits TO service_role;

-- Congelar prazo e valor da projeção no instante da compra.
CREATE OR REPLACE FUNCTION public.capture_project_credit_terms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_project public.wind_projects%rowtype;
BEGIN
  SELECT * INTO v_project FROM public.wind_projects WHERE slug=NEW.project_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'Projeto não encontrado'; END IF;
  NEW.projected_total_at_purchase := round(v_project.projected_scenario * NEW.quantity,2);
  NEW.term_days_at_purchase := v_project.duration_days;
  NEW.credit_days_paid := 0;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ventora_capture_terms ON public.user_projects;
CREATE TRIGGER ventora_capture_terms BEFORE INSERT ON public.user_projects FOR EACH ROW
EXECUTE FUNCTION public.capture_project_credit_terms();

-- Determinística e idempotente: cada período de 24 horas rende exatamente uma parcela,
-- com ajuste de centavos na última. Execuções paralelas usam lock e unique.
CREATE OR REPLACE FUNCTION public.process_due_project_credits(p_limit integer DEFAULT 150)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  h record;
  v_due integer;
  v_day integer;
  v_amount numeric(14,2);
  v_total numeric(14,2);
  v_inserted_id uuid;
  v_processed integer := 0;
  v_holdings integer := 0;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Limite inválido'; END IF;
  FOR h IN
    SELECT id,user_id,project_slug,started_at,credit_days_paid,
           projected_total_at_purchase AS projected_total,
           term_days_at_purchase AS term_days
    FROM public.user_projects
    WHERE status='active'
      AND projected_total_at_purchase > 0
      AND term_days_at_purchase > 0
      AND started_at + INTERVAL '24 hours' <= v_now
    ORDER BY started_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  LOOP
    v_due := LEAST(h.term_days, floor(extract(epoch FROM (v_now-h.started_at))/86400)::integer);
    v_day := h.credit_days_paid + 1;
    v_holdings := v_holdings + 1;
    WHILE v_day <= v_due LOOP
      v_amount := round(h.projected_total*v_day/h.term_days,2)
                - round(h.projected_total*(v_day-1)/h.term_days,2);
      IF v_amount > 0 THEN
        INSERT INTO public.project_daily_credits(holding_id,user_id,day_number,amount,due_at)
        VALUES (h.id,h.user_id,v_day,v_amount,h.started_at + make_interval(days=>v_day))
        ON CONFLICT (holding_id,day_number) DO NOTHING RETURNING id INTO v_inserted_id;
        IF v_inserted_id IS NOT NULL THEN
          UPDATE public.wallets SET balance=balance+v_amount,
             total_earned=total_earned+v_amount,updated_at=now()
          WHERE user_id=h.user_id;
          IF NOT FOUND THEN RAISE EXCEPTION 'Carteira não encontrada para %',h.user_id; END IF;
          UPDATE public.user_projects SET total_received=total_received+v_amount,
            credit_days_paid=v_day WHERE id=h.id;
          INSERT INTO public.transactions(user_id,type,amount,description,status,reference_id)
          VALUES(h.user_id,'credit',v_amount,'Crédito diário '||v_day||'/'||h.term_days||' · '||h.project_slug,'completed',h.id);
          v_processed := v_processed+1;
        ELSE
          -- Recupera um lançamento já existente sem creditar duas vezes.
          UPDATE public.user_projects SET credit_days_paid=GREATEST(credit_days_paid,v_day) WHERE id=h.id;
        END IF;
      ELSE
        UPDATE public.user_projects SET credit_days_paid=GREATEST(credit_days_paid,v_day) WHERE id=h.id;
      END IF;
      v_day:=v_day+1;
      v_inserted_id:=NULL;
    END LOOP;
    IF v_due>=h.term_days THEN
      UPDATE public.user_projects SET status='finished' WHERE id=h.id AND credit_days_paid>=h.term_days;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('holdingsChecked',v_holdings,'creditsCreated',v_processed,'asOf',v_now);
END;
$$;
REVOKE ALL ON FUNCTION public.process_due_project_credits(integer) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.process_due_project_credits(integer) TO service_role;

COMMIT;

-- ATIVAÇÃO AGENDADA EM ARQUIVO SEPARADO: 02_ativar_cron.sql
