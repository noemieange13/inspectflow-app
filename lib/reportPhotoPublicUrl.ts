/**
 * Compat serveur : URL publique Storage (usage API / Edge).
 * Côté client UI, préférer `resolvePhotoDisplayUrlSync` depuis `@/photo-pipeline`.
 */
export { getUserUploadPublicUrl } from "@/photo-pipeline/core/getPublicUrl";
