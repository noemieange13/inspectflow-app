import { recordFastReportMetrics } from "@/lib/fastReportMetrics";
import {
  buildReportGenerationMetrics,
  recordReportGenerationMetrics,
} from "@/lib/reportGenerationMetrics";

export const maxDuration = 15;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return Response.json({ success: false, error: "Invalid JSON" }, { status: 400 });
    }

    const photos_count = typeof body.photos_count === "number" ? body.photos_count : 0;
    const observations_count =
      typeof body.observations_count === "number" ? body.observations_count : 0;
    const auto_accepted_count =
      typeof body.auto_accepted_count === "number" ? body.auto_accepted_count : 0;
    const manual_review_count =
      typeof body.manual_review_count === "number" ? body.manual_review_count : 0;
    const languages_count =
      typeof body.languages_count === "number" ? body.languages_count : 1;
    const cache_miss = body.cache_miss === true;
    const inspection_id =
      typeof body.inspection_id === "string" ? body.inspection_id : undefined;
    const started_at =
      typeof body.started_at === "string" ? body.started_at : undefined;

    const metrics = recordFastReportMetrics({
      photos_count,
      observations_count,
      auto_accepted_count,
      manual_review_count,
    });

    const generationMetrics =
      recordReportGenerationMetrics({
        inspection_id,
        photos_count,
        observations_count,
        languages_count,
        cache_miss,
        started_at,
      }) ??
      buildReportGenerationMetrics({
        inspection_id,
        photos_count,
        observations_count,
        languages_count,
        cache_miss,
        started_at,
      });

    return Response.json({ success: true, metrics, generation_metrics: generationMetrics });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
