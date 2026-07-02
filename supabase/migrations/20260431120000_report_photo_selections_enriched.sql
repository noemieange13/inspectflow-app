-- Phase Photo Intelligence étape 1 : modèle enrichi pour sélection photo persistante.

alter table public.report_photo_selections
  add column if not exists observation_id text,
  add column if not exists report_selected boolean not null default true,
  add column if not exists selection_source text not null default 'inspector'
    check (selection_source in ('ai', 'inspector', 'compliance')),
  add column if not exists relevance_score numeric,
  add column if not exists quality_score numeric,
  add column if not exists duplicate_group text,
  add column if not exists selection_reason text,
  add column if not exists ai_recommended boolean not null default false,
  add column if not exists ai_rank integer;

comment on column public.report_photo_selections.observation_id is
  'Copie dénormalisée de photos.observation_id au moment de la décision.';
comment on column public.report_photo_selections.report_selected is
  'Si false, la photo est explicitement exclue du rapport (ex. retrait inspecteur).';
comment on column public.report_photo_selections.selection_source is
  'Origine de la décision : inspector > compliance > ai (priorité merge applicative).';
comment on column public.report_photo_selections.duplicate_group is
  'Groupe de dédup (ex. file_hash) : une seule photo retenue par groupe en sélection IA.';

-- Lignes historiques (tier only) : sélection explicite, conservée comme inspecteur.
update public.report_photo_selections
set
  report_selected = true,
  selection_source = 'inspector'
where report_selected is true;

create index if not exists report_photo_selections_report_selected_idx
  on public.report_photo_selections (report_id, report_selected);

create index if not exists report_photo_selections_source_idx
  on public.report_photo_selections (report_id, selection_source);

comment on table public.report_photo_selections is
  'Décisions de sélection photo par rapport (tiers, scores, source). Les exclusions explicites sont stockées avec report_selected=false.';
