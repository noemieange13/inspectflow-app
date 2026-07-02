import { sha256Hex } from "@/lib/sha256Hex";

import type { ComplianceJurisdiction } from "@/lib/inspectionCoverPayload";
import type { QcLegalClauseRow } from "@/lib/qcLegalClauses";
import type { ReportLanguage } from "@/lib/reportNarrative";

/**
 * Trace audit : quelle version de clause a été figée au moment de la génération.
 * Ne remplace pas un registre juridique externe — permet de prouver quelle chaîne a été rendue.
 */
export type ClauseSnapshot = {
  clause_code: string;
  version: string | null;
  language: ReportLanguage;
  taken_at: string;
};

/**
 * Champs sous `payload.compliance` écrits par `ensureReportPayloadHtml` lorsque
 * `cover_v1` est valide : preuve d’audit (versions figées au moment de la génération).
 * `taken_at` sur chaque entrée de `clause_snapshot` est identique à
 * `clause_snapshot_generated_at` pour ce passage.
 */
export type ReportComplianceClauseTraceV1 = {
  clause_snapshot: ClauseSnapshot[];
  clause_snapshot_generated_at: string;
  clause_snapshot_pack: string;
  /** Empreinte stable du JSON canonique de `clause_snapshot` (anti-altération). */
  clause_snapshot_sha256?: string | null;
};

/** Sérialisation déterministe pour empreinte audit (ordre des clés figé). */
export function serializeClauseSnapshotForHash(snap: ClauseSnapshot[]): string {
  const normalized = snap.map((s) => ({
    clause_code: s.clause_code,
    language: s.language,
    taken_at: s.taken_at,
    version: s.version,
  }));
  return JSON.stringify(normalized);
}

export function hashClauseSnapshotSha256(snap: ClauseSnapshot[]): string {
  return sha256Hex(serializeClauseSnapshotForHash(snap));
}

export function buildClauseSnapshots(
  rows: QcLegalClauseRow[],
  takenAt: string,
): ClauseSnapshot[] {
  return rows.map((r) => ({
    clause_code: r.code ?? r.id,
    version: r.version,
    language: (r.resolved_language ?? "fr") as ReportLanguage,
    taken_at: takenAt,
  }));
}

export function mergeClauseSnapshots(
  ...chunks: ClauseSnapshot[][]
): ClauseSnapshot[] {
  const m = new Map<string, ClauseSnapshot>();
  for (const chunk of chunks) {
    for (const s of chunk) {
      m.set(`${s.clause_code}\0${s.language}`, s);
    }
  }
  return [...m.values()].sort((a, b) =>
    a.clause_code.localeCompare(b.clause_code),
  );
}

/** Québec + rapport en anglais : inclure les clauses FR en parallèle (référence légale). */
export function shouldFetchQuebecFrenchParallel(
  jurisdiction: ComplianceJurisdiction | undefined,
  reportLang: ReportLanguage,
): boolean {
  return jurisdiction === "ca_qc" && reportLang === "en";
}
