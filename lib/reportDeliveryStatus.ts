export type DeliveryTechnicalStatus =
  | "idle"
  | "pending"
  | "processing"
  | "running"
  | "generating"
  | "completed"
  | "success"
  | "failed"
  | "error";

export type DeliveryUserPhase = "idle" | "waiting" | "preparing" | "ready" | "error";

const PREPARING_STATUSES: DeliveryTechnicalStatus[] = [
  "pending",
  "processing",
  "running",
  "generating",
];

const SUCCESS_STATUSES: DeliveryTechnicalStatus[] = ["completed", "success"];

const ERROR_STATUSES: DeliveryTechnicalStatus[] = ["failed", "error"];

export function normalizeDeliveryStatus(raw: string | null | undefined): DeliveryTechnicalStatus {
  const s = (raw ?? "idle").toLowerCase().trim();
  if (s === "pending") return "pending";
  if (s === "processing") return "processing";
  if (s === "running") return "running";
  if (s === "generating") return "generating";
  if (s === "completed") return "completed";
  if (s === "success") return "success";
  if (s === "failed") return "failed";
  if (s === "error") return "error";
  return "idle";
}

export function isPreparingStatus(status: DeliveryTechnicalStatus): boolean {
  return PREPARING_STATUSES.includes(status);
}

export function isSuccessStatus(status: DeliveryTechnicalStatus): boolean {
  return SUCCESS_STATUSES.includes(status);
}

export function isErrorStatus(status: DeliveryTechnicalStatus): boolean {
  return ERROR_STATUSES.includes(status);
}

/** Libellé direct depuis statut technique (spec 8E). */
export function getTechnicalStatusLabel(
  status: DeliveryTechnicalStatus,
  language: "fr" | "en" = "fr",
): string {
  if (language === "en") {
    switch (status) {
      case "pending":
        return "Preparing report";
      case "processing":
      case "running":
      case "generating":
        return "Creation in progress";
      case "completed":
      case "success":
        return "Report ready";
      case "failed":
      case "error":
        return "Action required";
      default:
        return "Finalizing";
    }
  }
  switch (status) {
    case "pending":
      return "Préparation du rapport";
    case "processing":
    case "running":
    case "generating":
      return "Création en cours";
    case "completed":
    case "success":
      return "Rapport prêt";
    case "failed":
    case "error":
      return "Action nécessaire";
    default:
      return "Finalisation";
  }
}

/** Phase affichée à l'inspecteur — mapping seulement. */
export function resolveDeliveryPhase(opts: {
  status: DeliveryTechnicalStatus;
  hasPdf: boolean;
  hasDownloadUrl: boolean;
}): DeliveryUserPhase {
  if (isErrorStatus(opts.status)) return "error";
  if (opts.hasDownloadUrl || (opts.hasPdf && isSuccessStatus(opts.status))) return "ready";
  if (isPreparingStatus(opts.status)) return "preparing";
  if (opts.hasPdf) return "ready";
  if (!opts.hasPdf && opts.status === "idle") return "waiting";
  return "preparing";
}

export function getDeliveryLabel(
  phase: DeliveryUserPhase,
  language: "fr" | "en" = "fr",
): string {
  if (language === "en") {
    switch (phase) {
      case "waiting":
        return "Final verification in progress";
      case "preparing":
        return "Preparing your report…";
      case "ready":
        return "Report ready";
      case "error":
        return "Action required";
      default:
        return "Finalizing";
    }
  }
  switch (phase) {
    case "waiting":
      return "Vérification finale en cours";
    case "preparing":
      return "Création en cours";
    case "ready":
      return "Rapport prêt";
    case "error":
      return "Action nécessaire";
    default:
      return "Finalisation";
  }
}

export function getDeliveryHeadline(
  phase: DeliveryUserPhase,
  language: "fr" | "en" = "fr",
): string {
  if (language === "en") {
    if (phase === "ready") return "Your report is ready";
    if (phase === "error") return "The report could not be prepared";
    if (phase === "waiting") return "Inspection completed";
    return "Preparing your report";
  }
  if (phase === "ready") return "Votre rapport est prêt";
  if (phase === "error") return "Le rapport n'a pas pu être préparé";
  if (phase === "waiting") return "Inspection complétée";
  return "Préparation du rapport";
}

export function getDeliverySubtitle(
  phase: DeliveryUserPhase,
  language: "fr" | "en" = "fr",
): string {
  if (language === "en") {
    if (phase === "ready") {
      return "All observations have been reviewed. You can deliver the report to your client.";
    }
    if (phase === "waiting") {
      return "You can close the app. We will continue preparing the report.";
    }
    if (phase === "error") {
      return "Try again or contact support.";
    }
    return "Please wait a moment.";
  }
  if (phase === "ready") {
    return "Toutes les observations ont été révisées. Vous pouvez maintenant remettre le rapport au client.";
  }
  if (phase === "waiting") {
    return "Vous pouvez fermer l'application. Nous continuons la préparation.";
  }
  if (phase === "error") {
    return "Réessayez ou contactez le support.";
  }
  return "Veuillez patienter un instant.";
}

export function getGenerationProgressHeadline(language: "fr" | "en" = "fr"): string {
  return language === "en"
    ? "Preparing your report…"
    : "Préparation de votre rapport…";
}

export function getGenerationProgressSteps(
  language: "fr" | "en" = "fr",
): { label: string; done: boolean }[] {
  if (language === "en") {
    return [
      { label: "Organizing information", done: true },
      { label: "Adding photos", done: true },
      { label: "Finalizing", done: true },
    ];
  }
  return [
    { label: "Organisation des informations", done: true },
    { label: "Ajout des photos", done: true },
    { label: "Finalisation", done: true },
  ];
}

export function shouldShowRetryButton(phase: DeliveryUserPhase): boolean {
  return phase === "error";
}

export function shouldShowContactSupport(phase: DeliveryUserPhase): boolean {
  return phase === "error";
}

export function primaryPreviewLabel(
  phase: DeliveryUserPhase,
  language: "fr" | "en" = "fr",
): string {
  if (phase === "ready") {
    return language === "en" ? "Preview report" : "Prévisualiser rapport";
  }
  return language === "en" ? "Create final report" : "Créer le rapport final";
}

/** @deprecated use primaryPreviewLabel */
export function primaryDownloadLabel(
  phase: DeliveryUserPhase,
  language: "fr" | "en" = "fr",
): string {
  return primaryPreviewLabel(phase, language);
}
