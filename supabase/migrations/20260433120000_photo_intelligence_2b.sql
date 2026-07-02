-- Phase Photo Intelligence 2B : doublons visuels + suivi duplicate leader.

alter table public.photos
  add column if not exists perceptual_hash text,
  add column if not exists duplicate_group uuid,
  add column if not exists duplicate_of_photo_id uuid references public.photos (id) on delete set null;

comment on column public.photos.perceptual_hash is
  'dHash hex (64 bits) — regroupement visuel, pas lien constat.';
comment on column public.photos.duplicate_group is
  'Identifiant de cluster visuel ; leader = duplicate_of_photo_id IS NULL.';
comment on column public.photos.duplicate_of_photo_id is
  'Si non null : doublon visuel ; vision IA skippée, analysis copiée ou skipped.';

create index if not exists photos_inspection_perceptual_hash_idx
  on public.photos (inspection_id, perceptual_hash)
  where perceptual_hash is not null;

create index if not exists photos_inspection_duplicate_group_idx
  on public.photos (inspection_id, duplicate_group)
  where duplicate_group is not null;

-- Comptage progression sans charger toute la galerie (500+ lignes).
create or replace function public.count_photos_analysis_status(p_inspection_id uuid)
returns table (
  analysis_status text,
  cnt bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select p.analysis_status::text, count(*)::bigint
  from public.photos p
  where p.inspection_id = p_inspection_id
  group by p.analysis_status;
$$;

comment on function public.count_photos_analysis_status(uuid) is
  'Agrégats analysis_status pour progression inspection (évite select * 500).';

grant execute on function public.count_photos_analysis_status(uuid) to service_role;
grant execute on function public.count_photos_analysis_status(uuid) to postgres;

create or replace function public.count_photos_for_inspection(p_inspection_id uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint from public.photos where inspection_id = p_inspection_id;
$$;

grant execute on function public.count_photos_for_inspection(uuid) to service_role;
grant execute on function public.count_photos_for_inspection(uuid) to postgres;
