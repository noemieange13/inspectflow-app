import type {
  ComplianceContext,
  ComplianceGate,
  ComplianceIssue,
  ComplianceValidationResult,
  ComplianceValidationV1,
} from "./types";
import { getComplianceRuleset, resolveRulesetIdForContext } from "./registry";
import { buildNoRulesetComplianceResult } from "./noRuleset";
import { buildQcAibq2027Checklist, QC_AIBQ_2027_RULESET_ID } from "./rules/qc-aibq-2027";

function issueFromResult(r: {
  code: string;
  severity: ComplianceIssue["severity"];
  messageFr?: string;
  focusId?: string;
  focusPage?: "cover" | "report";
}): ComplianceIssue | null {
  if (!r.messageFr) return null;
  return {
    code: r.code,
    severity: r.severity,
    messageFr: r.messageFr,
    focusId: r.focusId,
    focusPage: r.focusPage,
  };
}

/** Gate conformité → export PDF autorisé (ready ou warning). */
export function isCompliancePdfBlocked(gate: ComplianceGate): boolean {
  return gate === "blocked";
}

export function resolveComplianceGate(
  blocking: ComplianceIssue[],
  warnings: ComplianceIssue[],
): ComplianceGate {
  if (blocking.length > 0) return "blocked";
  if (warnings.length > 0) return "warning";
  return "ready";
}

/**
 * Point d’entrée unique — aucune règle dans les composants UI.
 */
export function validateCompliance(ctx: ComplianceContext): ComplianceValidationResult {
  const validatedAt = new Date().toISOString();
  const rulesetId =
    resolveRulesetIdForContext(ctx.rulesetId) ??
    (ctx.province === "QC" ? QC_AIBQ_2027_RULESET_ID : "");

  if (!rulesetId) {
    return buildNoRulesetComplianceResult(validatedAt);
  }

  const ruleset = getComplianceRuleset(rulesetId);
  if (!ruleset) {
    return buildNoRulesetComplianceResult(validatedAt, rulesetId);
  }

  const results = [];
  const blocking: ComplianceIssue[] = [];
  const warnings: ComplianceIssue[] = [];
  const passedMap = new Map<string, boolean>();

  for (const rule of ruleset.rules) {
    if (!rule.applies(ctx)) continue;
    const result = rule.evaluate(ctx);
    results.push(result);
    passedMap.set(result.code, result.passed);
    const issue = issueFromResult(result);
    if (!issue) continue;
    if (result.severity === "warn") warnings.push(issue);
    else blocking.push(issue);
  }

  const checklist =
    rulesetId === QC_AIBQ_2027_RULESET_ID
      ? buildQcAibq2027Checklist(ctx, passedMap)
      : null;

  return {
    rulesetId,
    validatedAt,
    gate: resolveComplianceGate(blocking, warnings),
    blocking,
    warnings,
    results,
    checklist,
  };
}

export function buildComplianceValidationV1(
  result: ComplianceValidationResult,
): ComplianceValidationV1 {
  return {
    schema_version: 1,
    ruleset_id: result.rulesetId,
    validated_at: result.validatedAt,
    gate: result.gate,
    results: result.results,
    blocking: result.blocking,
    warnings: result.warnings,
    checklist: result.checklist,
  };
}

export function mergeComplianceValidationIntoPayload(
  payload: Record<string, unknown>,
  validation: ComplianceValidationV1,
): Record<string, unknown> {
  return {
    ...payload,
    compliance_validation_v1: validation,
  };
}

/** En-tête HTTP — métadonnées conformité sur réponse PDF Smart (corps binaire). */
export const COMPLIANCE_VALIDATION_RESPONSE_HEADER =
  "X-InspectFlow-Compliance-Validation-V1";
