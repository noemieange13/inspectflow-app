-- Phase 6D — invitations organisation (onboarding équipe).

create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email_hash text not null,
  role text not null check (role in ('admin', 'inspector', 'assistant')),
  invited_by_user_id uuid not null,
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  created_at timestamptz not null default now()
);

create index if not exists organization_invitations_org_idx
  on public.organization_invitations (organization_id, status, created_at desc);

create index if not exists organization_invitations_token_hash_idx
  on public.organization_invitations (token_hash)
  where status = 'pending';

create unique index if not exists organization_invitations_pending_email_org
  on public.organization_invitations (organization_id, email_hash)
  where status = 'pending';

comment on table public.organization_invitations is
  'Invitations équipe — token_hash uniquement (jamais le jeton brut).';

alter table public.organization_invitations enable row level security;
revoke all on public.organization_invitations from public;
grant select, insert, update on public.organization_invitations to service_role;
grant select, insert, update on public.organization_invitations to postgres;

-- Audit 5B / 6D
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
    'inspection_unassigned',
    'organization_invitation_sent',
    'organization_member_joined'
  ));
