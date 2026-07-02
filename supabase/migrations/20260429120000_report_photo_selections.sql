-- Persistance DB de la sélection photo par rapport (multi-plateforme / API externe),
-- en complément du fallback payload `report_photo_selection_v1`.

create table if not exists public.report_photo_selections (
  report_id uuid not null references public.reports (id) on delete cascade,
  photo_id uuid not null,
  tier text not null default 'support' check (tier in ('critical', 'support')),
  updated_at timestamptz not null default now(),
  primary key (report_id, photo_id)
);

create index if not exists report_photo_selections_report_idx
  on public.report_photo_selections (report_id, updated_at desc);

create index if not exists report_photo_selections_photo_idx
  on public.report_photo_selections (photo_id);

comment on table public.report_photo_selections is
  'Photos retenues par rapport pour export (tiers: critical/support). Les photos exclues ne sont pas stockées.';

alter table public.report_photo_selections enable row level security;

revoke all on public.report_photo_selections from public;
grant select, insert, update, delete on public.report_photo_selections to service_role;
grant select, insert, update, delete on public.report_photo_selections to postgres;
