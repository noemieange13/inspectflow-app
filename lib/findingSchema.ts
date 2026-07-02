/**
 * Phase 8V — Schéma obligatoire par constat Steve.
 */

export const STEVE_FINDING_V1_KEY = "steve_finding_v1" as const;
export const STEVE_FINDINGS_V1_KEY = "steve_findings_v1" as const;

export type SteveFindingSeverity =
  | "none"
  | "entretien"
  | "mineur"
  | "majeur"
  | "securite";

export type SteveFindingStatus = "pending" | "conforme" | "observation" | "na" | "approved";

export type SteveFindingV1 = {
  schema_version: 1;
  component_id: string;
  section: string;
  component: string;
  limitation_standard?: string;
  observation: string;
  commentaire: string;
  recommandation_optional?: string;
  severity: SteveFindingSeverity;
  photos: string[];
  status?: SteveFindingStatus;
  approved?: boolean;
};

export type SteveFindingsPayloadV1 = {
  schema_version: 1;
  findings: SteveFindingV1[];
};

export type SteveFindingValidationResult = {
  valid: boolean;
  errors: string[];
};

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateSteveFinding(finding: SteveFindingV1): SteveFindingValidationResult {
  const errors: string[] = [];

  if (finding.schema_version !== 1) errors.push("schema_version must be 1");
  if (!nonEmpty(finding.component_id)) errors.push("component_id required");
  if (!nonEmpty(finding.section)) errors.push("section required");
  if (!nonEmpty(finding.component)) errors.push("component required");
  if (!nonEmpty(finding.observation)) errors.push("observation required");
  if (!nonEmpty(finding.commentaire)) errors.push("commentaire required");

  const severities: SteveFindingSeverity[] = [
    "none",
    "entretien",
    "mineur",
    "majeur",
    "securite",
  ];
  if (!severities.includes(finding.severity)) errors.push("invalid severity");

  if (!Array.isArray(finding.photos)) errors.push("photos must be array");

  return { valid: errors.length === 0, errors };
}

export function parseSteveFindingV1(raw: unknown): SteveFindingV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== 1) return null;

  const finding: SteveFindingV1 = {
    schema_version: 1,
    component_id: typeof o.component_id === "string" ? o.component_id : "",
    section: typeof o.section === "string" ? o.section : "",
    component: typeof o.component === "string" ? o.component : "",
    limitation_standard:
      typeof o.limitation_standard === "string" ? o.limitation_standard.trim() : undefined,
    observation: typeof o.observation === "string" ? o.observation.trim() : "",
    commentaire: typeof o.commentaire === "string" ? o.commentaire.trim() : "",
    recommandation_optional:
      typeof o.recommandation_optional === "string"
        ? o.recommandation_optional.trim() || undefined
        : undefined,
    severity: (typeof o.severity === "string" ? o.severity : "none") as SteveFindingSeverity,
    photos: Array.isArray(o.photos)
      ? o.photos.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      : [],
    status: typeof o.status === "string" ? (o.status as SteveFindingStatus) : undefined,
    approved: typeof o.approved === "boolean" ? o.approved : undefined,
  };

  return validateSteveFinding(finding).valid ? finding : null;
}

export function parseSteveFindingsPayloadV1(raw: unknown): SteveFindingsPayloadV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== 1 || !Array.isArray(o.findings)) return null;
  const findings = o.findings
    .map((row) => parseSteveFindingV1(row))
    .filter(Boolean) as SteveFindingV1[];
  return { schema_version: 1, findings };
}

export function readSteveFindingsFromPayload(
  payload: Record<string, unknown>,
): SteveFindingV1[] {
  const parsed = parseSteveFindingsPayloadV1(payload[STEVE_FINDINGS_V1_KEY]);
  return parsed?.findings ?? [];
}

export function shouldHideSteveFindingSection(finding: SteveFindingV1): boolean {
  return finding.status === "na";
}

export function buildConformeFinding(input: {
  component_id: string;
  section: string;
  component: string;
  observation: string;
  commentaire: string;
  limitation_standard?: string;
}): SteveFindingV1 {
  return {
    schema_version: 1,
    component_id: input.component_id,
    section: input.section,
    component: input.component,
    limitation_standard: input.limitation_standard,
    observation: input.observation,
    commentaire: input.commentaire,
    severity: "none",
    photos: [],
    status: "conforme",
    approved: true,
  };
}
