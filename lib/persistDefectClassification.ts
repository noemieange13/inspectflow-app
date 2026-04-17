import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiResult } from "@/lib/aiResult";
import type { ClassifiedDefects } from "@/lib/defectClassificationTypes";

const PROMPT_VERSION = 1;

function sha256Json(obj: unknown): string {
  return createHash("sha256").update(JSON.stringify(obj), "utf8").digest("hex");
}

export type PersistDefectOutcome = {
  itemsInserted: number;
  logged: boolean;
};

/**
 * Idempotence : supprime les `report_items` du rapport puis réinsère depuis l’IA.
 * Journalise toujours une ligne `defect_classifications`.
 */
export async function persistDefectClassification(
  supabase: SupabaseClient,
  reportId: string,
  ai: AiResult<ClassifiedDefects>,
  inputForHash: unknown,
): Promise<PersistDefectOutcome> {
  const inputHash = sha256Json(inputForHash);
  const modelName =
    process.env.CLASSIFY_DEFECTS_MODEL?.trim() ||
    process.env.REPORTS_AI_MODEL?.trim() ||
    "gpt-4o-mini";

  const status = ai.ok ? "success" : ai.reason;
  const outputHash = ai.ok ? sha256Json(ai.data) : null;
  const resultJson = ai.ok ? (ai.data as unknown as Record<string, unknown>) : null;

  const { error: logErr } = await supabase.from("defect_classifications").insert({
    report_id: reportId,
    status,
    model_name: modelName,
    prompt_version: PROMPT_VERSION,
    input_hash: inputHash,
    output_hash: outputHash,
    result: resultJson,
    ai_failure_reason: ai.ok ? null : ai.reason,
  });

  if (logErr) {
    console.error("[defects] defect_classifications insert failed", logErr.message);
    return { itemsInserted: 0, logged: false };
  }

  if (!ai.ok) {
    if (ai.reason === "too_large" || ai.reason === "aborted") {
      /* pas d’insert items — log seul */
    }
    return { itemsInserted: 0, logged: true };
  }

  const { error: delErr } = await supabase
    .from("report_items")
    .delete()
    .eq("report_id", reportId);

  if (delErr) {
    console.error("[defects] report_items delete failed", delErr.message);
    return { itemsInserted: 0, logged: true };
  }

  let inserted = 0;
  for (const sec of ai.data.sections) {
    for (const d of sec.defects) {
      const { error: insErr } = await supabase.from("report_items").insert({
        report_id: reportId,
        section: sec.section.slice(0, 2_000),
        severity: d.severity,
        title: d.title.slice(0, 2_000),
        description: d.description,
        recommendation: d.recommendation,
      });
      if (insErr) {
        console.error("[defects] report_items insert failed", insErr.message);
        continue;
      }
      inserted += 1;
    }
  }

  return { itemsInserted: inserted, logged: true };
}
