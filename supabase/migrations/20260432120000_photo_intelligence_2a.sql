-- Phase Photo Intelligence 2A : analyse persistante, capture_context, file jobs.

-- ── photos : statut analyse + indices terrain (≠ observation_id) ─────────────
alter table public.photos
  add column if not exists analysis_status text not null default 'pending'
    check (analysis_status in ('pending', 'processing', 'complete', 'failed', 'skipped')),
  add column if not exists analyzed_at timestamptz,
  add column if not exists analysis_error text,
  add column if not exists quality_score numeric,
  add column if not exists capture_mode text
    check (capture_mode is null or capture_mode in ('camera', 'bulk_import')),
  add column if not exists original_timestamp timestamptz,
  add column if not exists sequence_number integer,
  add column if not exists client_upload_id text,
  add column if not exists upload_batch_id uuid;

comment on column public.photos.capture_mode is
  'Indice terrain : camera | bulk_import. N''influence pas observation_id ni la sélection PDF.';
comment on column public.photos.original_timestamp is
  'Horodatage EXIF ou capture client — indice parcours inspection uniquement.';
comment on column public.photos.sequence_number is
  'Ordre relatif dans le lot ou la session capture. Ne remplace pas observation_id.';
comment on column public.photos.analysis_status is
  'pending → processing → complete|failed|skipped (worker photo_analysis_jobs).';

create index if not exists photos_inspection_analysis_status_idx
  on public.photos (inspection_id, analysis_status);

create unique index if not exists photos_inspection_client_upload_uniq
  on public.photos (inspection_id, client_upload_id)
  where client_upload_id is not null and inspection_id is not null;

-- Backfill : lignes avec analysis JSON → complete
update public.photos
set
  analysis_status = 'complete',
  analyzed_at = coalesce(analyzed_at, now())
where analysis is not null
  and analysis_status = 'pending';

-- ── lots upload (progression bulk) ───────────────────────────────────────────
create table if not exists public.photo_upload_batches (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null,
  report_id uuid references public.reports (id) on delete set null,
  expected_count integer,
  created_at timestamptz not null default now()
);

create index if not exists photo_upload_batches_inspection_idx
  on public.photo_upload_batches (inspection_id, created_at desc);

-- ── file d'analyse IA ────────────────────────────────────────────────────────
create table if not exists public.photo_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null,
  report_id uuid references public.reports (id) on delete set null,
  photo_id uuid not null references public.photos (id) on delete cascade,
  batch_id uuid references public.photo_upload_batches (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'skipped')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 3,
  locked_at timestamptz,
  locked_by text,
  next_retry_at timestamptz,
  last_error text,
  input_fingerprint text not null,
  language text not null default 'fr' check (language in ('fr', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists photo_analysis_jobs_pending_idx
  on public.photo_analysis_jobs (status, next_retry_at nulls first, created_at)
  where status in ('pending', 'processing');

create index if not exists photo_analysis_jobs_inspection_idx
  on public.photo_analysis_jobs (inspection_id, status);

create unique index if not exists photo_analysis_jobs_one_active_per_photo
  on public.photo_analysis_jobs (photo_id)
  where status in ('pending', 'processing');

comment on table public.photo_analysis_jobs is
  'File persistante vision IA par photo. Une seule job active (pending/processing) par photo_id.';

alter table public.photo_analysis_jobs enable row level security;
revoke all on public.photo_analysis_jobs from public;
grant select, insert, update, delete on public.photo_analysis_jobs to service_role;
grant select, insert, update, delete on public.photo_analysis_jobs to postgres;

alter table public.photo_upload_batches enable row level security;
revoke all on public.photo_upload_batches from public;
grant select, insert, update, delete on public.photo_upload_batches to service_role;
grant select, insert, update, delete on public.photo_upload_batches to postgres;

-- Claim batch (worker) — pattern claim_report_lock / email queue
create or replace function public.claim_photo_analysis_jobs(
  p_limit integer,
  p_worker_id text
)
returns setof public.photo_analysis_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select j.id
    from public.photo_analysis_jobs j
    where j.status = 'pending'
      and (j.next_retry_at is null or j.next_retry_at <= now())
      and j.attempt_count < j.max_attempts
      and (
        j.locked_at is null
        or j.locked_at < now() - interval '10 minutes'
      )
    order by j.created_at
    limit greatest(1, least(coalesce(p_limit, 5), 25))
    for update skip locked
  )
  update public.photo_analysis_jobs j
  set
    status = 'processing',
    locked_at = now(),
    locked_by = coalesce(nullif(trim(p_worker_id), ''), 'worker'),
    attempt_count = j.attempt_count + 1,
    updated_at = now()
  from picked p
  where j.id = p.id
  returning j.*;
end;
$$;

comment on function public.claim_photo_analysis_jobs(integer, text) is
  'Réserve jusqu''à p_limit jobs pending pour le worker photo-analysis.';

grant execute on function public.claim_photo_analysis_jobs(integer, text) to service_role;
grant execute on function public.claim_photo_analysis_jobs(integer, text) to postgres;
