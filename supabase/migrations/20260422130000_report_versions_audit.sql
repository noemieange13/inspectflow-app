-- Snapshots versionnés du payload rapport + journal d’édition léger.
-- Distinct du ledger cryptographique `public.report_events` (append_event / chaîne de hash).

create table if not exists public.report_versions (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  version_number int not null,
  created_at timestamptz not null default now(),
  created_by text not null check (created_by in ('user', 'ai', 'system')),
  source text not null,
  payload jsonb not null default '{}'::jsonb,
  diff_summary text,
  metadata jsonb not null default '{}'::jsonb,
  is_major boolean not null default false,
  confidence_score numeric(6, 4),
  constraint report_versions_report_version_unique unique (report_id, version_number),
  constraint report_versions_version_number_positive check (version_number > 0)
);

create index if not exists report_versions_report_created_idx
  on public.report_versions (report_id, created_at desc);

comment on table public.report_versions is
  'Historique de snapshots JSON du payload rapport (audit, restauration). Max 50 versions actives par rapport (application côté service).';

-- Événements granulaires (optionnel) — ne pas confondre avec report_events (ledger SHA-256).
create table if not exists public.report_edit_events (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports (id) on delete cascade,
  version_id uuid references public.report_versions (id) on delete set null,
  event_type text not null,
  field_path text,
  created_at timestamptz not null default now(),
  actor text not null check (actor in ('user', 'ai', 'system')),
  context jsonb not null default '{}'::jsonb
);

create index if not exists report_edit_events_report_created_idx
  on public.report_edit_events (report_id, created_at desc);

comment on table public.report_edit_events is
  'Journal léger d’actions (IA / utilisateur) lié optionnellement à report_versions.';

alter table public.report_versions enable row level security;
alter table public.report_edit_events enable row level security;

revoke all on public.report_versions from public;
revoke all on public.report_edit_events from public;
grant select, insert, update, delete on public.report_versions to service_role;
grant select, insert, update, delete on public.report_edit_events to service_role;
grant select, insert, update, delete on public.report_versions to postgres;
grant select, insert, update, delete on public.report_edit_events to postgres;
