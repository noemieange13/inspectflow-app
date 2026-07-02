/**
 * Agrégation locale des événements QC (buffer session) pour la vue exécutive `/dev/product-insights`.
 */

export type TelemetryRow = {
  name: string;
  t: number;
  detail: Record<string, unknown>;
};

function syntheticCertScore(d: Record<string, unknown>): number {
  const err = typeof d.error_count === "number" ? d.error_count : Number(d.error_count) || 0;
  const warn = typeof d.warning_count === "number" ? d.warning_count : Number(d.warning_count) || 0;
  if (d.is_valid === true && err === 0) {
    return warn === 0 ? 100 : Math.max(65, 100 - warn * 6);
  }
  return Math.max(0, Math.min(100, 100 - err * 14 - warn * 5));
}

/**
 * Temps moyen entre un contrôle QC non conforme et le premier contrôle conforme suivant (même `report_id`).
 */
function averageRecoveryMs(rows: TelemetryRow[]): number | null {
  const sorted = [...rows].sort((a, b) => a.t - b.t);
  const lastInvalidByReport: Record<string, number> = {};
  const deltas: number[] = [];
  for (const r of sorted) {
    if (r.name !== "qc_certification_checked") continue;
    const rid = typeof r.detail.report_id === "string" ? r.detail.report_id : "";
    if (!rid) continue;
    const ok = r.detail.is_valid === true;
    if (ok && lastInvalidByReport[rid] != null) {
      deltas.push(r.t - lastInvalidByReport[rid]!);
      delete lastInvalidByReport[rid];
    } else if (!ok) {
      lastInvalidByReport[rid] = r.t;
    }
  }
  if (deltas.length === 0) return null;
  return Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length);
}

export function aggregateQcExecutiveKpis(rows: TelemetryRow[]): {
  checksTotal: number;
  passCount: number;
  failCheckEvents: number;
  passRate: number | null;
  avgCertificationScore: number | null;
  topErrorCodes: [string, number][];
  fixClicks: number;
  gateDistribution: Record<string, number>;
  avgRecoveryMs: number | null;
  rulesetHistogram: [string, number][];
  qcAiShown: number;
  qcAiApplied: number;
  qcAiRejected: number;
} {
  const checked = rows.filter((r) => r.name === "qc_certification_checked");
  const checksTotal = checked.length;
  const passCount = checked.filter((r) => r.detail.is_valid === true).length;
  const failCheckEvents = checksTotal - passCount;
  const passRate = checksTotal > 0 ? passCount / checksTotal : null;

  const scores = checked.map((r) => syntheticCertScore(r.detail));
  const avgCertificationScore =
    scores.length > 0
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : null;

  const codeCount: Record<string, number> = {};
  for (const r of rows) {
    if (r.name !== "qc_certification_failed") continue;
    const arr = r.detail.errors;
    if (!Array.isArray(arr)) continue;
    for (const c of arr) {
      if (typeof c !== "string" || !c.trim()) continue;
      codeCount[c] = (codeCount[c] ?? 0) + 1;
    }
  }
  const topErrorCodes = Object.entries(codeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const fixClicks = rows.filter((r) => r.name === "qc_certification_fix_clicked").length;

  const gateDistribution: Record<string, number> = {};
  for (const r of checked) {
    const g = typeof r.detail.gate === "string" ? r.detail.gate : "unknown";
    gateDistribution[g] = (gateDistribution[g] ?? 0) + 1;
  }

  const rulesetCount: Record<string, number> = {};
  for (const r of checked) {
    const id = typeof r.detail.ruleset_id === "string" ? r.detail.ruleset_id : "";
    if (!id) continue;
    rulesetCount[id] = (rulesetCount[id] ?? 0) + 1;
  }
  const rulesetHistogram = Object.entries(rulesetCount).sort((a, b) => b[1] - a[1]);

  const avgRecoveryMs = averageRecoveryMs(rows);

  const aiShown = rows.filter((r) => r.name === "qc_ai_suggestion_shown").length;
  const aiApplied = rows.filter((r) => r.name === "qc_ai_suggestion_applied").length;
  const aiRejected = rows.filter((r) => r.name === "qc_ai_suggestion_rejected").length;

  return {
    checksTotal,
    passCount,
    failCheckEvents,
    passRate,
    avgCertificationScore,
    topErrorCodes,
    fixClicks,
    gateDistribution,
    avgRecoveryMs,
    rulesetHistogram,
    qcAiShown: aiShown,
    qcAiApplied: aiApplied,
    qcAiRejected: aiRejected,
  };
}
