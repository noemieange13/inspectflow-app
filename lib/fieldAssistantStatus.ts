import type { InspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import {
  photoVerificationInProgress,
  photoVerificationProgressLine,
  photosNeedReviewMessage,
  type InspectorLanguage,
} from "@/lib/commercialCopy8g";

export type FieldAssistantPhase =
  | "waiting"
  | "analyzing_photos"
  | "preparing_findings"
  | "ready_to_review";

export type FieldAssistantStatusInput = {
  photoProgress: InspectionPhotoProgress | null;
  findingsCount: number;
  hasUnreviewedAi?: boolean;
};

export function deriveFieldAssistantPhase(
  input: FieldAssistantStatusInput,
): FieldAssistantPhase {
  const uploadDone = input.photoProgress?.upload.done ?? 0;
  const analysis = input.photoProgress?.analysis;
  const pending = (analysis?.pending ?? 0) + (analysis?.processing ?? 0);
  const failed = analysis?.failed ?? 0;
  const analysisDone = analysis?.done ?? 0;

  if (uploadDone === 0 && analysisDone === 0) {
    return "waiting";
  }

  if (pending > 0 || failed > 0) {
    return "analyzing_photos";
  }

  if (input.findingsCount > 0) {
    return "ready_to_review";
  }

  if (analysisDone > 0 || uploadDone > 0) {
    return "preparing_findings";
  }

  return "waiting";
}

export function fieldAssistantHeadline(
  phase: FieldAssistantPhase,
  language: InspectorLanguage = "fr",
): string {
  if (language === "en") {
    switch (phase) {
      case "waiting":
        return "Take photos to start";
      case "analyzing_photos":
        return photoVerificationInProgress("en");
      case "preparing_findings":
        return "Preparing observations…";
      case "ready_to_review":
        return "Ready to review";
    }
  }
  switch (phase) {
    case "waiting":
      return "Prenez des photos pour commencer";
    case "analyzing_photos":
      return photoVerificationInProgress("fr");
    case "preparing_findings":
      return "Observations en préparation…";
    case "ready_to_review":
      return "Prêt à réviser";
  }
}

export function fieldAssistantAnalysisLine(
  progress: InspectionPhotoProgress | null,
  language: InspectorLanguage = "fr",
): string | null {
  if (!progress) return null;
  const done = progress.analysis.done;
  const total = progress.upload.done;
  const failed = progress.analysis.failed ?? 0;
  if (total <= 0) return null;
  if (failed > 0) {
    return photosNeedReviewMessage(language);
  }
  return photoVerificationProgressLine(done, total, language);
}

export function shouldShowReviewButton(
  phase: FieldAssistantPhase,
  findingsCount: number,
): boolean {
  return findingsCount > 0 && phase === "ready_to_review";
}
