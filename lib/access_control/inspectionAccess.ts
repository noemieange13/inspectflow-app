import type { SupabaseClient } from "@supabase/supabase-js";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { recordInspectionEventSafe } from "@/lib/inspection_audit_trail";
import { reportAccessTokensMatch } from "@/lib/reportAccessToken";
import { verifyBearerMatchesReportOwner, resolveBearerUserId } from "@/lib/supabaseAuthFromRequest";

import {
  buildAccessContextForReport,
  buildAccessInspection,
  type ReportAccessRowLike,
  type ReportAccessRow,
} from "./membership";
import { canPerformAction } from "./permissions";
import type { ReportAccessAction } from "./types";

export type ReportResourceAccessOk = {
  ok: true;
  userId: string | null;
  viaShareToken: boolean;
};

export type ReportResourceAccessErr = {
  ok: false;
  status: number;
  error: string;
  code: "access_denied" | string;
};

export type ReportResourceAccessResult = ReportResourceAccessOk | ReportResourceAccessErr;

export function jsonAccessDenied(): Response {
  return Response.json({ error: "access_denied" }, { status: 403 });
}

async function resolveJwtUserId(
  req: Request,
  reportOwnerUserId: unknown,
): Promise<string | null> {
  const bearerId = await resolveBearerUserId(req);
  if (bearerId) return bearerId;
  if (await verifyBearerMatchesReportOwner(req, reportOwnerUserId)) {
    const uid = reportOwnerUserId;
    return typeof uid === "string" && uid.length > 0 ? uid : null;
  }
  return null;
}

async function recordAccessDenied(
  supabase: SupabaseClient,
  inspection: ReturnType<typeof buildAccessInspection>,
  action: ReportAccessAction,
  userId: string | null,
): Promise<void> {
  void recordInspectionEventSafe(supabase, {
    report_id: inspection.report_id,
    inspection_id: inspection.inspection_id,
    event_type: "access_denied",
    actor_type: "system",
    metadata: {
      action,
      user_id: userId ?? undefined,
      organization_id: inspection.organization_id ?? undefined,
    },
  });
}

/**
 * Jeton partagé (solo) OU JWT + membership organisation.
 */
export async function assertReportResourceAccess(
  req: Request,
  supabase: SupabaseClient,
  opts: {
    reportId: string;
    accessTokenRaw: string;
    row: ReportAccessRowLike | null;
    action: ReportAccessAction;
  },
): Promise<ReportResourceAccessResult> {
  const { reportId, accessTokenRaw, row, action } = opts;
  if (!row) {
    return { ok: false, status: 404, error: "Report not found", code: "not_found" };
  }

  const inspection = buildAccessInspection(row);
  const dbToken =
    typeof row.access_token === "string" ? row.access_token.trim() : "";

  if (dbToken.length > 0) {
    const tokenGate = validateReportAccessRow(reportId, accessTokenRaw, row);
    if (!tokenGate.ok) {
      await recordAccessDenied(supabase, inspection, action, null);
      return {
        ok: false,
        status: tokenGate.status,
        error: "access_denied",
        code: "access_denied",
      };
    }
    return { ok: true, userId: tokenGate.userId, viaShareToken: true };
  }

  const jwtUserId = await resolveJwtUserId(req, row.user_id);
  if (jwtUserId) {
    const ctx = await buildAccessContextForReport(supabase, jwtUserId, inspection);
    if (!canPerformAction(ctx, action)) {
      await recordAccessDenied(supabase, inspection, action, jwtUserId);
      return { ok: false, status: 403, error: "access_denied", code: "access_denied" };
    }
    return { ok: true, userId: jwtUserId, viaShareToken: false };
  }

  if (inspection.organization_id) {
    await recordAccessDenied(supabase, inspection, action, null);
    return { ok: false, status: 403, error: "access_denied", code: "access_denied" };
  }

  return { ok: true, userId: inspection.owner_user_id || null, viaShareToken: false };
}

export const REPORT_ACCESS_SELECT =
  "id, user_id, inspection_id, organization_id, access_token, token_expires_at";
