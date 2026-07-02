-- Phase 6A — organisations, équipes, permissions (compat solo via org personal).

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('personal', 'company')),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists organizations_created_by_idx
  on public.organizations (created_by, created_at desc);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner', 'admin', 'inspector', 'assistant')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  created_at timestamptz not null default now(),
  constraint organization_members_org_user_unique unique (organization_id, user_id)
);

create index if not exists organization_members_user_idx
  on public.organization_members (user_id, status);

alter table public.reports
  add column if not exists organization_id uuid references public.organizations (id) on delete set null;

create index if not exists idx_reports_organization_id
  on public.reports (organization_id)
  where organization_id is not null;

comment on table public.organizations is
  'Espace solo (personal) ou firme (company). Chaque utilisateur legacy reçoit une org personal.';

comment on table public.organization_members is
  'Membres et rôles — owner, admin, inspector, assistant.';

-- Backfill : une organisation personal par reports.user_id distinct.
--
-- Cause blocage « Report is immutable » (P0001) :
--   public.prevent_update_reports() (20260420120000) n'autorise les UPDATE que si une colonne
--   pipeline est modifiée (payload, pdf_path, is_locked, …). organization_id n'est pas dans
--   cette whitelist : un UPDATE qui ne change que organization_id sur un rapport déverrouillé
--   lève l'exception sans toucher payload / PDF / signatures.
-- Mitigation (migration historique uniquement) : désactiver les triggers USER le temps du
--   backfill — seule organization_id est écrite ; contenu rapport et ledger inchangés.
alter table public.reports disable trigger user;

do $$
declare
  r record;
  org_id uuid;
begin
  for r in
    select distinct user_id
    from public.reports
    where user_id is not null
  loop
    select o.id into org_id
    from public.organizations o
    inner join public.organization_members m on m.organization_id = o.id
    where o.type = 'personal'
      and o.created_by = r.user_id
      and m.user_id = r.user_id
      and m.role = 'owner'
    limit 1;

    if org_id is null then
      insert into public.organizations (name, type, created_by)
      values ('Personal', 'personal', r.user_id)
      returning id into org_id;

      insert into public.organization_members (organization_id, user_id, role, status)
      values (org_id, r.user_id, 'owner', 'active')
      on conflict (organization_id, user_id) do nothing;
    end if;

    update public.reports
    set organization_id = org_id
    where user_id = r.user_id
      and organization_id is null;
  end loop;
end;
$$;

alter table public.reports enable trigger user;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
revoke all on public.organizations from public;
revoke all on public.organization_members from public;
grant select, insert, update, delete on public.organizations to service_role;
grant select, insert, update, delete on public.organization_members to service_role;
grant select, insert, update, delete on public.organizations to postgres;
grant select, insert, update, delete on public.organization_members to postgres;

-- Audit 5B : access_denied
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
    'access_denied'
  ));
