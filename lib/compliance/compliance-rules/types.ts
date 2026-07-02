import type { NormBody, ProvinceCode, SectionId } from "@/lib/compliance/inspection-norms";
import type { InspectionCoverPayloadV1 } from "@/lib/inspectionCoverPayload";
import type { QcSystemCode } from "@/lib/qcSystemSections";

export type ComplianceGate = "ready" | "blocked" | "warning";

export const COMPLIANCE_NO_RULESET_CODE = "compliance_no_ruleset" as const;
export const COMPLIANCE_NO_RULESET_MESSAGE_FR =
  "Aucune validation normative disponible pour cette province." as const;

export type ComplianceRuleSeverity = "block_critical" | "block" | "warn";

export type ComplianceIssue = {
  code: string;
  severity: ComplianceRuleSeverity;
  messageFr: string;
  focusId?: string;
  focusPage?: "cover" | "report";
};

export type NormalizedConstat = {
  id: string;
  systemCode?: QcSystemCode;
  normSectionId?: SectionId;
  hasObservationText: boolean;
  hasRecommendation: boolean;
  severity?: string;
  /** Index aligné entries ↔ sections (Zero Draft) — jamais utilisé pour lier photos. */
  entryIndex?: number;
};

export type NormalizedPhoto = {
  photo_id: string;
  observation_id: string | null;
};

export type ComplianceReportScope = "full" | "cover_only";

export type ComplianceContext = {
  province: ProvinceCode;
  normBody: NormBody;
  normVersion: string;
  rulesetId: string;
  cover: InspectionCoverPayloadV1 | null;
  constats: NormalizedConstat[];
  photos: NormalizedPhoto[];
  reportScope: ComplianceReportScope;
};

export type ComplianceRuleResult = {
  ruleId: string;
  code: string;
  passed: boolean;
  severity: ComplianceRuleSeverity;
  messageFr?: string;
  focusId?: string;
  focusPage?: "cover" | "report";
};

export type ComplianceChecklist = {
  identification: {
    address: boolean;
    client: boolean;
    inspector: boolean;
    license: boolean;
    date: boolean;
    weather: boolean;
  };
  limitations: boolean;
  systemsSeven: boolean;
  systemsRecommendations: boolean;
  photosLinked: boolean;
  photosSufficient: boolean;
  electricalMinPhotos: boolean;
  legalProfile: boolean;
  signature: boolean;
};

export type ComplianceValidationResult = {
  rulesetId: string;
  validatedAt: string;
  gate: ComplianceGate;
  blocking: ComplianceIssue[];
  warnings: ComplianceIssue[];
  results: ComplianceRuleResult[];
  checklist: ComplianceChecklist | null;
};

export type ComplianceValidationV1 = {
  schema_version: 1;
  ruleset_id: string;
  validated_at: string;
  gate: ComplianceGate;
  results: ComplianceRuleResult[];
  blocking: ComplianceIssue[];
  warnings: ComplianceIssue[];
  checklist?: ComplianceChecklist | null;
};

export type ComplianceRule = {
  id: string;
  code: string;
  severity: ComplianceRuleSeverity;
  applies: (ctx: ComplianceContext) => boolean;
  evaluate: (ctx: ComplianceContext) => ComplianceRuleResult;
};

export type ComplianceRuleset = {
  id: string;
  province: ProvinceCode;
  normBody: NormBody;
  normVersion: string;
  rules: ComplianceRule[];
};
