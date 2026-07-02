-- Phase 8I — préférences UI vs langue rapport client (distinctes de default_language legacy).

alter table public.inspector_profiles
  add column if not exists preferred_ui_language text not null default 'fr-CA',
  add column if not exists default_client_report_language text not null default 'fr-CA';

comment on column public.inspector_profiles.preferred_ui_language is
  'Langue interface inspecteur (fr-CA | en-CA). Alias historique : default_language.';

comment on column public.inspector_profiles.default_client_report_language is
  'Langue par défaut du rapport remis au client (fr-CA | en-CA).';

-- Backfill depuis default_language legacy (fr | en).
update public.inspector_profiles
set
  preferred_ui_language = case
    when lower(trim(coalesce(default_language, 'fr'))) like 'en%' then 'en-CA'
    else 'fr-CA'
  end,
  default_client_report_language = case
    when lower(trim(coalesce(default_language, 'fr'))) like 'en%' then 'en-CA'
    else 'fr-CA'
  end
where preferred_ui_language = 'fr-CA'
  and default_client_report_language = 'fr-CA'
  and default_language is not null
  and lower(trim(default_language)) like 'en%';
