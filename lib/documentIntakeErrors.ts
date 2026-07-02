/**
 * Pilot #0.8 — user-facing document intake error messages.
 */
export type DocumentIntakeErrorKind = "auth" | "ocr" | "network" | "server" | "validation";

export const OCR_MANUAL_FALLBACK_UI_MESSAGE =
  "Le document n'a pas pu être lu automatiquement. Vous pouvez continuer et compléter les champs.";

export function isOcrEngineFailure(input: {
  ocr_engine?: { success?: boolean } | null;
}): boolean {
  return input.ocr_engine?.success === false;
}

export function isAuthErrorCode(error?: string | null): boolean {
  const code = (error ?? "").trim().toLowerCase();
  return (
    code === "access_denied" ||
    code.includes("session") ||
    code.includes("unauthorized") ||
    code.includes("not authenticated")
  );
}

export function isOcrOrExtractionError(input: {
  status?: number;
  error?: string | null;
}): boolean {
  if (input.status === 422) return true;
  const code = (input.error ?? "").trim().toLowerCase();
  return code.includes("ocr") || code.includes("extraction") || code.includes("analyse");
}

export function resolveDocumentAnalyzeError(input: {
  status?: number;
  error?: string | null;
  fileName?: string;
  kind?: "analyze" | "import";
}): { message: string; kind: DocumentIntakeErrorKind } {
  const code = (input.error ?? "").trim();
  const actionLabel = input.kind === "import" ? "Import" : "Analyse";

  if (input.status === 401 || input.status === 403 || isAuthErrorCode(code)) {
    return {
      message: "Session expirée — reconnectez-vous pour continuer.",
      kind: "auth",
    };
  }

  if (isOcrOrExtractionError(input)) {
    return {
      message: "Analyse du document impossible.",
      kind: "ocr",
    };
  }

  if (code) {
    return { message: code, kind: "server" };
  }

  if (input.fileName) {
    return {
      message: `${actionLabel} impossible : ${input.fileName}`,
      kind: "server",
    };
  }

  return {
    message: `${actionLabel} impossible.`,
    kind: "server",
  };
}

export function resolveDocumentNetworkError(kind: "analyze" | "import" = "analyze"): string {
  return kind === "import"
    ? "Erreur réseau lors de l'import."
    : "Erreur réseau lors de l'analyse.";
}

export function resolveUnexpectedAnalyzeError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    if (isAuthErrorCode(error.message)) {
      return "Session expirée — reconnectez-vous pour continuer.";
    }
    if (isOcrOrExtractionError({ error: error.message })) {
      return "Analyse du document impossible.";
    }
    return error.message.trim();
  }
  return resolveDocumentNetworkError("analyze");
}

export function resolveCreateInspectionAuthError(): string {
  return "Connectez-vous pour créer une inspection.";
}

export function resolveCreateInspectionError(input: {
  status?: number;
  error?: string | null;
}): string {
  if (input.status === 401 || input.status === 403 || isAuthErrorCode(input.error)) {
    return "Session expirée — reconnectez-vous pour créer l'inspection.";
  }
  if (input.error?.trim()) return input.error.trim();
  return "Impossible de créer l'inspection.";
}
