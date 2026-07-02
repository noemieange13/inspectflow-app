-- Clauses légales : définitions + traductions FR/EN (symétrie pour rapports bilingues).

create table if not exists public.qc_legal_clause_defs (
  id uuid primary key,
  code text not null unique,
  province text not null,
  section text not null,
  mandatory boolean not null default true,
  version text,
  applies_if text,
  created_at timestamptz not null default now()
);

create index if not exists qc_legal_clause_defs_province_idx
  on public.qc_legal_clause_defs (province);

comment on table public.qc_legal_clause_defs is
  'Définition canonique d’une clause (sans texte linguistique).';

create table if not exists public.qc_legal_clause_translations (
  id uuid primary key default gen_random_uuid(),
  clause_def_id uuid not null references public.qc_legal_clause_defs (id) on delete cascade,
  language text not null check (language in ('fr', 'en')),
  title text,
  body text not null,
  is_official boolean not null default true,
  unique (clause_def_id, language)
);

create index if not exists qc_legal_clause_translations_def_idx
  on public.qc_legal_clause_translations (clause_def_id);

comment on table public.qc_legal_clause_translations is
  'Textes par langue ; validation juridique distincte FR vs EN.';

-- Ancienne table plate → définitions + FR
insert into public.qc_legal_clause_defs (id, code, province, section, mandatory, version, applies_if, created_at)
select
  id,
  lower(
    regexp_replace(
      province || '_' || section || '_' || coalesce(version, 'v') || '_' || substr(id::text, 1, 8),
      '[^a-z0-9_]+',
      '_',
      'gi'
    )
  ),
  province,
  section,
  mandatory,
  version,
  applies_if,
  created_at
from public.qc_legal_clauses;

insert into public.qc_legal_clause_translations (clause_def_id, language, body, is_official)
select id, 'fr', clause, true
from public.qc_legal_clauses;

-- EN (équivalence à valider juridiquement) — sous-requête filtre les `null`.
insert into public.qc_legal_clause_translations (clause_def_id, language, body, is_official)
select s.clause_def_id, 'en', s.en_body, true
from (
  select
    d.id as clause_def_id,
    case
      when d.province = 'CA' and d.section = 'general' then
        'This report is based on a non-destructive visual inspection performed in accordance with recognized building inspection practice standards in Canada.'
      when d.province = 'CA' and d.section = 'limitations' and tfr.body like '%garantie%' then
        'The inspection does not constitute a guarantee or assurance regarding the future condition of the building.'
      when d.province = 'CA' and d.section = 'limitations' and tfr.body like '%inaccessibles%' then
        'Some components may be inaccessible or concealed and cannot be evaluated.'
      when d.province = 'QC' and d.section = 'general' then
        'Inspection carried out in accordance with building inspection practice standards in force in Québec (2027 update).'
      when d.province = 'QC' and d.section = 'scope' then
        'The inspection is limited to visible and accessible elements at the time of the visit.'
      when d.province = 'QC' and d.section = 'client' then
        'This report is intended solely for the named client and may not be used by third parties without authorization.'
      when d.province = 'QC' and d.section = 'limitations' and d.applies_if is null then
        'The inspection does not replace specialized expertise (structural, engineering, etc.).'
      when d.province = 'QC' and d.section = 'recommendations' and d.applies_if is null then
        'Further specialized assessments are recommended when anomalies are observed.'
      when d.province = 'QC' and d.section = 'recommendations' and d.applies_if is not null then
        'When anomalies are observed on the roof, further assessment by a qualified professional may be recommended.'
      else null
    end as en_body
  from public.qc_legal_clause_defs d
  inner join public.qc_legal_clause_translations tfr
    on tfr.clause_def_id = d.id and tfr.language = 'fr'
  where not exists (
    select 1
    from public.qc_legal_clause_translations e
    where e.clause_def_id = d.id and e.language = 'en'
  )
) s
where s.en_body is not null;

-- Aucune ligne EN sans texte (sinon migration invalide)
do $$
declare
  n int;
begin
  select count(*) into n
  from public.qc_legal_clause_defs d
  where not exists (
    select 1 from public.qc_legal_clause_translations t
    where t.clause_def_id = d.id and t.language = 'en'
  );
  if n > 0 then
    raise exception 'qc_legal_clauses i18n: % définition(s) sans traduction EN', n;
  end if;
end $$;

drop policy if exists "qc_legal_clauses_select_all" on public.qc_legal_clauses;

drop table if exists public.qc_legal_clauses;

alter table public.qc_legal_clause_defs enable row level security;
alter table public.qc_legal_clause_translations enable row level security;

create policy "qc_legal_clause_defs_select_all"
  on public.qc_legal_clause_defs
  for select
  to anon, authenticated
  using (true);

create policy "qc_legal_clause_translations_select_all"
  on public.qc_legal_clause_translations
  for select
  to anon, authenticated
  using (true);

grant select on public.qc_legal_clause_defs to anon, authenticated, service_role;
grant select on public.qc_legal_clause_translations to anon, authenticated, service_role;
