-- Clauses légales injectables (Canada + provinces) — référence audit / PDF.

create table if not exists public.qc_legal_clauses (
  id uuid primary key default gen_random_uuid(),
  province text not null,
  section text not null,
  clause text not null,
  mandatory boolean not null default true,
  version text,
  created_at timestamptz not null default now()
);

create index if not exists qc_legal_clauses_province_section_idx
  on public.qc_legal_clauses (province, section);

comment on table public.qc_legal_clauses is
  'Clauses types inspection (CA fédéral + provinces). Lecture publique ; mise à jour par migrations / admin.';

-- Canada (base commune)
insert into public.qc_legal_clauses (province, section, clause, version) values
(
  'CA',
  'general',
  'Ce rapport est basé sur une inspection visuelle non destructive effectuée selon les normes de pratique reconnues au Canada.',
  '2026'
),
(
  'CA',
  'limitations',
  'L''inspection ne constitue pas une garantie ni une assurance quant à l''état futur du bâtiment.',
  '2026'
),
(
  'CA',
  'limitations',
  'Certaines composantes peuvent être inaccessibles ou cachées et ne peuvent être évaluées.',
  '2026'
);

-- Québec (QC 2027)
insert into public.qc_legal_clauses (province, section, clause, version) values
(
  'QC',
  'general',
  'Inspection réalisée conformément aux normes de pratique en inspection de bâtiment en vigueur au Québec (mise à jour 2027).',
  'QC2027'
),
(
  'QC',
  'scope',
  'L''inspection est limitée aux éléments visibles et accessibles au moment de la visite.',
  'QC2027'
),
(
  'QC',
  'client',
  'Le rapport est destiné exclusivement au client mentionné et ne peut être utilisé par des tiers sans autorisation.',
  'QC2027'
),
(
  'QC',
  'limitations',
  'L''inspection ne remplace pas une expertise spécialisée (structure, ingénierie, etc.).',
  'QC2027'
),
(
  'QC',
  'recommendations',
  'Des expertises complémentaires sont recommandées lorsque des anomalies sont observées.',
  'QC2027'
);

alter table public.qc_legal_clauses enable row level security;

create policy "qc_legal_clauses_select_all"
  on public.qc_legal_clauses
  for select
  to anon, authenticated
  using (true);

grant select on public.qc_legal_clauses to anon, authenticated, service_role;
