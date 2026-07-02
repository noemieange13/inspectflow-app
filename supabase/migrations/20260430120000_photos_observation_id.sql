-- Lien stable photo → constat (observation.id côté payload Zero Draft).
-- Pas de FK vers une table observations : l'UUID est porté par payload.entries[].id / sections[].id.

alter table public.photos
  add column if not exists observation_id uuid;

comment on column public.photos.observation_id is
  'UUID du constat (payload.entries[].id). Seule source de vérité pour l''association photo ↔ observation au PDF.';

create index if not exists photos_observation_id_idx
  on public.photos (observation_id)
  where observation_id is not null;
