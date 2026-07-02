import type { IssueCode, Severity } from "@/lib/reportNarrative";

export function systemFromIssue(issue: IssueCode): string {
  switch (issue) {
    case "roof_wear":
      return "toiture";
    case "electrical_risk":
      return "electricite";
    case "plumbing_issue":
      return "plomberie";
    case "ventilation_issue":
      return "ventilation";
    case "insulation_deficiency":
      return "isolation";
    case "structure_movement":
      return "structure";
    case "water_infiltration":
      return "plomberie";
    default:
      return "general";
  }
}

export function severityRank(severity: Severity): number {
  switch (severity) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 2;
  }
}
