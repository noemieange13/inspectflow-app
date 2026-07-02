import type { ComplianceRuleset } from "./types";
import {
  QC_AIBQ_2027_RULESET_ID,
  qcAibq2027Rules,
} from "./rules/qc-aibq-2027";

/** Registre extensible — ON/BC à brancher ultérieurement. */
const RULESETS: Record<string, ComplianceRuleset> = {
  [QC_AIBQ_2027_RULESET_ID]: {
    id: QC_AIBQ_2027_RULESET_ID,
    province: "QC",
    normBody: "AIBQ",
    normVersion: "2027",
    rules: qcAibq2027Rules,
  },
};

/** Alias historique QC_2027:1.0.0 → même jeu de règles. */
RULESETS["QC_2027:1.0.0"] = RULESETS[QC_AIBQ_2027_RULESET_ID]!;

export function getComplianceRuleset(rulesetId: string): ComplianceRuleset | null {
  return RULESETS[rulesetId] ?? null;
}

export function resolveRulesetIdForContext(rulesetId: string): string | null {
  if (rulesetId && RULESETS[rulesetId]) return rulesetId;
  return null;
}

export function listRegisteredRulesetIds(): string[] {
  return Object.keys(RULESETS).filter((id) => id === RULESETS[id]?.id);
}
