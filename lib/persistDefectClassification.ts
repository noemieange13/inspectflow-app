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

type FlatRow = {
  section: string;
  severity: string;
  title: string;
  description: string;
  recommendation: string;
};

function buildFlatRows(data: ClassifiedDefects): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const sec of data.sections) {
    for (const d of sec.defects) {
      rows.push({
        section: sec.section.slice(0, 2_000),
        severity: d.severity,
        title: d.title.slice(0, 2_000),
        description: d.description,
        recommendation: d.recommendation,
      });
    }
  }
  return rows;
}

async function insertClassificationLog(
  supabase: SupabaseClient,
  row: {
    report_id: string;
    status: string;
    model_name: string;
    prompt_version: number;
    input_hash: string;
    output_hash: string | null;
    result: Record<string, unknown> | null;
    ai_failure_reason: string | null;
  },
): Promise<boolean> {
  const { error } = await supabase.from("defect_classifications").insert(row);
  if (error) {
    console.error("[defects] defect_classifications insert failed", error.message);
    return false;
  }
  return true;
}

/**
 * Idempotence : en cas de succès IA, remplacement atomique des `report_items` (RPC transactionnelle),
 * puis journal `defect_classifications`. En cas d’échec IA, journal seul (pas de toucher aux items).
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

  const baseLog = {
    report_id: reportId,
    model_name: modelName,
    prompt_version: PROMPT_VERSION,
    input_hash: inputHash,
  };

  if (!ai.ok) {
    const status = ai.reason;
    const logged = await insertClassificationLog(supabase, {
      ...baseLog,
      status,
      output_hash: null,
      result: null,
      ai_failure_reason: ai.reason,
    });
    return { itemsInserted: 0, logged };
  }

  const outputHash = sha256Json(ai.data);
  const flat = buildFlatRows(ai.data);

  const { data: insertedCount, error: rpcErr } = await supabase.rpc(
    "apply_report_items_classification_batch",
    {
      p_report_id: reportId,
      p_items: flat,
    },
  );

  if (rpcErr) {
    console.error("[defects] apply_report_items_classification_batch failed", rpcErr.message);
    const logged = await insertClassificationLog(supabase, {
      ...baseLog,
      status: "error",
      output_hash: null,
      result: null,
      ai_failure_reason: `persist_failed:${rpcErr.message}`,
    });
    return { itemsInserted: 0, logged };
  }

  const n = typeof insertedCount === "number" ? insertedCount : 0;

  const logged = await insertClassificationLog(supabase, {
    ...baseLog,
    status: "success",
    output_hash: outputHash,
    result: ai.data as unknown as Record<string, unknown>,
    ai_failure_reason: null,
  });

  return { itemsInserted: n, logged };
}
