-- Phase 8I add-on — langues disponibles pour les rapports (FR/EN).

alter table public.inspector_profiles
  add column if not exists available_report_languages text[] not null
  default array['fr','en']::text[];

comment on column public.inspector_profiles.available_report_languages is
  'Langues que l''inspecteur peut choisir pour la livraison du rapport (ex. {fr,en}).';
