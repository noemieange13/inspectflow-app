-- Dédup par inspection : même fichier dans deux inspections = deux lignes, même storage_path possible.
-- Remplace une éventuelle contrainte globale (owner_id, file_hash) incompatible avec ce modèle.

ALTER TABLE public.photos DROP CONSTRAINT IF EXISTS photos_owner_id_file_hash_key;
ALTER TABLE public.photos DROP CONSTRAINT IF EXISTS photos_file_hash_owner_id_key;

DROP INDEX IF EXISTS public.photos_owner_id_file_hash_uniq;
DROP INDEX IF EXISTS public.photos_owner_file_hash_uniq;
DROP INDEX IF EXISTS public.photos_file_hash_owner_unique;

CREATE UNIQUE INDEX IF NOT EXISTS photos_inspection_file_hash_uniq
ON public.photos (owner_id, inspection_id, file_hash)
WHERE file_hash IS NOT NULL;
