import { clearPublicUrlCache } from "./publicUrlCache";
import { clearSignedUrlPromiseCache } from "./resolvePhotoSrc";

/**
 * Vide les caches URL (public + promesses signées).
 * À appeler si l’utilisateur change de contexte, en tests, ou après changement de bucket.
 */
export function clearPhotoUrlCache(): void {
  clearPublicUrlCache();
  clearSignedUrlPromiseCache();
}
