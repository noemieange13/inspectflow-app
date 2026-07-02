-- Registre des versions réglementaires / normatives (traçabilité hors code seulement).

create table if not exists public.qc_regulatory_versions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  version text not null,
  effective_date date,
  source text,
  notes text,
  created_at timestamptz not null default now()
);

comment on table public.qc_regulatory_versions is
  'Référentiel normatif (RBQ, normes de pratique, etc.) — liens métier vers les clauses via code / notes.';

insert into public.qc_regulatory_versions (code, version, effective_date, source, notes)
values (
  'QC_NORMES_PRATIQUE_2027',
  '2027',
  null,
  'Québec — normes de pratique inspection bâtiment (contexte échéance 2027)',
  'À mettre à jour lors de la publication officielle. Ne remplace pas l’avis juridique.'
)
on conflict (code) do nothing;

alter table public.qc_regulatory_versions enable row level security;

create policy "qc_regulatory_versions_select_all"
  on public.qc_regulatory_versions
  for select
  to anon, authenticated
  using (true);

grant select on public.qc_regulatory_versions to anon, authenticated, service_role;
