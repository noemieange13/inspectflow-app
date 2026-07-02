/**
 * Phase 8P — Parcours inspecteur : terrain (Steve / assistant) vs après inspection.
 */
export const INSPECTION_WORKFLOW_V1_KEY = "inspection_workflow_v1" as const;
export const INSPECTOR_FIELD_NOTES_V1_KEY = "inspector_field_notes_v1" as const;

export type InspectorWorkflowMode = "field_assistant" | "post_inspection";

export type InspectionWorkflowV1 = {
  schema_version: 1;
  mode: InspectorWorkflowMode;
  chosen_at: string;
};

export type InspectorFieldNotesV1 = {
  schema_version: 1;
  text: string;
  source: "typed" | "dictated" | "pasted";
  updated_at: string;
};

const WORKFLOW_SET = new Set<string>(["field_assistant", "post_inspection"]);

export function normalizeInspectorWorkflowMode(raw: unknown): InspectorWorkflowMode {
  if (typeof raw === "string" && WORKFLOW_SET.has(raw.trim())) {
    return raw.trim() as InspectorWorkflowMode;
  }
  return "field_assistant";
}

export function buildInspectionWorkflowV1(
  mode: InspectorWorkflowMode,
  chosenAt = new Date().toISOString(),
): InspectionWorkflowV1 {
  return {
    schema_version: 1,
    mode: normalizeInspectorWorkflowMode(mode),
    chosen_at: chosenAt,
  };
}

export function parseInspectionWorkflowV1(raw: unknown): InspectionWorkflowV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== 1) return null;
  return buildInspectionWorkflowV1(
    normalizeInspectorWorkflowMode(o.mode),
    typeof o.chosen_at === "string" ? o.chosen_at : new Date().toISOString(),
  );
}

export function readInspectionWorkflowFromPayload(
  payload: Record<string, unknown> | null | undefined,
): InspectionWorkflowV1 | null {
  if (!payload) return null;
  return parseInspectionWorkflowV1(payload[INSPECTION_WORKFLOW_V1_KEY]);
}

export function isPostInspectionWorkflow(
  payload: Record<string, unknown> | null | undefined,
): boolean {
  return readInspectionWorkflowFromPayload(payload)?.mode === "post_inspection";
}

export function parseInspectorFieldNotesV1(raw: unknown): InspectorFieldNotesV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== 1) return null;
  const text = typeof o.text === "string" ? o.text : "";
  const source =
    o.source === "dictated" || o.source === "pasted" || o.source === "typed"
      ? o.source
      : "typed";
  return {
    schema_version: 1,
    text,
    source,
    updated_at:
      typeof o.updated_at === "string" && o.updated_at.trim()
        ? o.updated_at.trim()
        : new Date().toISOString(),
  };
}

export function readInspectorFieldNotesFromPayload(
  payload: Record<string, unknown> | null | undefined,
): InspectorFieldNotesV1 | null {
  if (!payload) return null;
  return parseInspectorFieldNotesV1(payload[INSPECTOR_FIELD_NOTES_V1_KEY]);
}

export function buildInspectorFieldNotesV1(
  text: string,
  source: InspectorFieldNotesV1["source"],
  updatedAt = new Date().toISOString(),
): InspectorFieldNotesV1 {
  return {
    schema_version: 1,
    text: text.trim(),
    source,
    updated_at: updatedAt,
  };
}

export const WORKFLOW_CHOICE_COPY = {
  fr: {
    title: "Comment voulez-vous travailler aujourd'hui ?",
    fieldTitle: "Pendant l'inspection",
    fieldDesc: "Je prends mes photos et mes notes sur place",
    postTitle: "Après l'inspection",
    postDesc: "J'importe mes photos après ma visite",
    remember: "Toujours utiliser cette méthode",
    recommendedBadge: "Recommandé pour commencer",
  },
  en: {
    title: "How would you like to work today?",
    fieldTitle: "During the inspection",
    fieldDesc: "I take photos and notes on site",
    postTitle: "After the inspection",
    postDesc: "I import my photos after the visit",
    remember: "Always use this method",
    recommendedBadge: "Recommended to get started",
  },
} as const;

/** localStorage — pas de migration DB (8R mémorisation choix workflow). */
export const REMEMBER_WORKFLOW_CHOICE_STORAGE_KEY =
  "inspectflow_remember_workflow_v1" as const;

export function isWorkflowChoiceRemembered(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(REMEMBER_WORKFLOW_CHOICE_STORAGE_KEY) === "1";
}

export function setWorkflowChoiceRemembered(remember: boolean): void {
  if (typeof window === "undefined") return;
  if (remember) {
    window.localStorage.setItem(REMEMBER_WORKFLOW_CHOICE_STORAGE_KEY, "1");
  } else {
    window.localStorage.removeItem(REMEMBER_WORKFLOW_CHOICE_STORAGE_KEY);
  }
}

export function shouldSkipWorkflowChoiceStep(
  preferredWorkflow: InspectorWorkflowMode | null | undefined,
): boolean {
  return isWorkflowChoiceRemembered() && preferredWorkflow != null;
}
