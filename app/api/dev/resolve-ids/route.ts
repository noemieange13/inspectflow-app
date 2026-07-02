import { createServiceRoleClient } from "@/lib/supabaseServer";

const NIL_UUID = "00000000-0000-0000-0000-000000000000";
function validUuid(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t === NIL_UUID) return null;
  return /^[0-9a-f]{8}-/i.test(t) ? t : null;
}

export async function POST() {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "Dev only" }, { status: 403 });
  }

  try {
    const supabase = await createServiceRoleClient();

    let userId: string | null = null;
    let inspectionId: string | null = null;
    let jobId: string | null = null;

    const { data: reportRow } = await supabase
      .from("reports")
      .select("user_id, inspection_id, job_id")
      .not("user_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (reportRow) {
      userId = validUuid(reportRow.user_id);
      inspectionId = validUuid(reportRow.inspection_id);
      jobId = validUuid(reportRow.job_id);
    }

    if (!jobId || !inspectionId) {
      const { data: jobRow } = await supabase
        .from("jobs")
        .select("id, inspection_id")
        .not("inspection_id", "is", null)
        .limit(1)
        .maybeSingle();

      if (jobRow) {
        if (!jobId) jobId = validUuid(jobRow.id);
        if (!inspectionId) inspectionId = validUuid(jobRow.inspection_id);
      }
    }

    if (!userId) {
      const { data: inspRow } = await supabase
        .from("inspections")
        .select("id, owner_id")
        .not("owner_id", "is", null)
        .limit(1)
        .maybeSingle();

      if (inspRow) {
        userId = validUuid(inspRow.owner_id);
        if (!inspectionId) inspectionId = validUuid(inspRow.id);
      }
    }

    if (!userId) {
      const { data: authUsers } = await supabase.auth.admin.listUsers({ perPage: 1 });
      const candidate = authUsers?.users?.[0]?.id;
      userId = validUuid(candidate);
    }

    return Response.json({
      user_id: userId,
      inspection_id: inspectionId,
      job_id: jobId,
      resolved: !!(userId && (inspectionId || jobId)),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: message }, { status: 500 });
  }
}
