import type { InspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import type { InspectionHealthStatus } from "@/lib/inspection_health_engine";

/** Entrée agrégée — lecture seule, sans exposer jobs / worker / tokens. */
export type InspectionProgressInput = {
  photoUploadDone: number;
  photoAnalysisPending: number;
  photoAnalysisProcessing: number;
  photoAnalysisFailed: number;
  photoAnalysisDone: number;
  hasUnreviewedAi: boolean;
  hasPdf: boolean;
};

export type InspectorProgressPhase =
  | "draft"
  | "in_progress"
  | "photo_analysis"
  | "needs_review"
  | "ready";

export type HumanInspectionStatusFr =
  | "En cours"
  | "Analyse des photos"
  | "À réviser"
  | "Prêt à envoyer";

const STATUS_BY_PHASE: Record<InspectorProgressPhase, HumanInspectionStatusFr> = {
  draft: "En cours",
  in_progress: "En cours",
  photo_analysis: "Analyse des photos",
  needs_review: "À réviser",
  ready: "Prêt à envoyer",
};

export function buildInspectionProgressInput(opts: {
  photoProgress?: InspectionPhotoProgress | null;
  health?: InspectionHealthStatus | null;
  hasUnreviewedAi?: boolean;
  hasPdf?: boolean;
}): InspectionProgressInput {
  const analysis = opts.photoProgress?.analysis;
  return {
    photoUploadDone: opts.photoProgress?.upload.done ?? 0,
    photoAnalysisPending: analysis?.pending ?? 0,
    photoAnalysisProcessing: analysis?.processing ?? 0,
    photoAnalysisFailed: analysis?.failed ?? 0,
    photoAnalysisDone: analysis?.done ?? 0,
    hasUnreviewedAi: opts.hasUnreviewedAi ?? !(opts.health?.checks.ai_review_complete ?? true),
    hasPdf: opts.hasPdf ?? (opts.health?.checks.pdf_ready ?? false),
  };
}

export function deriveInspectorProgressPhase(
  input: InspectionProgressInput,
): InspectorProgressPhase {
  if (input.hasPdf) {
    return "ready";
  }

  const hasPhotos =
    input.photoUploadDone > 0 ||
    input.photoAnalysisDone > 0 ||
    input.photoAnalysisPending > 0 ||
    input.photoAnalysisProcessing > 0;

  if (!hasPhotos) {
    return "draft";
  }

  const analysisBusy =
    input.photoAnalysisPending > 0 ||
    input.photoAnalysisProcessing > 0 ||
    input.photoAnalysisFailed > 0;

  if (analysisBusy) {
    return "photo_analysis";
  }

  if (input.hasUnreviewedAi) {
    return "needs_review";
  }

  if (input.photoAnalysisDone > 0 && !input.hasUnreviewedAi) {
    return "ready";
  }

  return "in_progress";
}

export function humanInspectionStatusLabel(
  phase: InspectorProgressPhase,
): HumanInspectionStatusFr {
  return STATUS_BY_PHASE[phase];
}

/** Pourcentage d'avancement humain (0–100) — heuristique terrain. */
export function inspectionCompletionPercent(input: InspectionProgressInput): number {
  if (input.hasPdf) return 100;

  const phase = deriveInspectorProgressPhase(input);
  switch (phase) {
    case "draft":
      return 5;
    case "in_progress":
      return Math.min(35, 10 + input.photoUploadDone);
    case "photo_analysis":
      return Math.min(75, 40 + Math.round((input.photoAnalysisDone / Math.max(1, input.photoUploadDone)) * 30));
    case "needs_review":
      return 85;
    case "ready":
      return 95;
  }
}

export function isInspectionCompleted(input: InspectionProgressInput): boolean {
  return input.hasPdf || deriveInspectorProgressPhase(input) === "ready";
}

export function isInspectionDraft(input: InspectionProgressInput): boolean {
  const phase = deriveInspectorProgressPhase(input);
  return phase === "draft" || phase === "in_progress";
}
