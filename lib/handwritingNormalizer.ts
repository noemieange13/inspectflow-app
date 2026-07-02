/**
 * Pilot #0.16 — backward-compatible shim; use steveHandwritingNormalizer for new code.
 */
import {
  normalizeSteveFieldValue,
  type NormalizedSteveFieldValue,
  type SteveFieldKind,
} from "@/lib/steveHandwritingNormalizer";

export type HandwritingNormalizationContext = "address" | "roof" | "orientation" | "generic";

export type NormalizedHandwriting = {
  original_value: string;
  value: string;
  confidence: number;
  requires_confirmation: boolean;
};

const CONTEXT_MAP: Record<HandwritingNormalizationContext, SteveFieldKind> = {
  address: "address",
  roof: "roof",
  orientation: "facade_orientation",
  generic: "generic",
};

export function normalizeHandwritingText(
  original: string,
  context: HandwritingNormalizationContext,
  baseConfidence: number,
): NormalizedHandwriting {
  const result = normalizeSteveFieldValue({
    field: CONTEXT_MAP[context],
    value: original,
    confidence: baseConfidence,
  });
  return {
    original_value: result.original_value,
    value: result.normalized_value,
    confidence: result.confidence,
    requires_confirmation: result.requires_confirmation,
  };
}

export type { NormalizedSteveFieldValue, SteveFieldKind };
