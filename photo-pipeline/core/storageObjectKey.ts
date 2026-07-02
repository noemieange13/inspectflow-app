import type { PhotoUrlFields } from "./types";
import { isDirectImageUrl, trimStr } from "./strings";

/**
 * Clé objet Storage (pas une URL). Si `storage_path` contient une URL complète,
 * on tente le fallback `path` (données legacy / migrations).
 */
export function storageObjectKey(photo: PhotoUrlFields): string | null {
  const sp = trimStr(photo.storage_path);
  if (sp && !isDirectImageUrl(sp)) return sp;
  const legacy = trimStr(photo.path);
  if (legacy && !isDirectImageUrl(legacy)) return legacy;
  return null;
}
