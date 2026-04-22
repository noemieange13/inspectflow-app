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
};
