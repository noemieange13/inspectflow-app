import type { PhotoUrlFields } from "./types";
import { PLACEHOLDER_IMAGE_PATH } from "./placeholder";

/**
 * Garantit une URL non vide pour l’affichage. Déclenche un avertissement en dev si repli.
 */
export function finalizeResolvedDisplayUrl(
  raw: string | null | undefined,
  photo: PhotoUrlFields,
  reason: string,
): string {
  const u = typeof raw === "string" ? raw.trim() : "";
  if (u) return u;

  if (
    typeof process !== "undefined" &&
    process.env.NODE_ENV === "development"
  ) {
    console.warn("[photo-pipeline] Photo resolver fallback triggered", {
      reason,
      photo,
      placeholder: PLACEHOLDER_IMAGE_PATH,
    });
  }

  return PLACEHOLDER_IMAGE_PATH;
}
