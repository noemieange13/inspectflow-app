-- Phase 6B — plans & usage par organisation (monitor_only côté app).

create table if not exists public.organization_plans (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  plan text not null default 'solo' check (plan in ('trial', 'solo', 'team', 'enterprise')),
  limits jsonb not null default '{}'::jsonb,
  usage_period text not null default 'month' check (usage_period in ('month')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organization_plans_plan_idx
  on public.organization_plans (plan);

comment on table public.organization_plans is
  'Plan commercial et limites JSON par organisation (une ligne par org).';

create table if not exists public.organization_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  inspections_created integer not null default 0 check (inspections_created >= 0),
  photos_uploaded integer not null default 0 check (photos_uploaded >= 0),
  ai_photos_processed integer not null default 0 check (ai_photos_processed >= 0),
  pdf_generated integer not null default 0 check (pdf_generated >= 0),
  storage_used_mb numeric(14, 2) not null default 0 check (storage_used_mb >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_usage_org_period_unique unique (organization_id, period_start)
);

create index if not exists organization_usage_org_period_idx
  on public.organization_usage (organization_id, period_start desc);

comment on table public.organization_usage is
  'Compteurs d''usage mensuels — jamais supprimés, nouvelle période = nouvelle ligne.';

-- Backfill : orgs existantes sans plan → solo avec limites par défaut.
insert into public.organization_plans (organization_id, plan, limits, usage_period)
select
  o.id,
  'solo',
  jsonb_build_object(
    'inspections_per_month', 50,
    'ai_photos_per_month', 100,
    'members', 1,
    'storage_gb', 5
  ),
  'month'
from public.organizations o
where not exists (
  select 1 from public.organization_plans op where op.organization_id = o.id
);

alter table public.organization_plans enable row level security;
alter table public.organization_usage enable row level security;
revoke all on public.organization_plans from public;
revoke all on public.organization_usage from public;
grant select, insert, update, delete on public.organization_plans to service_role;
grant select, insert, update, delete on public.organization_usage to service_role;
grant select, insert, update, delete on public.organization_plans to postgres;
grant select, insert, update, delete on public.organization_usage to postgres;
