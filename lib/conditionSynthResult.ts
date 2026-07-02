import type { AiFailureReason } from "@/lib/aiResult";

export type ConditionSynthSource =
  | "analysis_text"
  | "vision_images"
  | "analysis_text_fallback"
  | "local_fallback";

export type ConditionSynthResult =
  | {
      ok: true;
      data: string;
      source: ConditionSynthSource;
      snapshot_photo_ids: string[];
      /** Confiance moyenne dérivée des analyses photo (`severity_hint` / `confidence`). */
      avg_confidence: number;
    }
  | {
      ok: false;
      reason: AiFailureReason;
      snapshot_photo_ids: string[];
    };
