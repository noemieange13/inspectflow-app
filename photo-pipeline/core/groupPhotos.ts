import type { ClassifiedPhotoRow } from "./types";

/** section → constat_id → photos[] */
export type GroupedPhotos = Record<
  string,
  Record<string, ClassifiedPhotoRow["photo"][]>
>;

const FALLBACK_SECTION = "Autres";
const FALLBACK_CONSTAT = "none";

export function groupPhotos(classified: ClassifiedPhotoRow[]): GroupedPhotos {
  const grouped: GroupedPhotos = {};

  for (const row of classified) {
    const section = row.section_name?.trim() || FALLBACK_SECTION;
    const constat = row.constat_id?.trim() || FALLBACK_CONSTAT;

    if (!grouped[section]) grouped[section] = {};
    if (!grouped[section][constat]) grouped[section][constat] = [];

    const bucket = grouped[section][constat];
    const id = row.photo.id;
    if (!bucket.some((p) => p.id === id)) {
      bucket.push(row.photo);
    }
  }

  return grouped;
}
