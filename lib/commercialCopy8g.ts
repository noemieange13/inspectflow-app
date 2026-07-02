/**
 * Phase 8G — Commercial polish: human-facing labels and error mappers.
 * UX copy only — no backend / IA logic.
 */

export type InspectorLanguage = "fr" | "en";

/** Terms that must not appear in visible UI strings (grep guard in tests). */
export const FORBIDDEN_VISIBLE_UI_TERMS = [
  "analysis",
  "worker",
  "job",
  "token",
  "payload",
  "json",
  "confidence score",
  "engine version",
  "llm",
  "gpt",
  "ai agent",
  "vision model",
] as const;

export function fieldContextualHelp(language: InspectorLanguage = "fr"): string {
  return language === "en"
    ? "Take photos as you normally would. InspectFlow prepares your observations."
    : "Prenez vos photos normalement. InspectFlow prépare vos observations.";
}

export function reviewContextualHelp(language: InspectorLanguage = "fr"): string {
  return language === "en"
    ? "You stay in control. Accept, edit, or skip each suggestion."
    : "Vous gardez toujours le contrôle. Acceptez, modifiez ou ignorez.";
}

export function deliveryContextualHelp(language: InspectorLanguage = "fr"): string {
  return language === "en"
    ? "Review one last time before sending."
    : "Vérifiez une dernière fois avant l'envoi.";
}

export function emptyPhotosMessage(language: InspectorLanguage = "fr"): string {
  return language === "en" ? "Add your first photos" : "Ajoutez vos premières photos";
}

export function emptyFindingsMessage(language: InspectorLanguage = "fr"): string {
  return language === "en"
    ? "No significant observations detected"
    : "Aucune observation importante détectée";
}

export function emptyReportMessage(language: InspectorLanguage = "fr"): string {
  return language === "en"
    ? "Your report will appear here"
    : "Votre rapport apparaîtra ici";
}

export function photosVerifiedLabel(language: InspectorLanguage = "fr"): string {
  return language === "en" ? "Photos verified" : "Photos vérifiées";
}

export function reportPreparedLabel(language: InspectorLanguage = "fr"): string {
  return language === "en" ? "Report prepared" : "Rapport préparé";
}

export function proposedObservationLabel(language: InspectorLanguage = "fr"): string {
  return language === "en" ? "Proposed observation" : "Observation proposée";
}

export function verifyBeforeSendLabel(language: InspectorLanguage = "fr"): string {
  return language === "en" ? "Review before sending" : "À vérifier avant envoi";
}

export function photoVerificationInProgress(language: InspectorLanguage = "fr"): string {
  return language === "en" ? "Checking photos…" : "Vérification des photos…";
}

export function photoVerificationProgressLine(
  done: number,
  total: number,
  language: InspectorLanguage = "fr",
): string {
  if (language === "en") {
    return `Photos verified: ${done} / ${total}`;
  }
  return `Photos vérifiées : ${done} / ${total}`;
}

export function photoVerificationStatusMessage(language: InspectorLanguage = "fr"): string {
  return language === "en" ? "Checking photos" : "Vérification en cours";
}

export function photosNeedReviewMessage(language: InspectorLanguage = "fr"): string {
  return language === "en"
    ? "Some photos need a quick check"
    : "Certaines photos nécessitent une vérification";
}

export function assistantSuggestionLabel(language: InspectorLanguage = "fr"): string {
  return language === "en" ? "InspectFlow suggestion" : "Suggestion InspectFlow";
}

export type InspectorErrorKind = "server" | "network" | "upload" | "generic";

export function humanInspectorError(opts: {
  language?: InspectorLanguage;
  status?: number;
  kind?: InspectorErrorKind;
  raw?: string | null;
}): string {
  const language = opts.language ?? "fr";
  const kind = opts.kind ?? inferErrorKind(opts.status, opts.raw);

  if (kind === "network") {
    return language === "en"
      ? "Connection lost. We will resume automatically."
      : "Connexion perdue. Nous reprendrons automatiquement.";
  }
  if (kind === "upload") {
    return language === "en"
      ? "This photo will be retried."
      : "Cette photo sera réessayée.";
  }
  if (kind === "server" || opts.status === 500) {
    return language === "en"
      ? "Something went wrong. Your work is saved."
      : "Un problème est survenu. Votre travail est sauvegardé.";
  }

  if (language === "en") {
    return opts.raw?.trim() || "Something went wrong. Your work is saved.";
  }
  return opts.raw?.trim() || "Un problème est survenu. Votre travail est sauvegardé.";
}

function inferErrorKind(status?: number, raw?: string | null): InspectorErrorKind {
  const text = (raw ?? "").toLowerCase();
  if (
    text.includes("network") ||
    text.includes("fetch") ||
    text.includes("offline") ||
    text.includes("connexion")
  ) {
    return "network";
  }
  if (
    text.includes("upload") ||
    text.includes("capture failed") ||
    text.includes("upload_failed")
  ) {
    return "upload";
  }
  if (status === 500 || status === 502 || status === 503) {
    return "server";
  }
  return "generic";
}

export const FIRST_INSPECTION_GUIDE = {
  fr: {
    title: "Bienvenue",
    steps: [
      "Créer une inspection",
      "Ajouter vos photos",
      "Vérifier les suggestions",
      "Créer votre rapport",
    ],
  },
  en: {
    title: "Welcome",
    steps: [
      "Create an inspection",
      "Add your photos",
      "Review suggestions",
      "Create your report",
    ],
  },
} as const;
