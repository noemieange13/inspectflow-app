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
