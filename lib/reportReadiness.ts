import {
  getComplianceExportMode,
  type InspectionCoverPayloadV1,
} from "@/lib/inspectionCoverPayload";

import { effectiveDescriptionNarrative } from "@/lib/coverResumeFormat";
import { parsePayloadEntries, type ReportEntryLike } from "@/lib/qcSystemSections";
import {
  evaluateQc2027Certification,
  type QcCertificationChecklist,
} from "@/lib/qcCertificationCheck";

/** Ancre HTML du bandeau readiness sur `/report/[id]` (scroll depuis le compositeur). */
export const REPORT_READINESS_ZONE_ID = "report-readiness-zone";

export type ReadinessGate = "ready" | "warning" | "blocked";

export type ReadinessIssue = {
  code: string;
  /** `block_critical` = identité / adresse / couverture absente — risque client ou contractuel élevé. */
  severity: "block_critical" | "block" | "warn";
  messageFr: string;
  /** Ancre (`#resume-*` couverture ou `#report-photos-zone` page rapport). */
  focusId?: string;
  /** Où appliquer le scroll / le lien (défaut : couverture). */
  focusPage?: "cover" | "report";
};

export type CoverReadinessResult = {
  gate: ReadinessGate;
  /** 0–100 — prêt à l’envoi perçu */
  score: number;
  blocking: ReadinessIssue[];
  warnings: ReadinessIssue[];
  /** Présent uniquement en profil QC 2027 — contrôle certification détaillé. */
  qcCertification?: QcCertificationChecklist | null;
  /** Codes d’erreur grille QC (blocages), pour analytics. */
  qcCertificationErrorCodes?: string[];
  /** Accusé enregistré mais l’état a empiré ou divergé depuis (ré-export PDF à risque). */
  staleAck?: boolean;
};

/**
 * Évalue si la couverture est prête pour export PDF (go 8).
 * Les blocages sont des champs métier critiques ; les avertissements n’empêchent pas si l’inspecteur accuse réception.
 */
export function evaluateCoverReadiness(
  cover: InspectionCoverPayloadV1 | null,
  opts?: {
    photoCount?: number;
    /** @deprecated Ignoré — l’accusé est dérivé de `cover.readiness_ack_v1` + avertissements courants. */
    userAcknowledged?: boolean;
    /** Constats structurés (`payload.entries`) — grille systèmes QC 2027. */
    reportEntries?: ReportEntryLike[];
    /** Comptage photos par zone (`payload.photos_coverage_v1.by_zone` ou état client). */
    photosCoverageByZone?: Partial<Record<string, number>> | null;
    /** Extrait brut : `entries` (avec gravité), `sections`, etc. */
    reportPayload?: Record<string, unknown> | null;
  },
): CoverReadinessResult {
  const blocking: ReadinessIssue[] = [];
  const warnings: ReadinessIssue[] = [];
  let qcCertification: QcCertificationChecklist | null = null;
  let qcCertificationErrorCodes: string[] | undefined;

  if (!cover) {
    blocking.push({
      code: "no_cover",
      severity: "block_critical",
      messageFr: "Aucune couverture (cover_v1) enregistrée sur ce rapport.",
    });
    return finalize(blocking, warnings, cover, null, undefined);
  }

  if (!cover.requerants.trim()) {
    blocking.push({
      code: "requerant",
      severity: "block_critical",
      messageFr: "Requérant manquant.",
      focusId: "resume-requerant",
    });
  }
  if (!cover.propriete.adresse.trim()) {
    blocking.push({
      code: "adresse",
      severity: "block_critical",
      messageFr: "Adresse de la propriété inspectée manquante.",
      focusId: "resume-propriete",
    });
  }
  if (!cover.condition_generale.trim()) {
    blocking.push({
      code: "condition",
      severity: "block",
      messageFr: "Condition générale du bâtiment manquante.",
      focusId: "resume-condition",
    });
  }

  const h = cover.ia_hints ?? {};
  const descText = effectiveDescriptionNarrative(cover).trim();
  if (!descText) {
    blocking.push({
      code: "description",
      severity: "block",
      messageFr: "Description sommaire du bâtiment manquante.",
      focusId: "resume-description",
    });
  }

  if (getComplianceExportMode(cover) === "QC_2027") {
    const rp = opts?.reportPayload;
    const hasReportBundle = rp !== undefined && rp !== null;
    const reportEntries =
      opts?.reportEntries && opts.reportEntries.length > 0
        ? opts.reportEntries
        : parsePayloadEntries(rp?.entries);
    const qc = evaluateQc2027Certification(cover, {
      reportEntries,
      rawEntries: rp?.entries,
      photosCoverageByZone: opts?.photosCoverageByZone,
      reportSections: rp?.sections,
      reportScope: hasReportBundle ? "full" : "cover_only",
    });
    blocking.push(...qc.blocking);
    warnings.push(...qc.warnings);
    qcCertification = qc.checklist;
    qcCertificationErrorCodes = qc.blocking.map((b) => b.code);
  }

  if (h.photos_condition_imported && cover.condition_generale.trim()) {
    warnings.push({
      code: "condition_ia",
      severity: "warn",
      messageFr: "Condition générale issue des photos — relire avant envoi.",
      focusId: "resume-condition",
    });
  }
  if (h.photos_description_imported && descText) {
    warnings.push({
      code: "description_ia",
      severity: "warn",
      messageFr: "Description issue des photos — relire avant envoi.",
      focusId: "resume-description",
    });
  }
  if (h.dv_photo_imported) {
    warnings.push({
      code: "dv",
      severity: "warn",
      messageFr: "Champs issus de la DV — vérifier l’extraction.",
      focusId: "resume-propriete",
    });
  }

  const n = opts?.photoCount ?? 0;
  if (n > 0 && n < 2) {
    warnings.push({
      code: "few_photos",
      severity: "warn",
      messageFr: "Peu de photos jointes au rapport.",
      focusId: "report-photos-zone",
      focusPage: "report",
    });
  }

  if (
    getComplianceExportMode(cover) !== "QC_2027" &&
    !cover.inspecteur_nom.trim() &&
    !cover.inspecteur_numero_certification.trim() &&
    !cover.compagnie.trim()
  ) {
    warnings.push({
      code: "inspecteur",
      severity: "warn",
      messageFr: "Identité inspecteur / compagnie non renseignée (branding PDF).",
      focusId: "resume-inspecteur",
    });
  }

  return finalize(blocking, warnings, cover, qcCertification, qcCertificationErrorCodes);
}

