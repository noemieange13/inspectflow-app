-- Colonnes attendues par l’Edge Function create-report (jointure inspection / job / photo).
-- Pas de FK ici : les tables core peuvent exister hors de ce dépôt ; évite un db push cassant.
-- Variante plus stricte : references public.inspections (id), public.jobs (id), public.photos (id).

alter table public.reports
  add column if not exists inspection_id uuid,
  add column if not exists job_id uuid,
  add column if not exists photo_id uuid;

create index if not exists idx_reports_inspection_id on public.reports (inspection_id)
  where inspection_id is not null;

create index if not exists idx_reports_job_id on public.reports (job_id)
  where job_id is not null;
