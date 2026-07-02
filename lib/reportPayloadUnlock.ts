/**
 * Autorise payload + déverrouillage `is_locked` pour la regénération en **développement local**.
 * - `NODE_ENV=development` (npm run dev)
 * - `INSPECTFLOW_DEV_UNLOCK_REPORT=1|true|yes`
 * - requête **locale** : hostname de `req.url`, `Host`, `x-forwarded-host` = localhost / 127.0.0.1 / ::1
 *
 * Désactivation explicite : `INSPECTFLOW_DEV_UNLOCK_REPORT=0`
 */
function isLoopbackHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "::1" ||
    h === "[::1]"
  );
}

function isLocalRequest(req: Request): boolean {
  try {
    const { hostname } = new URL(req.url);
    if (isLoopbackHostname(hostname)) return true;
  } catch {
    /* URL absente ou invalide */
  }

  const host = (req.headers.get("host") ?? "").trim();
  const hostOnly = host.split(":")[0] ?? "";
  if (hostOnly && isLoopbackHostname(hostOnly)) return true;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host)) return true;
  if (/^\[::1\](:\d+)?$/i.test(host)) return true;

  const xf = (req.headers.get("x-forwarded-host") ?? "").split(",")[0]?.trim() ?? "";
  if (xf) {
    const xfHost = xf.split(":")[0] ?? "";
    if (isLoopbackHostname(xfHost)) return true;
  }

  return false;
}

export function allowReportPayloadUnlock(req: Request): boolean {
  const raw = process.env.INSPECTFLOW_DEV_UNLOCK_REPORT;
  if (raw !== undefined && raw.trim().toLowerCase() === "0") {
    /** `=0` désactive l’unlock « large » sauf en dev local (évite 403 bloquants sur localhost). */
    return isLocalRequest(req) || process.env.NODE_ENV === "development";
  }
  const explicit =
    raw !== undefined &&
    ["1", "true", "yes"].includes(raw.trim().toLowerCase());
  if (explicit) return true;
  if (process.env.NODE_ENV === "development") return true;
  if (isLocalRequest(req)) return true;

  /**
   * Hors Vercel (`VERCEL` absent) : typiquement `npm run dev` / `next start` / Docker local.
   * Autorise le déverrouillage pour que POST /api/report-content ne renvoie pas 403 à cause d’un trigger.
   * Sur un serveur de prod non-Vercel, définir `INSPECTFLOW_DEV_UNLOCK_REPORT=0` pour respecter `is_locked`.
   */
  if (process.env.VERCEL !== "1") {
    return true;
  }

  return false;
}