/** L’inspecteur a accusé réception pour l’ensemble d’avertissements actuellement listés (ou il n’y en a pas). */
function warningsCoveredByAck(
  cover: InspectionCoverPayloadV1 | null,
  warnings: ReadinessIssue[],
): boolean {
  const ack = cover?.readiness_ack_v1;
  if (!ack?.acknowledged_at) return false;
  if (warnings.length === 0) return true;
  const stored = ack.warning_codes_at_ack;
  if (!stored || stored.length === 0) return true;
  const cur = [...warnings.map((w) => w.code)].sort().join("\0");
  const prev = [...stored].sort().join("\0");
  return cur === prev;
}

/** Textes « risque si envoyé » — transparence légale / métier (non bloquant). */
export function readinessRiskLinesFr(warnings: ReadinessIssue[]): string[] {
  const lines: string[] = [];
  const codes = new Set(warnings.map((w) => w.code));

  if (
    codes.has("condition_ia") ||
    codes.has("description_ia") ||
    codes.has("dv")
  ) {
    lines.push(
      "Des sections peuvent provenir d’extraction automatique (DV ou photos) : une erreur d’interprétation reste possible si vous ne les avez pas relues.",
    );
  }
  if (codes.has("few_photos")) {
    lines.push(
      "Peu de photos jointes : le rapport peut être moins convaincant pour un tiers ou en litige — ajoutez des preuves visuelles si possible.",
    );
  }
  if (codes.has("inspecteur")) {
    lines.push(
      "Sans identité d’inspecteur ou de firme sur la couverture, le PDF paraît moins professionnel et peut poser question en assurance ou en vente.",
    );
  }
  if (codes.has("qc_cert_coherence_ia")) {
    lines.push(
      "Contenu assisté par IA ou issu d’import photo : vérifiez la cohérence avec vos constats terrain avant certification.",
    );
  }

  if (lines.length === 0 && warnings.length > 0) {
    lines.push(
      "Vérifiez les points listés ci-dessus avant envoi au client ou aux parties prenantes.",
    );
  }

  return lines;
}

function finalize(
  blocking: ReadinessIssue[],
  warnings: ReadinessIssue[],
  cover: InspectionCoverPayloadV1 | null,
  qcCertification?: QcCertificationChecklist | null,
  qcCertificationErrorCodes?: string[],
): CoverReadinessResult {
  const userAcknowledged = warningsCoveredByAck(cover, warnings);

  const base = (): Omit<CoverReadinessResult, "staleAck"> => {
    if (blocking.length > 0) {
      const critical = blocking.filter((b) => b.severity === "block_critical").length;
      const rest = blocking.length - critical;
      return {
        gate: "blocked",
        score: Math.max(0, 55 - critical * 14 - rest * 10),
        blocking,
        warnings,
        qcCertification: qcCertification ?? null,
        qcCertificationErrorCodes,
      };
    }

    const warnOnly = warnings.length > 0;
    if (warnOnly && !userAcknowledged) {
      return {
        gate: "warning",
        score: Math.max(60, 85 - warnings.length * 5),
        blocking,
        warnings,
        qcCertification: qcCertification ?? null,
        qcCertificationErrorCodes,
      };
    }

    return {
      gate: "ready",
      score: warnOnly ? 94 : 100,
      blocking,
      warnings,
      qcCertification: qcCertification ?? null,
      qcCertificationErrorCodes,
    };
  };

  const out = base();
  const staleAck = computeStaleAck(cover, out);
  return staleAck ? { ...out, staleAck } : out;
}

function computeStaleAck(
  cover: InspectionCoverPayloadV1 | null,
  result: Omit<CoverReadinessResult, "staleAck">,
): boolean {
  const ack = cover?.readiness_ack_v1;
  if (!ack?.acknowledged_at) return false;

  if (result.blocking.length > 0) return true;

  if (typeof ack.score_at_ack === "number" && result.score < ack.score_at_ack) {
    return true;
  }

  const snap = ack.warning_codes_at_ack;
  if (!snap?.length) return false;

  const curCodes = result.warnings.map((w) => w.code);
  const snapSet = new Set(snap);
  for (const c of curCodes) {
    if (!snapSet.has(c)) return true;
  }

  return false;
}
