-- Phase 8I — Profil inspecteur (par utilisateur, hors tables organisations / billing).

create table if not exists public.inspector_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  company_name text,
  logo_url text,
  address text,
  phone text,
  email text,
  website text,
  first_name text,
  last_name text,
  title text,
  association text,
  certification_number text,
  license_number text,
  insurance_provider text,
  policy_number text,
  expiry_date date,
  signature_image_url text,
  default_language text default 'fr',
  default_province text default 'ca_qc',
  default_report_template text default 'QC_2027',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.inspector_profiles is
  'Profil professionnel inspecteur (InspectFlow 8I) — une ligne par auth.users.id.';

create index if not exists inspector_profiles_updated_at_idx
  on public.inspector_profiles (updated_at desc);

alter table public.inspector_profiles enable row level security;

drop policy if exists "inspector_profiles_select_own" on public.inspector_profiles;
create policy "inspector_profiles_select_own"
  on public.inspector_profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "inspector_profiles_insert_own" on public.inspector_profiles;
create policy "inspector_profiles_insert_own"
  on public.inspector_profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "inspector_profiles_update_own" on public.inspector_profiles;
create policy "inspector_profiles_update_own"
  on public.inspector_profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "inspector_profiles_delete_own" on public.inspector_profiles;
create policy "inspector_profiles_delete_own"
  on public.inspector_profiles
  for delete
  to authenticated
  using (auth.uid() = user_id);
