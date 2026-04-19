/**
 * Certification QC 2027 — règles « audit-ready » alignées sur la grille systèmes + payload réel (cover_v1, entries, sections).
 */

import { getComplianceExportMode, type InspectionCoverPayloadV1 } from "@/lib/inspectionCoverPayload";
import { hasMinimumLimitationsContent } from "@/lib/limitations";
import type { ReadinessIssue } from "@/lib/reportReadiness";
import {
  findInsufficientQcPhotoCoverage,
  findMissingQcSystemSections,
  QC_SYSTEM_CODES,
  QC_SYSTEM_ZONE_GROUPS,
  type QcSystemCode,
  type ReportEntryLike,
} from "@/lib/qcSystemSections";

/** Identifiant versionné pour télémétrie / audit (à garder aligné avec les migrations métier). */
export const QC_CERTIFICATION_STANDARD = "QC_2027" as const;
/** Version sémantique du jeu de règles évalué par `evaluateQc2027Certification`. */
export const QC_CERTIFICATION_RULESET_VERSION = "1.0.0" as const;
export const QC_CERTIFICATION_RULESET_ID = `${QC_CERTIFICATION_STANDARD}:${QC_CERTIFICATION_RULESET_VERSION}`;

export type QcCertificationChecklist = {
  identification: {
    address: boolean;
    client: boolean;
    inspector: boolean;
    license: boolean;
    date: boolean;
    weather: boolean;
  };
  limitations: boolean;
  /** Au moins un constat par système (zones + note). */
  systemsSeven: boolean;
  /** Recommandation renseignée si gravité moyenne ou élevée. */
  systemsRecommendations: boolean;
  photosDeclared: boolean;
  photosSufficient: boolean;
  legalProfile: boolean;
  signature: boolean;
};

export type QcCertificationReportScope = "full" | "cover_only";

export type QcCertificationOptions = {
  reportEntries?: ReportEntryLike[];
  /** `severity` + `zone` par entrée — même ordre que `sections`. */
  rawEntries?: unknown;
  photosCoverageByZone?: Partial<Record<string, number>> | null;
  /** Sections générées (Zero Draft), même ordre que les entrées. */
  reportSections?: unknown;
  /**
   * `cover_only` : identification + limitations + profil conformité (sans constats / photos — ex. formulaire couverture seul).
   */
  reportScope?: QcCertificationReportScope;
};

type EntrySeverity = "low" | "medium" | "high" | string;

function parseEntriesWithSeverity(raw: unknown): Array<{ zone: string; note: string; severity: EntrySeverity }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ zone: string; note: string; severity: EntrySeverity }> = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const zone = typeof o.zone === "string" ? o.zone : "";
    const note = typeof o.note === "string" ? o.note : "";
    const sev = typeof o.severity === "string" ? o.severity : "low";
    out.push({ zone, note, severity: sev });
  }
  return out;
}

function normalizeSections(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is Record<string, unknown> => x != null && typeof x === "object");
}

/** Indices où gravité ≥ medium et recommandation requise. */
function findRecommendationGaps(
  entries: Array<{ zone: string; note: string; severity: EntrySeverity }>,
  sections: Array<Record<string, unknown>>,
): number[] {
  const gaps: number[] = [];
  const n = Math.min(entries.length, sections.length);
  for (let i = 0; i < n; i++) {
    const sev = entries[i]!.severity;
    if (sev !== "medium" && sev !== "high") continue;
    const rec = sections[i]!.recommendation;
    const recStr = typeof rec === "string" ? rec.trim() : "";
    if (!recStr) gaps.push(i);
  }
  return gaps;
}

function issue(
  code: string,
  messageFr: string,
  sev: ReadinessIssue["severity"],
  focusId?: string,
  focusPage?: ReadinessIssue["focusPage"],
): ReadinessIssue {
  return { code, severity: sev, messageFr, focusId, focusPage };
}

/**
 * Évaluation complète grille QC 2027 (blocages + avertissements + checklist UI).
 */
