/**
 * Champs minimaux pour résoudre une URL d’affichage (sans coupler au schéma DB complet).
 */
export type Photo = {
  id?: string;
  photo_url?: string | null;
  storage_path?: string | null;
  /** @deprecated Préférer `storage_path`. */
  path?: string | null;
};

export type PhotoUrlFields = Pick<
  Photo,
  "photo_url" | "storage_path" | "path"
>;

/** Ligne `photos` telle qu’affichée dans les grilles inspection. */
export type DisplayPhoto = {
  id: string;
  storage_path: string | null;
  path: string | null;
  photo_url: string | null;
  photo_number: number | null;
};

export type ClassifiedPhotoRow = {
  section_name: string | null;
  constat_id: string | null;
  photo_id: string;
  photo: DisplayPhoto;
};
