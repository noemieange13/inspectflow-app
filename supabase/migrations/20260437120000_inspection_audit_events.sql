-- Phase 5B — journal chronologique inspection (append-only, sans PII).

create table if not exists public.inspection_audit_events (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid,
  report_id uuid not null references public.reports (id) on delete cascade,
  event_type text not null check (event_type in (
    'photo_uploaded',
    'photo_analyzed',
    'ai_observation_created',
    'inspector_modified',
    'compliance_validated',
    'pdf_generated'
  )),
  actor_type text not null check (actor_type in ('system', 'ai', 'inspector')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists inspection_audit_events_report_idx
  on public.inspection_audit_events (report_id, created_at desc);

create index if not exists inspection_audit_events_inspection_idx
  on public.inspection_audit_events (inspection_id, created_at desc)
  where inspection_id is not null;

create index if not exists inspection_audit_events_type_idx
  on public.inspection_audit_events (event_type, created_at desc);

comment on table public.inspection_audit_events is
  'Trace chronologique inspection — append-only. Métadonnées : IDs + hashes uniquement.';

alter table public.inspection_audit_events enable row level security;
revoke all on public.inspection_audit_events from public;
grant select, insert on public.inspection_audit_events to service_role;
grant select, insert on public.inspection_audit_events to postgres;

create or replace function public.prevent_inspection_audit_events_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'inspection_audit_events is append-only';
end;
$$;

drop trigger if exists inspection_audit_events_no_update on public.inspection_audit_events;
create trigger inspection_audit_events_no_update
  before update or delete on public.inspection_audit_events
  for each row
  execute function public.prevent_inspection_audit_events_mutation();
