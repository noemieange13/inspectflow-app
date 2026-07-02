-- Diagnostic : rapports « orphelins » (inspection_id NULL, souvent job_id NULL).
-- Contexte observé : si LEFT JOIN jobs ne donne rien, le backfill depuis jobs.inspection_id
-- ne peut pas s’appliquer — le bug est en amont à la création du report.

-- 1) Liste rapide (adapter LIMIT)
select
  r.id,
  r.created_at,
  r.user_id,
  r.job_id,
  r.photo_id,
  r.report_id,
  r.inspection_id,
  j.id as joined_job_id,
  j.inspection_id as job_inspection_id
from public.reports r
left join public.jobs j on j.id = r.job_id
where r.inspection_id is null
order by r.created_at desc
limit 20;

-- 2) Détail sur des IDs précis (remplacer les UUID)
-- select *
-- from public.reports
-- where id in ('...', '...', '...');

-- 3) Si vous avez une table d’audit / events (nom à adapter) :
-- select * from public.audit_log where resource_table = 'reports' order by created_at desc limit 50;

-- Remédiation (hors SQL seul)
-- - Corriger le writer (Edge / autre) pour qu’à la création du report, job_id et/ou
--   inspection_id soient renseignés quand le job/inspection existent.
-- - Ne pas forcer NOT NULL sur job_id tant que d’anciens flux ou inserts manuels existent.
