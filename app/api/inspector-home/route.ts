import { NextRequest, NextResponse } from "next/server";

import {
  buildAccessContextForReport,
  buildAccessInspection,
  canManageOrganization,
  canViewInspection,
} from "@/lib/access_control";
import { resolveActiveOrganizationId } from "@/lib/currentOrganization";
import { loadInspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import {
  buildInspectorHomeListItem,
  computeWeekStats,
  mergeAndSortReportRows,
  pickActiveInspection,
  type InspectorHomeReportRow,
} from "@/lib/inspectorHomeList";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { resolveBearerUserId } from "@/lib/supabaseAuthFromRequest";

const LIST_LIMIT = 25;
const PROGRESS_BATCH = 10;

export async function GET(req: NextRequest) {
  const userId = await resolveBearerUserId(req);
  if (!userId) {
    return NextResponse.json({ success: false, error: "access_denied" }, { status: 403 });
  }

  const organizationIdParam = req.nextUrl.searchParams.get("organization_id");

  try {
    const supabase = await createServiceRoleClient();
    const organizationId = await resolveActiveOrganizationId(
      supabase,
      userId,
      organizationIdParam,
    );

    const selectCols =
      "id, created_at, user_id, inspection_id, organization_id, pdf_path, access_token, payload";

    const ownedQuery = supabase
      .from("reports")
      .select(selectCols)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);

    const ownedRes = organizationId
      ? await ownedQuery.eq("organization_id", organizationId)
      : await ownedQuery;

    const assignedRes = await supabase
      .from("inspection_assignments")
      .select(`report_id, reports (${selectCols})`)
      .eq("assigned_to_user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(LIST_LIMIT);

    const ownedRows = (ownedRes.data ?? []) as InspectorHomeReportRow[];
    const assignedRows: InspectorHomeReportRow[] = [];
    for (const row of assignedRes.data ?? []) {
      const nested = (row as { reports?: InspectorHomeReportRow | InspectorHomeReportRow[] })
        .reports;
      if (Array.isArray(nested)) {
        for (const r of nested) assignedRows.push(r);
      } else if (nested && typeof nested === "object") {
        assignedRows.push(nested);
      }
    }

    const merged = mergeAndSortReportRows(ownedRows, assignedRows).slice(0, LIST_LIMIT);

    const accessible: InspectorHomeReportRow[] = [];
    for (const row of merged) {
      const inspection = buildAccessInspection(row);
      const ctx = await buildAccessContextForReport(supabase, userId, inspection);
      if (canViewInspection(ctx)) {
        accessible.push(row);
      }
    }

    const progressByInspection = new Map<string, Awaited<ReturnType<typeof loadInspectionPhotoProgress>>>();
    const withInspection = accessible
      .filter((r) => typeof r.inspection_id === "string" && r.inspection_id.trim())
      .slice(0, PROGRESS_BATCH);

    await Promise.all(
      withInspection.map(async (row) => {
        const inspectionId = row.inspection_id!.trim();
        try {
          const progress = await loadInspectionPhotoProgress(supabase, inspectionId);
          progressByInspection.set(inspectionId, progress);
        } catch {
          /* progression optionnelle */
        }
      }),
    );

    const items = accessible.map((row) => {
      const inspectionId =
        typeof row.inspection_id === "string" ? row.inspection_id.trim() : "";
      const photoProgress = inspectionId
        ? progressByInspection.get(inspectionId) ?? null
        : null;
      return buildInspectorHomeListItem(row, photoProgress);
    });

    const active = pickActiveInspection(items);
    const weekStats = computeWeekStats(items);

    let showAdminNav = false;
    if (organizationId) {
      const adminCtx = await buildAccessContextForReport(supabase, userId, {
        report_id: "",
        inspection_id: null,
        organization_id: organizationId,
        owner_user_id: userId,
      });
      showAdminNav = canManageOrganization(adminCtx);
    }

    return NextResponse.json({
      success: true,
      organization_id: organizationId,
      user_id: userId,
      show_admin_nav: showAdminNav,
      active,
      items,
      week_stats: weekStats,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
