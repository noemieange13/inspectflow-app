-- Limite les doublons : même rapport, même IP (inconnue = chaîne vide), même minute.
-- Si la migration échoue à cause de lignes déjà dupliquées, supprime les doublons puis relance.

create unique index if not exists report_views_dedupe
on public.report_views (
  report_id,
  coalesce(ip, ''),
  (date_trunc('minute', viewed_at))
);
