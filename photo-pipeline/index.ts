/**
 * Surface publique : résolution d’URL, hooks, upload, UI.
 *
 * Détails bas niveau (`getUserUploadPublicUrl`, clés storage, cache interne) :
 * importer depuis `@/photo-pipeline/core/...` uniquement en usage interne (API, tests).
 */

export type {
  ClassifiedPhotoRow,
  DisplayPhoto,
  Photo,
  PhotoUrlFields,
} from "./core/types";

export { groupPhotos, type GroupedPhotos } from "./core/groupPhotos";

/** Contrat public de résolution — toujours passer par ces fonctions (cache + règles). */
export {
  PLACEHOLDER_IMAGE_PATH,
  resolveDirectPhotoUrlOnly,
  resolvePhotoDisplayUrlAsync,
  resolvePhotoDisplayUrlSync,
  shouldUseSignedPhotoUrls,
  warmPhotoUrlCache,
} from "./core/resolvePhotoSrc";

export { clearPhotoUrlCache } from "./core/cacheLifecycle";

export { useGroupedPhotos } from "./hooks/useGroupedPhotos";
export { useResolvedPhotoUrls } from "./hooks/useResolvedPhotoUrls";

export { createPhotoRecord, type CreatePhotoRecordInput } from "./client/createPhotoRecord";
export {
  uploadPhotoViaApi,
  type UploadPhotoApiError,
  type UploadPhotoApiSuccess,
  type UploadPhotoParams,
} from "./client/uploadPhoto";

export { PhotoGrid, type PhotoGridItem } from "./ui/PhotoGrid";
export { PhotoImage } from "./ui/PhotoImage";
