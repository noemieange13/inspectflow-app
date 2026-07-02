-- Phase 8Q — calibration style rapport inspecteur (préférences + profil importé).

alter table public.inspector_profiles
  add column if not exists inspector_report_style_v1 jsonb,
  add column if not exists inspector_style_profile_v1 jsonb;

comment on column public.inspector_profiles.inspector_report_style_v1 is
  'Préférences rédaction rapport — detail_level, tone, photo_density, recommendation_style (8Q).';

comment on column public.inspector_profiles.inspector_style_profile_v1 is
  'Profil style calibré depuis import PDF — signaux agrégés sans PII (8Q).';

update public.inspector_profiles
set inspector_report_style_v1 = coalesce(
  inspector_report_style_v1,
  '{"version":"1","detail_level":"detailed","tone":"educational","photo_density":"standard","recommendation_style":"explanatory"}'::jsonb
)
where inspector_report_style_v1 is null;
