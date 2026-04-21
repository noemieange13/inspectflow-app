import type { InspectionResult } from "@/lib/types/inspection";

/** Résumé terrain immédiatement affichable après `/api/analyze`. */
export function getDisplaySummary(result: InspectionResult) {
  return {
    title: result.summary,
    severity: result.severity,
    action: result.nextStep,
  };
}
