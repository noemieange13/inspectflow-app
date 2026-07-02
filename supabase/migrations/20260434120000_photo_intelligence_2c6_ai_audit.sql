-- Phase Photo Intelligence 2C-6 : audit coût IA + agrégation par inspection + budget.

-- ── Audit unitaire par appel vision ───────────────────────────────────────────
create table if not exists public.photo_ai_audit (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null,
  photo_id uuid not null references public.photos (id) on delete cascade,
  job_id uuid references public.photo_analysis_jobs (id) on delete set null,
  ai_model text not null,
  prompt_version text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  estimated_cost_usd numeric(14, 8) not null default 0 check (estimated_cost_usd >= 0),
  analysis_duration_ms integer not null default 0 check (analysis_duration_ms >= 0),
  processed_at timestamptz not null default now()
);

create index if not exists photo_ai_audit_inspection_idx
  on public.photo_ai_audit (inspection_id, processed_at desc);

create index if not exists photo_ai_audit_photo_idx
  on public.photo_ai_audit (photo_id, processed_at desc);

comment on table public.photo_ai_audit is
  'Traçabilité coût IA par photo analysée (vision). Les doublons skipped n''y figurent pas.';

alter table public.photo_ai_audit enable row level security;
revoke all on public.photo_ai_audit from public;
grant select, insert, update, delete on public.photo_ai_audit to service_role;
grant select, insert, update, delete on public.photo_ai_audit to postgres;

-- ── Agrégation inspection ─────────────────────────────────────────────────────
create table if not exists public.inspection_ai_usage (
  inspection_id uuid primary key,
  photos_analyzed integer not null default 0 check (photos_analyzed >= 0),
  photos_skipped_duplicate integer not null default 0 check (photos_skipped_duplicate >= 0),
  total_input_tokens bigint not null default 0 check (total_input_tokens >= 0),
  total_output_tokens bigint not null default 0 check (total_output_tokens >= 0),
  total_tokens bigint not null default 0 check (total_tokens >= 0),
  estimated_cost_usd numeric(14, 8) not null default 0 check (estimated_cost_usd >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.inspection_ai_usage is
  'Coût IA cumulé par inspection — alimenté par le worker vision, jamais par les skips doublon coût.';

alter table public.inspection_ai_usage enable row level security;
revoke all on public.inspection_ai_usage from public;
grant select, insert, update, delete on public.inspection_ai_usage to service_role;
grant select, insert, update, delete on public.inspection_ai_usage to postgres;

-- ── Budget : jobs en pause ────────────────────────────────────────────────────
alter table public.photo_analysis_jobs
  drop constraint if exists photo_analysis_jobs_status_check;

alter table public.photo_analysis_jobs
  add constraint photo_analysis_jobs_status_check
  check (status in (
    'pending',
    'processing',
    'completed',
    'failed',
    'skipped',
    'paused_budget'
  ));

comment on column public.photo_analysis_jobs.status is
  'pending|processing|completed|failed|skipped|paused_budget (plafond IA atteint).';
