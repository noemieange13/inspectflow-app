import {
  COMPLIANCE_NO_RULESET_CODE,
  COMPLIANCE_NO_RULESET_MESSAGE_FR,
  type ComplianceValidationResult,
} from "./types";

export function buildNoRulesetComplianceResult(
  validatedAt: string,
  rulesetId = "",
): ComplianceValidationResult {
  return {
    rulesetId,
    validatedAt,
    gate: "warning",
    blocking: [],
    warnings: [
      {
        code: COMPLIANCE_NO_RULESET_CODE,
        severity: "warn",
        messageFr: COMPLIANCE_NO_RULESET_MESSAGE_FR,
      },
    ],
    results: [],
    checklist: null,
  };
}