export function evaluateQc2027Certification(
  cover: InspectionCoverPayloadV1,
  opts?: QcCertificationOptions,
): {
  blocking: ReadinessIssue[];
  warnings: ReadinessIssue[];
  checklist: QcCertificationChecklist;
} {
  const scope = opts?.reportScope ?? "full";
  const coverOnly = scope === "cover_only";

  const blocking: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];

  const p = cover.propriete;
  const addressOk = !!p.adresse?.trim();
  const clientOk = !!p.client_nom?.trim();
  const inspectorOk = !!cover.inspecteur_nom?.trim();
  const licenseOk = !!cover.inspecteur_numero_certification?.trim();
  const dateOk = !!cover.date_heure_affichage?.trim();
  const weatherOk = !!cover.conditions_meteo?.trim();

  if (!clientOk) {
    blocking.push(
      issue(
        "qc_cert_client",
        "Grille QC : nom du client (propriété) manquant.",
        "block_critical",
        "resume-client",
      ),
    );
  }
  if (!inspectorOk) {
    blocking.push(
      issue(
        "qc_cert_inspector",
        "Grille QC : nom de l’inspecteur manquant.",
        "block_critical",
        "resume-inspecteur",
      ),
    );
  }
  if (!licenseOk) {
    blocking.push(
      issue(
        "qc_cert_license",
        "Grille QC : numéro de licence / certification manquant.",
        "block_critical",
        "resume-inspecteur",
      ),
    );
  }
  if (!dateOk) {
    blocking.push(
      issue(
        "qc_cert_date",
        "Grille QC : date / heure d’inspection manquante.",
        "block",
        "resume-entete-inspection",
      ),
    );
  }
  if (!weatherOk) {
    blocking.push(
      issue(
        "qc_cert_weather",
        "Grille QC : conditions météo manquantes.",
        "block",
        "resume-entete-inspection",
      ),
    );
  }

  const limitationsOk = hasMinimumLimitationsContent(cover);
  if (!limitationsOk) {
    blocking.push(
      issue(
        "limitations",
        "Limitations de l’inspection non renseignées (obligatoires — pratique professionnelle QC / cadre 2027).",
        "block",
        "resume-limitations",
      ),
    );
  }

  let systemsSevenOk = true;
  let systemsRecOk = true;
  let photosDeclared = true;
  let photosSufficient = true;

  if (!coverOnly) {
    const entriesForSystems = opts?.reportEntries ?? [];
    const miss = findMissingQcSystemSections(entriesForSystems);
    systemsSevenOk = miss.length === 0;
    if (!systemsSevenOk) {
      blocking.push(
        issue(
          "qc_required_sections_missing",
          `Grille QC : constats manquants pour les systèmes : ${miss.join(", ")}. Ajoutez au moins une observation avec note par système (zones du formulaire).`,
          "block",
          "report-entries-zone",
          "report",
        ),
      );
    }

    const entriesDetailed = parseEntriesWithSeverity(opts?.rawEntries ?? opts?.reportEntries);
    const sections = normalizeSections(opts?.reportSections);
    const recGaps = findRecommendationGaps(entriesDetailed, sections);
    systemsRecOk = recGaps.length === 0;
    if (!systemsRecOk) {
      blocking.push(
        issue(
          "qc_cert_recommendations_incomplete",
          `Grille QC : recommandation manquante pour au moins un constat à gravité moyenne ou élevée (entrées ${recGaps.map((i) => i + 1).join(", ")}).`,
          "block",
          "report-entries-zone",
          "report",
        ),
      );
    }

    const cov = opts?.photosCoverageByZone;
    const covKeys = cov
      ? Object.keys(cov).filter((k) => typeof cov[k] === "number" && (cov[k] as number) > 0)
      : [];
    photosDeclared = covKeys.length > 0;
    if (!photosDeclared) {
      blocking.push(
        issue(
          "qc_photo_coverage_not_declared",
          "Grille QC : répartition des photos par zone non déclarée — attribuez une zone à chaque photo pour valider la couverture par système.",
          "block",
          "report-photos-zone",
          "report",
        ),
      );
    }

    photosSufficient = false;
    if (photosDeclared && cov) {
      const bad = findInsufficientQcPhotoCoverage(cov);
      photosSufficient = bad.length === 0;
      if (!photosSufficient) {
        blocking.push(
          issue(
            "qc_photo_coverage_insufficient",
            `Couverture photo insuffisante (seuils QC) pour : ${bad.join(", ")}. Attribuez la zone sur chaque photo ou ajoutez des clichés.`,
            "block",
            "report-photos-zone",
            "report",
          ),
        );
      }
    }
  }

  const profile = cover.compliance_profile_v1;
  const legalProfile =
    profile?.schema_version === 1 &&
    (profile.mode === "QC_2027" || profile.mode === "CA_STANDARD") &&
    typeof profile.clauses_pack_version === "string" &&
    profile.clauses_pack_version.trim().length > 0;
  if (!legalProfile) {
    blocking.push(
      issue(
        "qc_cert_compliance_profile",
        "Grille QC : profil de conformité versionné manquant (compliance_profile_v1) — enregistrez à nouveau la couverture ou la province.",
        "block",
        "resume-conformite",
      ),
    );
  }

  const signatureOk = inspectorOk && licenseOk;

  const h = cover.ia_hints ?? {};
  if (h.photos_description_imported || h.photos_condition_imported) {
    warnings.push(
      issue(
        "qc_cert_coherence_ia",
        "Cohérence : contenu issu de l’IA ou des photos — relire les sections concernées avant certification.",
        "warn",
        "resume-description",
      ),
    );
  }

  const checklist: QcCertificationChecklist = {
    identification: {
      address: addressOk,
      client: clientOk,
      inspector: inspectorOk,
      license: licenseOk,
      date: dateOk,
      weather: weatherOk,
    },
    limitations: limitationsOk,
    systemsSeven: systemsSevenOk,
    systemsRecommendations: systemsRecOk,
    photosDeclared,
    photosSufficient: photosDeclared ? photosSufficient : false,
    legalProfile,
    signature: signatureOk,
  };

  return { blocking, warnings, checklist };
}

/** API compacte (tests / intégrations externes). */
export function validateQc2027Compliance(
  cover: InspectionCoverPayloadV1 | null,
  opts?: QcCertificationOptions,
): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  checklist: QcCertificationChecklist | null;
} {
  if (!cover || getComplianceExportMode(cover) !== "QC_2027") {
    return { isValid: true, errors: [], warnings: [], checklist: null };
  }
  const r = evaluateQc2027Certification(cover, opts);
  return {
    isValid: r.blocking.length === 0,
    errors: r.blocking.map((x) => x.code),
    warnings: r.warnings.map((x) => x.code),
    checklist: r.checklist,
  };
}

/** Détail par système pour affichage (optionnel). */
export function qcSystemCoverageSummary(opts?: QcCertificationOptions): Record<QcSystemCode, "missing" | "ok"> {
  const entries = opts?.reportEntries ?? [];
  const miss = new Set(findMissingQcSystemSections(entries));
  const out = {} as Record<QcSystemCode, "missing" | "ok">;
  for (const code of QC_SYSTEM_CODES) {
    out[code] = miss.has(code) ? "missing" : "ok";
  }
  return out;
}
