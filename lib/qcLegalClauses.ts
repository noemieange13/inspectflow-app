/**
 * Clauses légales (`qc_legal_clause_defs` + `qc_legal_clause_translations`) pour injection PDF.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildClauseEvaluationContext,
  evaluateAppliesIf,
} from "@/lib/qcClauseContext";
import type { ComplianceJurisdiction } from "@/lib/inspectionCoverPayload";
import type { ReportLanguage } from "@/lib/reportNarrative";
import { normalizeReportLanguage } from "@/lib/reportNarrative";

export type QcLegalClauseRow = {
  id: string;
  /** Code stable (ex. pour audit). */
  code?: string;
  province: string;
  section: string;
  /** Texte résolu selon la langue du rapport (ou repli contrôlé). */
  clause: string;
  mandatory: boolean;
  version: string | null;
  created_at: string;
  applies_if?: string | null;
  /** Langue réelle du champ `clause` après résolution i18n. */
  resolved_language?: ReportLanguage;
};

const JURISDICTION_TO_PROVINCE: Record<ComplianceJurisdiction, string> = {
  ca_qc: "QC",
  ca_on: "ON",
  ca_bc: "BC",
  ca_ab: "AB",
  ca_mb: "MB",
  ca_sk: "SK",
  ca_ns: "NS",
  ca_nb: "NB",
  ca_pe: "PE",
  ca_nl: "NL",
  ca_nt: "NT",
  ca_yt: "YT",
  ca_nu: "NU",
  ca_general: "CA",
};

export function provinceCodeForLegalClauses(
  jurisdiction: ComplianceJurisdiction,
): string {
  return JURISDICTION_TO_PROVINCE[jurisdiction] ?? "CA";
}

export function getPayloadReportLanguage(
  payload: Record<string, unknown>,
): ReportLanguage {
  return normalizeReportLanguage(payload.language ?? payload.lang);
}

function strictEnglishFromEnv(): boolean {
  return (
    typeof process !== "undefined" &&
    process.env.LEGAL_CLAUSES_STRICT_EN === "true"
  );
}

type DefRow = {
  id: string;
  code: string;
  province: string;
  section: string;
  mandatory: boolean;
  version: string | null;
  applies_if: string | null;
  created_at: string;
  qc_legal_clause_translations: Array<{
    language: string;
    body: string;
    title: string | null;
    is_official: boolean;
  }> | null;
};

export function groupClausesBySection(
  clauses: QcLegalClauseRow[],
): Record<string, string[]> {
  return clauses.reduce(
    (acc, c) => {
      const k = (c.section ?? "").trim() || "general";
      if (!acc[k]) acc[k] = [];
      acc[k].push(c.clause);
      return acc;
    },
    {} as Record<string, string[]>,
  );
}

export type FetchLegalClausesOptions = {
  /** Si true et langue `en`, absence de traduction EN → erreur (pas de rapport incohérent). */
  strictEnglish?: boolean;
};

/**
 * Clauses Canada + province pour la langue demandée (repli FR si EN absent et non strict).
 */
export async function getLegalClauses(
  supabase: SupabaseClient,
  province: string,
  language: ReportLanguage = "fr",
  options?: FetchLegalClausesOptions,
): Promise<QcLegalClauseRow[]> {
  const provinces = Array.from(new Set(["CA", province].filter((p) => p.length > 0)));
  const strictEnglish =
    options?.strictEnglish ?? strictEnglishFromEnv();

  const { data, error } = await supabase
    .from("qc_legal_clause_defs")
    .select(
      `
      id,
      code,
      province,
      section,
      mandatory,
      version,
      applies_if,
      created_at,
      qc_legal_clause_translations ( language, body, title, is_official )
    `,
    )
    .in("province", provinces)
    .order("section", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;

  const rows: QcLegalClauseRow[] = [];

  for (const raw of (data ?? []) as DefRow[]) {
    const trs = raw.qc_legal_clause_translations ?? [];
    const fr = trs.find((t) => t.language === "fr");
    const en = trs.find((t) => t.language === "en");

    let clause: string;
    let resolved_language: ReportLanguage;

    if (language === "en") {
      if (en?.body?.trim()) {
        clause = en.body.trim();
        resolved_language = "en";
      } else if (strictEnglish) {
        throw new Error(
          `[qcLegalClauses] Missing English translation for clause ${raw.code} (${raw.province}/${raw.section}). Set LEGAL_CLAUSES_STRICT_EN=0 or add EN text in qc_legal_clause_translations.`,
        );
      } else {
        clause = (fr?.body ?? "").trim();
        resolved_language = "fr";
        if (
          typeof process !== "undefined" &&
          process.env.NODE_ENV === "development"
        ) {
          console.warn(
            "[qcLegalClauses] EN missing — FR fallback for legal clause",
            { code: raw.code, province: raw.province, section: raw.section },
          );
        }
      }
    } else {
      clause = (fr?.body ?? en?.body ?? "").trim();
      resolved_language = fr?.body ? "fr" : "en";
    }

    rows.push({
      id: raw.id,
      code: raw.code,
      province: raw.province,
      section: raw.section,
      clause,
      mandatory: raw.mandatory,
      version: raw.version,
      created_at: raw.created_at,
      applies_if: raw.applies_if,
      resolved_language,
    });
  }

  return rows;
}

export async function fetchLegalClausesForCoverJurisdiction(
  supabase: SupabaseClient,
  jurisdiction: ComplianceJurisdiction,
  language: ReportLanguage = "fr",
  options?: FetchLegalClausesOptions,
): Promise<QcLegalClauseRow[]> {
  const code = provinceCodeForLegalClauses(jurisdiction);
  return getLegalClauses(supabase, code, language, options);
}

export function filterLegalClausesByReportContext(
  rows: QcLegalClauseRow[],
  payload: Record<string, unknown>,
): QcLegalClauseRow[] {
  const ctx = buildClauseEvaluationContext(payload);
  return rows.filter((r) => evaluateAppliesIf(r.applies_if, ctx));
}

/**
 * Vérifie que chaque clause affichée en anglais provient bien d’une traduction EN
 * (après contexte — utiliser sur les lignes déjà filtrées).
 */
export function assertEnglishClausesResolved(
  rows: QcLegalClauseRow[],
  reportLanguage: ReportLanguage,
): void {
  if (reportLanguage !== "en") return;
  const bad = rows.filter((r) => r.resolved_language !== "en");
  if (bad.length === 0) return;
  throw new Error(
    `[qcLegalClauses] Report language is English but ${bad.length} clause(s) use non-English text (strict compliance). Codes: ${bad.map((r) => r.code ?? r.id).join(", ")}`,
  );
}
