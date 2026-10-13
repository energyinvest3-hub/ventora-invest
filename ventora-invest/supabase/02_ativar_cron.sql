-- Executar depois de validar 01_creditos_diarios.sql. Um job/minuto,
-- crédito ocorre NO PRIMEIRO MINUTO após completar cada janela de 24 horas.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='ventora-creditos-24h') THEN
   PERFORM cron.unschedule('ventora-creditos-24h');
 END IF;
END $$;
SELECT cron.schedule('ventora-creditos-24h','* * * * *','SELECT public.process_due_project_credits(150)');
