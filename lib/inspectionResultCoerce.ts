import type {
  InspectionIssue,
  InspectionResult,
  InspectionSeverity,
} from "@/lib/types/inspection";

function isSeverity(x: unknown): x is InspectionSeverity {
  return x === "low" || x === "medium" || x === "high";
}

function coerceSeverity(x: unknown, fallback: InspectionSeverity): InspectionSeverity {
  return isSeverity(x) ? x : fallback;
}

function coerceIssue(x: unknown): InspectionIssue | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const description = typeof o.description === "string" ? o.description.trim() : "";
  if (!description) return null;
  const recommendationRaw =
    typeof o.recommendation === "string" ? o.recommendation.trim() : "";
  const typeRaw = typeof o.type === "string" ? o.type.trim() : "";
  return {
    type: typeRaw || "constat",
    severity: coerceSeverity(o.severity, "medium"),
    description,
    recommendation: recommendationRaw || "À préciser sur place.",
  };
}

/** Assouplit une réponse JSON réseau vers `InspectionResult` (client ou serveur). */
export function coerceInspectionResult(j: unknown): InspectionResult | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const ok = o.ok === true;
  const issuesRaw = o.issues;
  const issues: InspectionIssue[] = Array.isArray(issuesRaw)
    ? issuesRaw.map(coerceIssue).filter((x): x is InspectionIssue => x !== null)
    : [];
  const summary = typeof o.summary === "string" ? o.summary : "";
  const nextStep = typeof o.nextStep === "string" ? o.nextStep : "";
  const estimatedCost =
    typeof o.estimatedCost === "string" && o.estimatedCost.trim()
      ? o.estimatedCost.trim()
      : undefined;
  const error = typeof o.error === "string" ? o.error : undefined;
  const hint = typeof o.hint === "string" ? o.hint : undefined;
  return {
    ok,
    summary,
    severity: coerceSeverity(o.severity, "medium"),
    issues,
    nextStep,
    urgency: coerceSeverity(o.urgency ?? o.severity, coerceSeverity(o.severity, "medium")),
    estimatedCost,
    error,
    hint,
  };
}
