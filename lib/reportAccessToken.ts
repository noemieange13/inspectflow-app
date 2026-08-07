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

export type ReportAccessTokenValidation =
  | { ok: true }
  | { ok: false; reason: "invalid" | "expired" };

/**
 * Enforces the public report-viewer contract: a DB token makes the request
 * token mandatory. Reports without a DB token keep the historical open access.
 */
export function validateReportAccessToken(args: {
  accessTokenRaw: string | null | undefined;
  dbTokenRaw: unknown;
  tokenExpiresAt?: unknown;
}): ReportAccessTokenValidation {
  const dbToken =
    typeof args.dbTokenRaw === "string" ? args.dbTokenRaw.trim() : "";

  if (!dbToken) {
    return { ok: true };
  }

  const raw = typeof args.accessTokenRaw === "string" ? args.accessTokenRaw : "";
  if (!reportAccessTokensMatch(raw, dbToken)) {
    return { ok: false, reason: "invalid" };
  }

  if (
    args.tokenExpiresAt != null &&
    String(args.tokenExpiresAt) !== "" &&
    new Date(String(args.tokenExpiresAt)) < new Date()
  ) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true };
}
