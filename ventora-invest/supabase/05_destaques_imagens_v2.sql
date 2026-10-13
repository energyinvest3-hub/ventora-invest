-- Ventora Invest: altera somente imagens e flags de destaque.
-- Execute APÓS o git push e deploy (para que as novas fotos já existam no site).
-- Não altera preços, prazos ou cenários de retorno.
BEGIN;
UPDATE public.wind_projects
SET image = CASE slug
  WHEN 'chapada-branca' THEN '/ventora-chapada-branca.jpg'
  WHEN 'litoral-potiguar' THEN '/ventora-litoral-potiguar.jpg'
  WHEN 'bahia-vento-forte' THEN '/ventora-bahia-vento-forte.jpg'
  ELSE image
END,
featured = slug IN ('ventos-sertao', 'atlas-litoral', 'litoral-potiguar'),
updated_at = now();
COMMIT;
-- Conferência:
SELECT slug, name, unit_value, image, featured
FROM public.wind_projects
WHERE slug IN ('ventos-sertao','atlas-litoral','litoral-potiguar','chapada-branca','bahia-vento-forte')
ORDER BY unit_value;
