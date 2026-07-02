-- Phase 6C — assignations d'inspection (collaboration équipe).

create table if not exists public.inspection_assignments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  assigned_to_user_id uuid not null,
  assigned_by_user_id uuid not null,
  role text not null check (role in ('lead_inspector', 'assistant')),
  status text not null default 'active' check (status in ('active', 'removed')),
  created_at timestamptz not null default now()
);

create index if not exists inspection_assignments_report_idx
  on public.inspection_assignments (report_id, status);

create index if not exists inspection_assignments_assignee_idx
  on public.inspection_assignments (assigned_to_user_id, status)
  where status = 'active';

create unique index if not exists inspection_assignments_active_user_report
  on public.inspection_assignments (report_id, assigned_to_user_id)
  where status = 'active';

comment on table public.inspection_assignments is
  'Assignation rapport → membre (lead_inspector ou assistant). Statut removed = retrait sans suppression.';

alter table public.inspection_assignments enable row level security;
revoke all on public.inspection_assignments from public;
grant select, insert, update on public.inspection_assignments to service_role;
grant select, insert, update on public.inspection_assignments to postgres;

-- Audit 5B / 6C
alter table public.inspection_audit_events
  drop constraint if exists inspection_audit_events_event_type_check;

alter table public.inspection_audit_events
  add constraint inspection_audit_events_event_type_check
  check (event_type in (
    'photo_uploaded',
    'photo_analyzed',
    'ai_observation_created',
    'inspector_modified',
    'compliance_validated',
    'pdf_generated',
    'access_denied',
    'inspection_assigned',
    'inspection_unassigned'
  ));
