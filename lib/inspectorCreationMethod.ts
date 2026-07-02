/**
 * Phase 8S — Préférence création inspection (import document vs manuel).
 */
import type { DefaultReportPreferences } from "@/lib/inspectorProfile";

export type InspectorCreationMethod = "document_import" | "manual";

const METHOD_SET = new Set<string>(["document_import", "manual"]);

export function normalizeInspectorCreationMethod(raw: unknown): InspectorCreationMethod {
  if (typeof raw === "string" && METHOD_SET.has(raw.trim())) {
    return raw.trim() as InspectorCreationMethod;
  }
  return "document_import";
}

export function readPreferredCreationMethod(
  prefs: DefaultReportPreferences | null | undefined,
): InspectorCreationMethod {
  return normalizeInspectorCreationMethod(prefs?.preferred_creation_method);
}

export const REMEMBER_CREATION_METHOD_STORAGE_KEY =
  "inspectflow_remember_creation_method_v1" as const;

export function isCreationMethodRemembered(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(REMEMBER_CREATION_METHOD_STORAGE_KEY) === "1";
}

export function setCreationMethodRemembered(remember: boolean): void {
  if (typeof window === "undefined") return;
  if (remember) {
    window.localStorage.setItem(REMEMBER_CREATION_METHOD_STORAGE_KEY, "1");
  } else {
    window.localStorage.removeItem(REMEMBER_CREATION_METHOD_STORAGE_KEY);
  }
}

export function shouldSkipCreationMethodStep(
  method: InspectorCreationMethod | null | undefined,
): boolean {
  return isCreationMethodRemembered() && method != null;
}

export const CREATION_METHOD_COPY = {
  fr: {
    title: "Comment voulez-vous créer l'inspection ?",
    importTitle: "Importer les documents de l'inspection",
    importDesc: "Courriel, DV, ancien rapport — plusieurs fichiers, une seule vérification",
    importBadge: "Recommandé",
    manualTitle: "Entrer les informations moi-même",
    manualDesc: "Adresse et client à la main",
    remember: "Toujours utiliser cette méthode",
    changeMethod: "Changer de méthode",
    subtitle:
      "Glissez le courriel, la DV et l'ancien rapport — nous fusionnons les informations.",
    importHint: "PDF, courriel (.eml) ou texte — plusieurs fichiers acceptés",
    analyzing: "Analyse en cours…",
  },
  en: {
    title: "How would you like to create the inspection?",
    importTitle: "Import client email or document",
    importDesc: "PDF, email (.eml) or text — fields fill in automatically",
    importBadge: "Recommended",
    manualTitle: "Enter details myself",
    manualDesc: "Address and client by hand",
    remember: "Always use this method",
    changeMethod: "Change method",
    subtitle: "Import the client email or enter basic details.",
    importHint: "PDF, email (.eml) or text file",
    analyzing: "Analyzing…",
  },
} as const;

export const INSPECTION_FORM_INPUT_CLASS =
  "mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-base text-gray-900 placeholder:text-gray-400";

export const INSPECTION_FORM_SELECT_CLASS =
  "mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-base text-gray-900";
