-- Diagnostic : trouver comment public.reports et public.jobs se rejoignent.
-- Exécuter dans Supabase SQL Editor. Ne pas backfill tant que les JOIN ci-dessous
-- ne retournent pas un COUNT cohérent avec ta réalité métier.

-- 1) Colonnes utiles (adapter si besoin)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'reports'
order by ordinal_position;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'jobs'
order by ordinal_position;

-- 2) Dans ce repo, l’ID du rapport côté API = reports.id (pas une colonne "report_id" sur reports).
-- Si ta table reports a seulement "id", les tests doivent utiliser r.id, pas r.report_id.

-- 2a) Hypothèse fréquente : jobs référence le rapport
-- select count(*) from public.reports r
-- join public.jobs j on j.report_id = r.id;

-- 2b) Hypothèse : jobs.id est le travail, et un champ lie au report
-- select count(*) from public.reports r
-- join public.jobs j on r.id = j.report_id;

-- 2c) Si le premier test (r.report_id = j.id) donnait 0 : vérifier si la colonne report_id existe sur reports
--     select count(*) from public.reports where report_id is not null;

-- 3) Une fois le bon JOIN trouvé, backfill inspection_id (EXEMPLE — à adapter aux vrais noms de colonnes) :
-- update public.reports r
-- set inspection_id = j.inspection_id
-- from public.jobs j
-- where r.id = j.report_id
--   and r.inspection_id is null
--   and j.inspection_id is not null;

-- 4) Validation
-- select count(*) from public.reports where inspection_id is not null;
-- select r.id from public.reports r
-- join public.photos p on p.inspection_id = r.inspection_id
-- limit 1;
