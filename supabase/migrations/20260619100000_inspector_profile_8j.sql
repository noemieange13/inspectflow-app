-- Phase 8J — Extension profil inspecteur (additive, compat 8I).

alter table public.inspector_profiles
  add column if not exists organization_id uuid references public.organizations (id) on delete set null,
  add column if not exists display_name text,
  add column if not exists professional_title text,
  add column if not exists city text,
  add column if not exists province text,
  add column if not exists postal_code text,
  add column if not exists certifications jsonb not null default '[]'::jsonb,
  add column if not exists default_report_preferences jsonb not null default '{}'::jsonb,
  add column if not exists include_weather_default boolean not null default true;

comment on column public.inspector_profiles.organization_id is
  'Organisation active au moment de la dernière sauvegarde (lecture seule côté app).';

comment on column public.inspector_profiles.display_name is
  'Nom affiché inspecteur — backfill depuis first_name + last_name si absent.';

comment on column public.inspector_profiles.professional_title is
  'Titre professionnel (alias lib : title).';

comment on column public.inspector_profiles.certifications is
  'Liste JSON [{association, number, license}] — complète les champs plats 8I.';

comment on column public.inspector_profiles.default_report_preferences is
  'Préférences rapport JSON (template, province, options).';

comment on column public.inspector_profiles.include_weather_default is
  'Si true, nouvelles inspections reçoivent include_weather dans inspection_defaults_v1.';

create index if not exists inspector_profiles_organization_id_idx
  on public.inspector_profiles (organization_id)
  where organization_id is not null;

-- Backfill display_name depuis prénom + nom.
update public.inspector_profiles
set display_name = trim(
  coalesce(nullif(trim(first_name), ''), '') || ' ' ||
  coalesce(nullif(trim(last_name), ''), '')
)
where display_name is null
  and (coalesce(trim(first_name), '') <> '' or coalesce(trim(last_name), '') <> '');

-- Backfill professional_title depuis title legacy.
update public.inspector_profiles
set professional_title = title
where professional_title is null
  and title is not null
  and trim(title) <> '';

-- Backfill certifications jsonb depuis champs plats 8I.
update public.inspector_profiles
set certifications = jsonb_build_array(
  jsonb_strip_nulls(
    jsonb_build_object(
      'association', nullif(trim(association), ''),
      'number', nullif(trim(certification_number), ''),
      'license', nullif(trim(license_number), '')
    )
  )
)
where certifications = '[]'::jsonb
  and (
    coalesce(trim(association), '') <> ''
    or coalesce(trim(certification_number), '') <> ''
    or coalesce(trim(license_number), '') <> ''
  );

-- Backfill default_report_preferences depuis colonnes legacy.
update public.inspector_profiles
set default_report_preferences = jsonb_strip_nulls(
  jsonb_build_object(
    'template', nullif(trim(default_report_template), ''),
    'province', nullif(trim(default_province), ''),
    'available_languages', to_jsonb(available_report_languages)
  )
)
where default_report_preferences = '{}'::jsonb;

-- Bucket professional-assets (logos, signatures).
insert into storage.buckets (id, name, public)
values ('professional-assets', 'professional-assets', true)
on conflict (id) do nothing;

-- Lecture : membres actifs de l''org (chemin {org_id}/...).
drop policy if exists "professional_assets_select_org_member" on storage.objects;
create policy "professional_assets_select_org_member"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'professional-assets'
    and exists (
      select 1
      from public.organization_members m
      where m.organization_id = (storage.foldername(name))[1]::uuid
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

-- Écriture : membres actifs dans leur dossier org.
drop policy if exists "professional_assets_insert_org_member" on storage.objects;
create policy "professional_assets_insert_org_member"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'professional-assets'
    and exists (
      select 1
      from public.organization_members m
      where m.organization_id = (storage.foldername(name))[1]::uuid
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

-- Mise à jour / suppression : même règle (own uploads via chemin user_id dans filename).
drop policy if exists "professional_assets_update_org_member" on storage.objects;
create policy "professional_assets_update_org_member"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'professional-assets'
    and exists (
      select 1
      from public.organization_members m
      where m.organization_id = (storage.foldername(name))[1]::uuid
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

drop policy if exists "professional_assets_delete_org_member" on storage.objects;
create policy "professional_assets_delete_org_member"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'professional-assets'
    and exists (
      select 1
      from public.organization_members m
      where m.organization_id = (storage.foldername(name))[1]::uuid
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );
