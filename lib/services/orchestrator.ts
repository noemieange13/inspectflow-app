import type { InspectionResult } from "@/lib/types/inspection";

import { analyzeInspection } from "./pipeline";

function unsupportedTypeResult(): InspectionResult {
  return {
    ok: false,
    summary: "",
    severity: "low",
    issues: [],
    nextStep: "",
    urgency: "low",
    error: "UNSUPPORTED_TYPE",
    hint: "Type d’analyse non pris en charge pour l’instant.",
  };
}

export async function runAnalysis(input: {
  type: "inspection" | "roof";
  images: string[];
}): Promise<InspectionResult> {
  if (input.type === "inspection") {
    return analyzeInspection(input.images);
  }
  return unsupportedTypeResult();
}
