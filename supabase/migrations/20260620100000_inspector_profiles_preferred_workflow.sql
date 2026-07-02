-- Phase 8P — préférence de parcours inspecteur (terrain vs après inspection).

alter table public.inspector_profiles
  add column if not exists preferred_workflow text not null default 'field_assistant';

comment on column public.inspector_profiles.preferred_workflow is
  'field_assistant | post_inspection — mémorisé au choix nouvelle inspection (8P).';

alter table public.inspector_profiles
  drop constraint if exists inspector_profiles_preferred_workflow_check;

alter table public.inspector_profiles
  add constraint inspector_profiles_preferred_workflow_check
  check (preferred_workflow in ('field_assistant', 'post_inspection'));
