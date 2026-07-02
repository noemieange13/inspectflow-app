-- =============================================================================
-- Backfill sécurisé : public.reports.inspection_id
-- =============================================================================
-- Contexte observé (prod Supabase) :
--   - jobs : id, photo_id, inspection_id (pas de jobs.report_id)
--   - reports : id, report_id (?), inspection_id souvent NULL
--   - photos : id, inspection_id, ...
--
-- Hypothèse à VALIDER avant tout UPDATE (COUNT > 0) :
--   reports.report_id = jobs.photo_id  →  photos  →  inspection_id
--
-- Si les tests "mapping" retournent 0, NE PAS exécuter le backfill : données
-- insuffisantes pour une jointure non ambiguë.
--
-- Usage : SQL Editor — exécuter SECTION PAR SECTION, lire les résultats, puis
--         décommenter / lancer la transaction seulement si les garde-fous OK.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 0 — Métadonnées (lecture seule)
-- -----------------------------------------------------------------------------
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'reports'
order by ordinal_position;

select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'jobs'
order by ordinal_position;

-- -----------------------------------------------------------------------------
-- SECTION 1 — Tests de mapping (lecture seule) — au moins un doit être > 0
-- -----------------------------------------------------------------------------

-- A) reports.report_id = photos.id (souvent faux si report_id n’est pas une photo)
-- select count(*) as cnt_a
-- from public.reports r
-- join public.photos p on p.id = r.report_id;

-- B) Chaîne jobs : reports.report_id = jobs.photo_id
select count(*) as cnt_b_reports_to_jobs_photo
from public.reports r
join public.jobs j on j.photo_id = r.report_id;

-- C) Chaîne complète jusqu’à photos (cohérence inspection)
select count(*) as cnt_c_full_chain
from public.reports r
join public.jobs j on j.photo_id = r.report_id
join public.photos p on p.id = j.photo_id;

-- D) Incohérences potentielles : même chaîne mais jobs.inspection_id != photos.inspection_id
select count(*) as cnt_d_mismatch_job_vs_photo
from public.jobs j
join public.photos p on p.id = j.photo_id
where j.inspection_id is distinct from p.inspection_id;

-- Si cnt_b ou cnt_c = 0 → arrêter : pas de backfill automatique fiable ici.
-- Si cnt_d > 0 → résoudre la source de vérité (jobs vs photos) avant backfill.

-- -----------------------------------------------------------------------------
-- SECTION 2 — Prévisualisation des lignes à mettre à jour (lecture seule)
-- -----------------------------------------------------------------------------
-- select
--   r.id as report_pk,
--   r.report_id,
--   r.inspection_id as inspection_before,
--   p.inspection_id as inspection_after,
--   j.id as job_id,
--   j.photo_id
-- from public.reports r
-- join public.jobs j on j.photo_id = r.report_id
-- join public.photos p on p.id = j.photo_id
-- where r.inspection_id is null
--   and p.inspection_id is not null
-- limit 100;

-- -----------------------------------------------------------------------------
-- SECTION 3 — Backfill TRANSACTIONNEL (exécuter uniquement si SECTION 1 OK)
-- -----------------------------------------------------------------------------
-- Règles :
--   - Une seule source pour inspection_id : ici public.photos.inspection_id
--   - Ne mettre à jour que si reports.inspection_id IS NULL
--   - Refuser si plusieurs jobs distincts pour le même r.report_id (ambiguïté)

-- Ambiguïté AVANT toute écriture : plusieurs inspections possibles pour un même report
-- (via la chaîne report → jobs → photos). Doit retourner 0 ligne.
select r.id as report_pk, count(distinct p.inspection_id) as distinct_inspection_ids
from public.reports r
join public.jobs j on j.photo_id = r.report_id
join public.photos p on p.id = j.photo_id
where r.inspection_id is null
  and p.inspection_id is not null
group by r.id
having count(distinct p.inspection_id) > 1;

begin;

create temporary table _backfill_targets on commit drop as
select distinct on (r.id)
  r.id as report_pk,
  p.inspection_id as new_inspection_id,
  j.photo_id as matched_photo_id,
  j.id as job_id_chosen
from public.reports r
join public.jobs j on j.photo_id = r.report_id
join public.photos p on p.id = j.photo_id
where r.inspection_id is null
  and p.inspection_id is not null
order by r.id, j.id;

-- Si la requête d’ambiguïté ci-dessus a retourné des lignes : ROLLBACK uniquement.

-- update public.reports r
-- set inspection_id = t.new_inspection_id
-- from _backfill_targets t
-- where r.id = t.report_pk;

-- Vérifier le nombre de lignes affectées (pg 9+ : GET DIAGNOSTICS dans un DO block si besoin)
-- select count(*) from _backfill_targets;

-- commit;
-- rollback;  -- si doute

-- -----------------------------------------------------------------------------
-- SECTION 4 — Validations post-backfill
-- -----------------------------------------------------------------------------
-- select count(*) from public.reports where inspection_id is null;
-- select count(*) from public.reports r
-- join public.photos p on p.inspection_id = r.inspection_id
-- join public.jobs j on j.photo_id = r.report_id and j.photo_id = p.id
-- where r.inspection_id is distinct from p.inspection_id;

-- -----------------------------------------------------------------------------
-- SECTION 5 — Durcissement (À LANCER PLUS TARD, hors transaction du backfill)
-- -----------------------------------------------------------------------------
-- ⚠️ NOT NULL sur inspection_id : seulement si TOUS les reports futurs ont une inspection.
-- ⚠️ FK vers public.inspections(id) : vérifier qu’aucun inspection_id orphelin ne reste.
--
-- alter table public.reports
--   add constraint reports_inspection_id_fkey
--   foreign key (inspection_id) references public.inspections(id);
--
-- alter table public.reports
--   alter column inspection_id set not null;

-- -----------------------------------------------------------------------------
-- SECTION 6 — Option long terme (refactor applicatif, pas SQL seul)
-- -----------------------------------------------------------------------------
-- Renommer reports.report_id → reports.photo_id si la sémantique est "photo FK"
--   pour éviter la confusion avec reports.id (PK).
-- Documenter la source de vérité : job vs photo pour inspection_id.
