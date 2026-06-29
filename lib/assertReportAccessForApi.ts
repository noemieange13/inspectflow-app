import { reportAccessTokensMatch } from "@/lib/reportAccessToken";
import { verifyBearerMatchesReportOwner } from "@/lib/supabaseAuthFromRequest";

export type AssertReportAccessOk = {
  ok: true;
  userId: string | null;
};

export type AssertReportAccessErr = {
  ok: false;
  status: number;
  error: string;
  code?: string;
};

export type AssertReportAccessResult = AssertReportAccessOk | AssertReportAccessErr;

type ReportGateRow = {
  access_token?: unknown;
  token_expires_at?: unknown;
  user_id?: unknown;
};

/**
 * Même règles que `/api/report-content` : jeton URL vs `reports.access_token`, expiration.
 */
export function validateReportAccessRow(
  _reportId: string,
  accessTokenRaw: string,
  row: ReportGateRow | null,
): AssertReportAccessResult {
  if (!row) {
    return { ok: false, status: 404, error: "Report not found" };
  }
  const dbToken =
    typeof row.access_token === "string" ? row.access_token.trim() : "";
  if (dbToken) {
    if (!reportAccessTokensMatch(accessTokenRaw, dbToken)) {
      return {
        ok: false,
        status: 403,
        error: "Invalid access token",
        code: "access_denied",
      };
    }
    if (
      row.token_expires_at != null &&
      String(row.token_expires_at) !== "" &&
      new Date(String(row.token_expires_at)) < new Date()
    ) {
      return {
        ok: false,
        status: 403,
        error: "Access token expired",
        code: "access_denied",
      };
    }
  }

  const uid = row.user_id;
  const userId =
    typeof uid === "string" && uid.length > 0 ? uid : null;

  return { ok: true, userId };
}

/**
 * Pour les routes qui déclenchent des écritures ou des coûts serveur, un rapport
 * sans access_token ne doit pas devenir implicitement public par simple UUID.
 */
export function validateReportTokenAccessRow(
  reportId: string,
  accessTokenRaw: string,
  row: ReportGateRow | null,
): AssertReportAccessResult {
  if (!row) {
    return { ok: false, status: 404, error: "Report not found" };
  }

  const dbToken =
    typeof row.access_token === "string" ? row.access_token.trim() : "";
  if (!dbToken) {
    return {
      ok: false,
      status: 403,
      error: "Report access token required",
      code: "access_token_required",
    };
  }

  return validateReportAccessRow(reportId, accessTokenRaw, row);
}

/**
 * Propriétaire connecté (JWT Supabase = `reports.user_id`) OU jeton d’accès rapport (lien partagé).
 */
export async function assertReportAccessWithOptionalSession(
  req: Request,
  reportId: string,
  accessTokenRaw: string,
  row: ReportGateRow | null,
): Promise<AssertReportAccessResult> {
  if (!row) {
    return { ok: false, status: 404, error: "Report not found" };
  }
  if (await verifyBearerMatchesReportOwner(req, row.user_id)) {
    const uid = row.user_id;
    const userId =
      typeof uid === "string" && uid.length > 0 ? uid : null;
    if (userId) {
      return { ok: true, userId };
    }
  }
  return validateReportAccessRow(reportId, accessTokenRaw, row);
}

/**
 * Variante stricte pour les routes de mutation/coût : propriétaire connecté
 * OU vrai jeton de rapport. Les rapports legacy sans token nécessitent donc
 * une session propriétaire.
 */
export async function assertReportTokenOrOwnerAccess(
  req: Request,
  reportId: string,
  accessTokenRaw: string,
  row: ReportGateRow | null,
): Promise<AssertReportAccessResult> {
  if (!row) {
    return { ok: false, status: 404, error: "Report not found" };
  }
  if (await verifyBearerMatchesReportOwner(req, row.user_id)) {
    const uid = row.user_id;
    const userId =
      typeof uid === "string" && uid.length > 0 ? uid : null;
    if (userId) {
      return { ok: true, userId };
    }
  }
  return validateReportTokenAccessRow(reportId, accessTokenRaw, row);
}
