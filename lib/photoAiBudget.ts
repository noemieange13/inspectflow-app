/** Version du prompt vision — traçabilité audit (pas de changement métier analyse). */
export const PHOTO_VISION_PROMPT_VERSION = "photo-vision-v1";

export type PhotoAiBudgetLimits = {
  maxPhotos: number;
  maxCostUsd: number;
};

export type PhotoVisionUsageAudit = {
  ai_model: string;
  prompt_version: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  analysis_duration_ms: number;
  processed_at: string;
};

/** Tarifs USD / 1M tokens (approximation OpenAI — configurable via env si besoin). */
const MODEL_TOKEN_PRICING_USD: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
};

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = raw != null ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parsePositiveFloat(raw: string | undefined, fallback: number): number {
  const n = raw != null ? Number.parseFloat(raw) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getPhotoAiBudgetLimits(): PhotoAiBudgetLimits {
  return {
    maxPhotos: parsePositiveInt(process.env.MAX_AI_PHOTOS_PER_INSPECTION, 500),
    maxCostUsd: parsePositiveFloat(process.env.MAX_AI_COST_PER_INSPECTION, 25),
  };
}

export function estimateVisionCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const key = model.trim().toLowerCase();
  const rates =
    MODEL_TOKEN_PRICING_USD[key] ??
    MODEL_TOKEN_PRICING_USD["gpt-4o-mini"]!;
  const cost =
    (Math.max(0, inputTokens) / 1_000_000) * rates.input +
    (Math.max(0, outputTokens) / 1_000_000) * rates.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export type InspectionAiUsageSnapshot = {
  photos_analyzed: number;
  photos_skipped_duplicate: number;
  total_tokens: number;
  estimated_cost_usd: number;
};

export function inspectionAiUsageWithinBudget(
  usage: InspectionAiUsageSnapshot,
  limits: PhotoAiBudgetLimits = getPhotoAiBudgetLimits(),
): boolean {
  return (
    usage.photos_analyzed < limits.maxPhotos &&
    usage.estimated_cost_usd < limits.maxCostUsd
  );
}

/** Vérifie si un nouvel appel vision respecterait le plafond. */
export function canAffordVisionCall(
  usage: InspectionAiUsageSnapshot,
  projectedCostUsd: number,
  limits: PhotoAiBudgetLimits = getPhotoAiBudgetLimits(),
): boolean {
  if (usage.photos_analyzed >= limits.maxPhotos) return false;
  if (usage.estimated_cost_usd + projectedCostUsd > limits.maxCostUsd + 1e-9) return false;
  return true;
}

export function formatEstimatedCostUsd(
  amount: number,
  language: "fr" | "en",
): string {
  if (!Number.isFinite(amount) || amount <= 0) return language === "en" ? "$0.00" : "0,00 $";
  return new Intl.NumberFormat(language === "en" ? "en-CA" : "fr-CA", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}
