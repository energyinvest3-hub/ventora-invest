-- Inspeção sem movimentar dinheiro.
SELECT h.id,h.project_slug,h.started_at,
  h.started_at+interval '24 hours' * (h.credit_days_paid+1) AS proximo_credito,
  h.credit_days_paid,h.term_days_at_purchase,
  h.projected_total_at_purchase,h.total_received,
  w.balance AS saldo_atual
FROM public.user_projects h
JOIN public.wallets w ON w.user_id=h.user_id
ORDER BY h.started_at DESC LIMIT 20;
SELECT jobid,jobname,schedule,active FROM cron.job WHERE jobname='ventora-creditos-24h';
