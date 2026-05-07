/** Aligné sur `app/api/upload-photo` — surchargeable via `NEXT_PUBLIC_STORAGE_BUCKET`. */
export const DEFAULT_PHOTOS_STORAGE_BUCKET = "user-uploads";

/**
 * Nom du bucket Storage pour les photos inspection.
 * Lève si `NEXT_PUBLIC_STORAGE_BUCKET` est défini mais vide (erreur de config silencieuse sinon).
 */
export function getPhotosStorageBucketName(): string {
  const raw =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_STORAGE_BUCKET
      : undefined;

  if (raw !== undefined && String(raw).trim() === "") {
    throw new Error(
      "NEXT_PUBLIC_STORAGE_BUCKET is set but empty — unset it or set a valid bucket name.",
    );
  }

  const fromEnv =
    typeof raw === "string" ? raw.trim() : "";
  const name = fromEnv || DEFAULT_PHOTOS_STORAGE_BUCKET;
  if (!name) {
    throw new Error("Storage bucket not configured.");
  }
  return name;
}
