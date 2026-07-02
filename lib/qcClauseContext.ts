/**
 * Contexte d’évaluation pour `qc_legal_clauses.applies_if` (clauses conditionnelles).
 */

import { QC_SYSTEM_ZONE_GROUPS } from "@/lib/qcSystemSections";

export type ClauseEvaluationContext = Record<string, boolean | number | string>;

function parseEntriesWithSeverity(
  raw: unknown,
): Array<{ zone: string; severity: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ zone: string; severity: string }> = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const zone = typeof o.zone === "string" ? o.zone : "";
    const severity = typeof o.severity === "string" ? o.severity : "low";
    if (zone) out.push({ zone, severity });
  }
  return out;
}

/**
 * Construit le contexte booléen / compteurs pour `evaluateAppliesIf`.
 */
export function buildClauseEvaluationContext(
  payload: Record<string, unknown>,
): ClauseEvaluationContext {
  const entries = parseEntriesWithSeverity(payload.entries);
  const roofZones = new Set<string>(QC_SYSTEM_ZONE_GROUPS.toiture);
  let roof_issue_detected = false;
  let high_severity_any = false;
  let medium_or_high_any = false;
  for (const e of entries) {
    const s = e.severity.toLowerCase();
    if (s === "high") {
      high_severity_any = true;
      medium_or_high_any = true;
      if (roofZones.has(e.zone)) roof_issue_detected = true;
    } else if (s === "medium") {
      medium_or_high_any = true;
    }
  }

  return {
    roof_issue_detected,
    high_severity_any,
    medium_or_high_any,
  };
}

/**
 * Expressions supportées : vide = toujours vrai ; `key = true|false` (clés du contexte).
 */
export function evaluateAppliesIf(
  appliesIf: string | null | undefined,
  ctx: ClauseEvaluationContext,
): boolean {
  if (appliesIf == null || !String(appliesIf).trim()) return true;
  const t = String(appliesIf).trim();
  const m = /^([a-zA-Z0-9_]+)\s*=\s*(true|false)$/i.exec(t);
  if (!m) return true;
  const key = m[1]!;
  const want = m[2]!.toLowerCase() === "true";
  const got = ctx[key];
  return typeof got === "boolean" ? got === want : false;
}
