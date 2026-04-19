/**
 * Hash MD5 aligné sur `public.qc_context_hash` (Supabase) — usage serveur / API routes Node.
 */
import { createHash } from "crypto";

import type { QcCopilotContext } from "@/lib/qcCopilotContext";

export function qcContextHashFields(ctx: QcCopilotContext): string {
  const raw = `${ctx.system ?? ""}|${ctx.property_type ?? ""}|${ctx.severity ?? ""}`;
  return createHash("md5").update(raw, "utf8").digest("hex");
}
