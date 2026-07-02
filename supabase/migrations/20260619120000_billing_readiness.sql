-- Phase 7A — billing readiness (sans paiement actif, monitor_only).

create table if not exists public.billing_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  billing_status text not null default 'trial' check (
    billing_status in ('trial', 'active', 'past_due', 'cancelled')
  ),
  billing_provider text not null default 'manual' check (
    billing_provider in ('manual', 'stripe')
  ),
  external_customer_id text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_accounts_status_idx
  on public.billing_accounts (billing_status);

comment on table public.billing_accounts is
  'Compte facturation par org — préparation Stripe, aucun blocage produit (monitor_only).';

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  event_type text not null check (
    event_type in (
      'trial_started',
      'plan_changed',
      'payment_failed',
      'subscription_cancelled'
    )
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists billing_events_org_idx
  on public.billing_events (organization_id, created_at desc);

comment on table public.billing_events is
  'Journal billing append-only (côté app — pas de trigger delete).';

-- Backfill orgs existantes → active / manual (compat 6B solo).
insert into public.billing_accounts (
  organization_id,
  billing_status,
  billing_provider,
  trial_started_at,
  trial_ends_at
)
select
  o.id,
  case when coalesce(op.plan, 'solo') = 'trial' then 'trial' else 'active' end,
  'manual',
  case when coalesce(op.plan, 'solo') = 'trial' then o.created_at else null end,
  case
    when coalesce(op.plan, 'solo') = 'trial' then o.created_at + interval '14 days'
    else null
  end
from public.organizations o
left join public.organization_plans op on op.organization_id = o.id
where not exists (
  select 1 from public.billing_accounts ba where ba.organization_id = o.id
);

alter table public.billing_accounts enable row level security;
alter table public.billing_events enable row level security;
revoke all on public.billing_accounts from public;
revoke all on public.billing_events from public;
grant select, insert, update on public.billing_accounts to service_role;
grant select, insert on public.billing_events to service_role;
grant select, insert, update on public.billing_accounts to postgres;
grant select, insert on public.billing_events to postgres;

-- Audit inspection — billing_plan_changed
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
    'organization_member_joined',
    'billing_plan_changed'
  ));
