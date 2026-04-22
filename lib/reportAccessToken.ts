import { randomBytes } from "crypto";

/** Token opaque 64 caractères hex — à stocker dans `reports.access_token`. */
export function generateReportAccessToken(): string {
  return randomBytes(32).toString("hex");
}

/** Date d’expiration par défaut : 24 h (à stocker dans `reports.token_expires_at`). */
export function defaultReportTokenExpiresAt(
  msFromNow = 1000 * 60 * 60 * 24,
): Date {
  return new Date(Date.now() + msFromNow);
}

/** Comparaison jeton URL / corps vs valeur DB (casse, espaces, encodage partiel). */
export function normalizeReportAccessTokenInput(raw: string): string {
  const t = raw.trim();
  try {
    return decodeURIComponent(t).trim().toLowerCase();
  } catch {
    return t.toLowerCase();
  }
}

export function reportAccessTokensMatch(
  clientRaw: string,
  dbStored: string,
): boolean {
  return (
    normalizeReportAccessTokenInput(clientRaw) ===
    normalizeReportAccessTokenInput(dbStored)
  );
}
