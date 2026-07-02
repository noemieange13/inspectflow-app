export type InspectionSeverity = "low" | "medium" | "high";

export type InspectionIssue = {
  type: string;
  severity: InspectionSeverity;
  description: string;
  recommendation: string;
};

export type InspectionResult = {
  ok: boolean;
  summary: string;
  severity: InspectionSeverity;
  issues: InspectionIssue[];
  nextStep: string;
  urgency: InspectionSeverity;
  estimatedCost?: string;
  error?: string;
  hint?: string;
  /** Dev bypass — inspecteur courant (Phase 9C). */
  inspectorAttribution?: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    name: string;
    company: string;
    role: string;
  };
};
