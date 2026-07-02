import {
  buildAccessContextForReport,
  buildAccessInspection,
  canManageOrganization,
  canViewInspection,
  jsonAccessDenied,
  REPORT_ACCESS_SELECT,
  type ReportAccessRow,
} from "@/lib/access_control";
import {
  assignInspectionMember,
  listInspectionAssignmentsForReport,
  unassignInspectionMember,
} from "@/lib/team_collaboration";
import type { InspectionAssignmentRole } from "@/lib/team_collaboration/types";
import { resolveBearerUserId } from "@/lib/supabaseAuthFromRequest";
import { createServiceRoleClient } from "@/lib/supabaseServer";

export const maxDuration = 30;

function parseAssignmentRole(raw: unknown): InspectionAssignmentRole | null {
  return raw === "lead_inspector" || raw === "assistant" ? raw : null;
}

async function loadReportRow(supabase: Awaited<ReturnType<typeof createServiceRoleClient>>, reportId: string) {
  return supabase
    .from("reports")
    .select(REPORT_ACCESS_SELECT)
    .eq("id", reportId)
    .maybeSingle();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const reportId = url.searchParams.get("report_id")?.trim() ?? "";
    if (!reportId) {
      return Response.json({ error: "report_id required" }, { status: 400 });
    }

    const userId = await resolveBearerUserId(req);
    if (!userId) {
      return Response.json({ error: "access_denied" }, { status: 403 });
    }

    const supabase = await createServiceRoleClient();
    const { data: report, error } = await loadReportRow(supabase, reportId);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    if (!report) {
      return Response.json({ error: "Report not found" }, { status: 404 });
    }

    const inspection = buildAccessInspection(report as ReportAccessRow);
    const ctx = await buildAccessContextForReport(supabase, userId, inspection);
    if (!canViewInspection(ctx) && !canManageOrganization(ctx)) {
      return jsonAccessDenied();
    }

    const assignments = await listInspectionAssignmentsForReport(supabase, reportId);
    return Response.json({ success: true, assignments });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const reportId = typeof body.report_id === "string" ? body.report_id.trim() : "";
    const organizationId =
      typeof body.organization_id === "string" ? body.organization_id.trim() : "";
    const assignedToUserId =
      typeof body.assigned_to_user_id === "string" ? body.assigned_to_user_id.trim() : "";
    const action = body.action === "unassign" ? "unassign" : "assign";
    const role = parseAssignmentRole(body.role) ?? "lead_inspector";

    if (!reportId || !organizationId || !assignedToUserId) {
      return Response.json({ error: "report_id, organization_id, assigned_to_user_id required" }, {
        status: 400,
      });
    }

    const userId = await resolveBearerUserId(req);
    if (!userId) {
      return Response.json({ error: "access_denied" }, { status: 403 });
    }

    const supabase = await createServiceRoleClient();
    const { data: report, error: reportErr } = await loadReportRow(supabase, reportId);
    if (reportErr) {
      return Response.json({ error: reportErr.message }, { status: 500 });
    }
    if (!report) {
      return Response.json({ error: "Report not found" }, { status: 404 });
    }

    const rec = report as ReportAccessRow & Record<string, unknown>;
    const reportOrgId =
      typeof rec.organization_id === "string" ? rec.organization_id.trim() : "";
    if (reportOrgId && reportOrgId !== organizationId) {
      return Response.json({ error: "organization_mismatch" }, { status: 400 });
    }

    const inspection = buildAccessInspection(rec);
    const manageInspection = {
      ...inspection,
      organization_id: organizationId || inspection.organization_id,
    };
    const ctx = await buildAccessContextForReport(supabase, userId, manageInspection);
    if (!canManageOrganization(ctx)) {
      return jsonAccessDenied();
    }

    const inspectionId =
      typeof rec.inspection_id === "string" && rec.inspection_id.trim()
        ? rec.inspection_id.trim()
        : null;

    if (action === "unassign") {
      const result = await unassignInspectionMember(supabase, {
        report_id: reportId,
        organization_id: organizationId,
        assigned_to_user_id: assignedToUserId,
        removed_by_user_id: userId,
        inspection_id: inspectionId,
      });
      if (!result.ok) {
        return Response.json({ error: result.error }, { status: 400 });
      }
      return Response.json({ success: true, action: "unassign" });
    }

    const result = await assignInspectionMember(
      supabase,
      {
        report_id: reportId,
        organization_id: organizationId,
        assigned_to_user_id: assignedToUserId,
        assigned_by_user_id: userId,
        role,
      },
      inspectionId,
    );
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }
    return Response.json({ success: true, action: "assign", assignment: result.assignment });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
