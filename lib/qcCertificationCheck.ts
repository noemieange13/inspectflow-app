/**
 * Certification QC 2027 — façade compatibilité ; logique dans `compliance-rules/`.
 */

import { getComplianceExportMode, type InspectionCoverPayloadV1 } from "@/lib/inspectionCoverPayload";
import type { ReadinessIssue } from "@/lib/reportReadiness";
import type { QcSystemCode, ReportEntryLike } from "@/lib/qcSystemSections";

import { buildZeroDraftComplianceContextFromReadiness } from "@/lib/compliance/compliance-rules/adapters/zeroDraftAdapter";
import {
  qcSystemCoverageSummaryFromContext,
  QC_AIBQ_2027_RULESET_ID,
} from "@/lib/compliance/compliance-rules/rules/qc-aibq-2027";
import {
  buildComplianceValidationV1,
  validateCompliance,
} from "@/lib/compliance/compliance-rules/validate";
import type { ComplianceChecklist, NormalizedPhoto } from "@/lib/compliance/compliance-rules/types";

/** @deprecated Utiliser QC_AIBQ_2027_RULESET_ID */
export const QC_CERTIFICATION_STANDARD = "QC_2027" as const;
export const QC_CERTIFICATION_RULESET_VERSION = "1.0.0" as const;
export const QC_CERTIFICATION_RULESET_ID = QC_AIBQ_2027_RULESET_ID;

export type QcCertificationChecklist = ComplianceChecklist & {
  /** @deprecated alias */
  photosDeclared: boolean;
};

export type QcCertificationReportScope = "full" | "cover_only";

export type QcCertificationOptions = {
  reportEntries?: ReportEntryLike[];
  rawEntries?: unknown;
  /** @deprecated Ne plus utiliser pour validation finale — préférer linkedPhotos. */
  photosCoverageByZone?: Partial<Record<string, number>> | null;
  reportSections?: unknown;
  reportScope?: QcCertificationReportScope;
  /** Photos liées constat.id → observation_id (seule source de vérité). */
  linkedPhotos?: NormalizedPhoto[];
};

function toReadinessIssue(
  issue: ReadinessIssue,
): ReadinessIssue {
  return issue;
}

function mapChecklist(c: ComplianceChecklist | null): QcCertificationChecklist | null {
  if (!c) return null;
  return {
    ...c,
    photosDeclared: c.photosLinked,
  };
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
  const hasReportBundle = opts?.reportScope !== "cover_only";
  const ctx = buildZeroDraftComplianceContextFromReadiness(cover, {
    reportPayload: hasReportBundle
      ? {
          entries: opts?.rawEntries ?? opts?.reportEntries,
          sections: opts?.reportSections,
        }
      : null,
    linkedPhotos: opts?.linkedPhotos,
  });
  ctx.reportScope = opts?.reportScope ?? (hasReportBundle ? "full" : "cover_only");

  const result = validateCompliance(ctx);
  const blocking = result.blocking.map((b) =>
    toReadinessIssue({
      code: b.code,
      severity: b.severity,
      messageFr: b.messageFr,
      focusId: b.focusId,
      focusPage: b.focusPage,
    }),
  );
  const warnings = result.warnings.map((w) =>
    toReadinessIssue({
      code: w.code,
      severity: w.severity,
      messageFr: w.messageFr,
      focusId: w.focusId,
      focusPage: w.focusPage,
    }),
  );

  const checklist =
    mapChecklist(result.checklist) ??
    ({
      identification: {
        address: false,
        client: false,
        inspector: false,
        license: false,
        date: false,
        weather: false,
      },
      limitations: false,
      systemsSeven: false,
      systemsRecommendations: false,
      photosLinked: false,
      photosSufficient: false,
      photosDeclared: false,
      electricalMinPhotos: false,
      legalProfile: false,
      signature: false,
    } satisfies QcCertificationChecklist);

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
  validationV1?: ReturnType<typeof buildComplianceValidationV1>;
} {
  if (!cover || getComplianceExportMode(cover) !== "QC_2027") {
    return { isValid: true, errors: [], warnings: [], checklist: null };
  }
  const r = evaluateQc2027Certification(cover, opts);
  const ctx = buildZeroDraftComplianceContextFromReadiness(cover, {
    reportPayload:
      opts?.reportScope !== "cover_only"
        ? { entries: opts?.rawEntries ?? opts?.reportEntries, sections: opts?.reportSections }
        : null,
    linkedPhotos: opts?.linkedPhotos,
  });
  const validation = validateCompliance(ctx);
  return {
    isValid: r.blocking.length === 0,
    errors: r.blocking.map((x) => x.code),
    warnings: r.warnings.map((x) => x.code),
    checklist: r.checklist,
    validationV1: buildComplianceValidationV1(validation),
  };
}

/** Détail par système pour affichage (optionnel). */
export function qcSystemCoverageSummary(opts?: QcCertificationOptions): Record<QcSystemCode, "missing" | "ok"> {
  if (!opts) {
    return qcSystemCoverageSummaryFromContext({
      province: "QC",
      normBody: "AIBQ",
      normVersion: "2027",
      rulesetId: QC_AIBQ_2027_RULESET_ID,
      cover: null,
      constats: [],
      photos: [],
      reportScope: "full",
    });
  }
  const ctx = buildZeroDraftComplianceContextFromReadiness(null, {
    reportPayload: { entries: opts.rawEntries ?? opts.reportEntries },
    linkedPhotos: opts.linkedPhotos,
  });
  return qcSystemCoverageSummaryFromContext(ctx);
}

export { buildComplianceValidationV1, validateCompliance };
