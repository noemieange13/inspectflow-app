-- Phase 4A — métriques qualité : corrections inspecteur vs propositions IA.
-- Aucune PII client ; pas d'entraînement automatique.

create table if not exists public.inspection_ai_feedback (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  inspection_id uuid,
  observation_id text not null,
  change_type text not null check (change_type in (
    'accepted',
    'edited_text',
    'changed_severity',
    'deleted',
    'added_manual'
  )),
  original_ai jsonb,
  inspector_final jsonb,
  feedback_category text check (feedback_category is null or feedback_category in (
    'ai_too_aggressive',
    'ai_too_minor',
    'wording_change',
    'false_positive',
    'missed_issue'
  )),
  event_fingerprint text not null,
  created_at timestamptz not null default now(),
  constraint inspection_ai_feedback_report_fingerprint_unique
    unique (report_id, event_fingerprint)
);

create index if not exists inspection_ai_feedback_report_idx
  on public.inspection_ai_feedback (report_id, created_at desc);

create index if not exists inspection_ai_feedback_inspection_idx
  on public.inspection_ai_feedback (inspection_id, created_at desc)
  where inspection_id is not null;

create index if not exists inspection_ai_feedback_category_idx
  on public.inspection_ai_feedback (feedback_category, created_at desc)
  where feedback_category is not null;

comment on table public.inspection_ai_feedback is
  'Métriques qualité IA : écarts entre snapshot IA et constats finaux inspecteur. Idempotent par (report_id, event_fingerprint).';

alter table public.inspection_ai_feedback enable row level security;
revoke all on public.inspection_ai_feedback from public;
grant select, insert, update, delete on public.inspection_ai_feedback to service_role;
grant select, insert, update, delete on public.inspection_ai_feedback to postgres;
