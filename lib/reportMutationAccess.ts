import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { verifyBearerMatchesReportOwner } from "@/lib/supabaseAuthFromRequest";

type ReportMutationGateRow = {
  access_token?: unknown;
  token_expires_at?: unknown;
  user_id?: unknown;
};

export type ReportMutationAccessResult =
  | { ok: true; userId: string | null }
  | { ok: false; status: number; error: string; code?: string };

/**
 * Mutating service-role routes need stricter rules than legacy read access:
 * a tokenized report accepts its viewer token, while tokenless rows require
 * the owner session because there is no shared secret to prove possession.
 */
export async function assertReportMutationAccess(
  req: Request,
  reportId: string,
  accessTokenRaw: string,
  row: ReportMutationGateRow | null,
): Promise<ReportMutationAccessResult> {
  if (!row) {
    return { ok: false, status: 404, error: "Report not found" };
  }

  if (await verifyBearerMatchesReportOwner(req, row.user_id)) {
    const uid = row.user_id;
    return {
      ok: true,
      userId: typeof uid === "string" && uid.length > 0 ? uid : null,
    };
  }

  const dbToken =
    typeof row.access_token === "string" ? row.access_token.trim() : "";
  if (!dbToken) {
    return {
      ok: false,
      status: 403,
      error: "Report owner authorization required",
      code: "access_denied",
    };
  }

  const gate = validateReportAccessRow(reportId, accessTokenRaw, row);
  if (!gate.ok) return gate;
  return { ok: true, userId: gate.userId };
}
