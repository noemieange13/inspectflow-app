import { hasMinimumLimitationsContent } from "@/lib/limitations";
import {
  QC_SYSTEM_CODES,
  type QcSystemCode,
} from "@/lib/qcSystemSections";

import {
  countLinkedPhotosForSystem,
  findInsufficientLinkedPhotoSystems,
  hasAnyLinkedPhoto,
} from "../../photoCounts";
import type { ComplianceChecklist, ComplianceContext, ComplianceRule } from "../../types";

export const QC_AIBQ_2027_STANDARD = "QC_AIBQ_2027" as const;
export const QC_AIBQ_2027_VERSION = "1.0.0" as const;
export const QC_AIBQ_2027_RULESET_ID = `${QC_AIBQ_2027_STANDARD}:${QC_AIBQ_2027_VERSION}`;

const ELECTRICAL_MIN_PHOTOS = 2;

function fullReport(ctx: ComplianceContext): boolean {
  return ctx.reportScope === "full";
}

function missingSystems(ctx: ComplianceContext): QcSystemCode[] {
  return QC_SYSTEM_CODES.filter(
    (code) => !ctx.constats.some((c) => c.systemCode === code && c.hasObservationText),
  );
}

function recommendationGapIndexes(ctx: ComplianceContext): number[] {
  const gaps: number[] = [];
  for (const c of ctx.constats) {
    if (c.entryIndex == null) continue;
    const sev = c.severity;
    if (sev !== "medium" && sev !== "high") continue;
    if (!c.hasRecommendation) gaps.push(c.entryIndex);
  }
  return gaps;
}

export const qcAibq2027Rules: ComplianceRule[] = [
  {
    id: "qc.identification.client",
    code: "qc_cert_client",
    severity: "block_critical",
    applies: (ctx) => !!ctx.cover,
    evaluate(ctx) {
      const passed = !!ctx.cover?.propriete.client_nom?.trim();
      return {
        ruleId: "qc.identification.client",
        code: "qc_cert_client",
        passed,
        severity: "block_critical",
        messageFr: passed ? undefined : "Grille QC : nom du client (propriété) manquant.",
        focusId: "resume-client",
      };
    },
  },
  {
    id: "qc.identification.inspector",
    code: "qc_cert_inspector",
    severity: "block_critical",
    applies: (ctx) => !!ctx.cover,
    evaluate(ctx) {
      const passed = !!ctx.cover?.inspecteur_nom?.trim();
      return {
        ruleId: "qc.identification.inspector",
        code: "qc_cert_inspector",
        passed,
        severity: "block_critical",
        messageFr: passed ? undefined : "Grille QC : nom de l’inspecteur manquant.",
        focusId: "resume-inspecteur",
      };
    },
  },
  {
    id: "qc.identification.license",
    code: "qc_cert_license",
    severity: "block_critical",
    applies: (ctx) => !!ctx.cover,
    evaluate(ctx) {
      const passed = !!ctx.cover?.inspecteur_numero_certification?.trim();
      return {
        ruleId: "qc.identification.license",
        code: "qc_cert_license",
        passed,
        severity: "block_critical",
        messageFr: passed
          ? undefined
          : "Grille QC : numéro de licence / certification manquant.",
        focusId: "resume-inspecteur",
      };
    },
  },
  {
    id: "qc.identification.date",
    code: "qc_cert_date",
    severity: "block",
    applies: (ctx) => !!ctx.cover,
    evaluate(ctx) {
      const passed = !!ctx.cover?.date_heure_affichage?.trim();
      return {
        ruleId: "qc.identification.date",
        code: "qc_cert_date",
        passed,
        severity: "block",
        messageFr: passed ? undefined : "Grille QC : date / heure d’inspection manquante.",
        focusId: "resume-entete-inspection",
      };
    },
  },
  {
    id: "qc.identification.weather",
    code: "qc_cert_weather",
    severity: "block",
    applies: (ctx) => !!ctx.cover,
    evaluate(ctx) {
      const passed = !!ctx.cover?.conditions_meteo?.trim();
      return {
        ruleId: "qc.identification.weather",
        code: "qc_cert_weather",
        passed,
        severity: "block",
        messageFr: passed ? undefined : "Grille QC : conditions météo manquantes.",
        focusId: "resume-entete-inspection",
      };
    },
  },
  {
    id: "qc.limitations",
    code: "limitations",
    severity: "block",
    applies: (ctx) => !!ctx.cover,
    evaluate(ctx) {
      const passed = ctx.cover ? hasMinimumLimitationsContent(ctx.cover) : false;
      return {
        ruleId: "qc.limitations",
        code: "limitations",
        passed,
        severity: "block",
        messageFr: passed
          ? undefined
          : "Limitations de l’inspection non renseignées (obligatoires — pratique professionnelle QC / cadre 2027).",
        focusId: "resume-limitations",
      };
    },
  },
  {
    id: "qc.systems.required",
    code: "qc_required_sections_missing",
    severity: "block",
    applies: fullReport,
    evaluate(ctx) {
      const miss = missingSystems(ctx);
      const passed = miss.length === 0;
      return {
        ruleId: "qc.systems.required",
        code: "qc_required_sections_missing",
        passed,
        severity: "block",
        messageFr: passed
          ? undefined
          : `Grille QC : constats manquants pour les systèmes : ${miss.join(", ")}. Ajoutez au moins une observation avec note par système.`,
        focusId: "report-entries-zone",
        focusPage: "report",
      };
    },
  },
  {
    id: "qc.recommendations",
    code: "qc_cert_recommendations_incomplete",
    severity: "block",
    applies: fullReport,
    evaluate(ctx) {
      const gaps = recommendationGapIndexes(ctx);
      const passed = gaps.length === 0;
      return {
        ruleId: "qc.recommendations",
        code: "qc_cert_recommendations_incomplete",
        passed,
        severity: "block",
        messageFr: passed
          ? undefined
          : `Grille QC : recommandation manquante pour au moins un constat à gravité moyenne ou élevée (entrées ${gaps.map((i) => i + 1).join(", ")}).`,
        focusId: "report-entries-zone",
        focusPage: "report",
      };
    },
  },
  {
    id: "qc.photos.linked",
    code: "qc_photos_linked_declared",
    severity: "block",
    applies: fullReport,
    evaluate(ctx) {
      const passed = hasAnyLinkedPhoto(ctx);
      return {
        ruleId: "qc.photos.linked",
        code: "qc_photos_linked_declared",
        passed,
        severity: "block",
        messageFr: passed
          ? undefined
          : "Grille QC : aucune photo liée à un constat (observation_id). Associez chaque photo à un constat avant export.",
        focusId: "report-photos-zone",
        focusPage: "report",
      };
    },
  },
  {
    id: "qc.photos.min_by_system",
    code: "qc_photo_coverage_insufficient",
    severity: "block",
    applies: fullReport,
    evaluate(ctx) {
      const bad = findInsufficientLinkedPhotoSystems(ctx);
      const passed = bad.length === 0;
      return {
        ruleId: "qc.photos.min_by_system",
        code: "qc_photo_coverage_insufficient",
        passed,
        severity: "block",
        messageFr: passed
          ? undefined
          : `Couverture photo insuffisante (liens observation_id) pour : ${bad.join(", ")}. Ajoutez des photos liées aux constats concernés.`,
        focusId: "report-photos-zone",
        focusPage: "report",
      };
    },
  },
  {
    id: "qc.electrical.min_photos",
    code: "qc_aibq_2027_electrical_min_photos",
    severity: "block",
    applies: fullReport,
    evaluate(ctx) {
      const linked = countLinkedPhotosForSystem(ctx, "electricite");
      const passed = linked >= ELECTRICAL_MIN_PHOTOS;
      return {
        ruleId: "qc.electrical.min_photos",
        code: "qc_aibq_2027_electrical_min_photos",
        passed,
        severity: "block",
        messageFr: passed
          ? undefined
          : `Électricité : minimum ${ELECTRICAL_MIN_PHOTOS} photos liées aux constats électriques (observation_id). Actuellement : ${linked}.`,
        focusId: "report-photos-zone",
        focusPage: "report",
      };
    },
  },
  {
    id: "qc.compliance_profile",
    code: "qc_cert_compliance_profile",
    severity: "block",
    applies: (ctx) => !!ctx.cover,
    evaluate(ctx) {
      const profile = ctx.cover?.compliance_profile_v1;
      const passed =
        profile?.schema_version === 1 &&
        (profile.mode === "QC_2027" || profile.mode === "CA_STANDARD") &&
        typeof profile.clauses_pack_version === "string" &&
        profile.clauses_pack_version.trim().length > 0;
      return {
        ruleId: "qc.compliance_profile",
        code: "qc_cert_compliance_profile",
        passed,
        severity: "block",
        messageFr: passed
          ? undefined
          : "Grille QC : profil de conformité versionné manquant (compliance_profile_v1).",
        focusId: "resume-conformite",
      };
    },
  },
  {
    id: "qc.coherence_ia",
    code: "qc_cert_coherence_ia",
    severity: "warn",
    applies: (ctx) => !!ctx.cover,
    evaluate(ctx) {
      const h = ctx.cover?.ia_hints ?? {};
      const passed = !(h.photos_description_imported || h.photos_condition_imported);
      return {
        ruleId: "qc.coherence_ia",
        code: "qc_cert_coherence_ia",
        passed,
        severity: "warn",
        messageFr: passed
          ? undefined
          : "Cohérence : contenu issu de l’IA ou des photos — relire les sections concernées avant certification.",
        focusId: "resume-description",
      };
    },
  },
];

export function buildQcAibq2027Checklist(
  ctx: ComplianceContext,
  results: Map<string, boolean>,
): ComplianceChecklist {
  const cover = ctx.cover;
  const p = cover?.propriete;
  const miss = missingSystems(ctx);
  const recGaps = recommendationGapIndexes(ctx);
  const insufficient = findInsufficientLinkedPhotoSystems(ctx);
  const electricalLinked = countLinkedPhotosForSystem(ctx, "electricite");
  const profile = cover?.compliance_profile_v1;
  const legalProfile =
    profile?.schema_version === 1 &&
    (profile.mode === "QC_2027" || profile.mode === "CA_STANDARD") &&
    typeof profile.clauses_pack_version === "string" &&
    profile.clauses_pack_version.trim().length > 0;

  return {
    identification: {
      address: !!p?.adresse?.trim(),
      client: !!p?.client_nom?.trim(),
      inspector: !!cover?.inspecteur_nom?.trim(),
      license: !!cover?.inspecteur_numero_certification?.trim(),
      date: !!cover?.date_heure_affichage?.trim(),
      weather: !!cover?.conditions_meteo?.trim(),
    },
    limitations: cover ? hasMinimumLimitationsContent(cover) : false,
    systemsSeven: miss.length === 0,
    systemsRecommendations: recGaps.length === 0,
    photosLinked: hasAnyLinkedPhoto(ctx),
    photosSufficient: insufficient.length === 0,
    electricalMinPhotos: electricalLinked >= ELECTRICAL_MIN_PHOTOS,
    legalProfile,
    signature:
      !!cover?.inspecteur_nom?.trim() && !!cover?.inspecteur_numero_certification?.trim(),
  };
}

/** Détail par système pour affichage (optionnel). */
export function qcSystemCoverageSummaryFromContext(
  ctx: ComplianceContext,
): Record<QcSystemCode, "missing" | "ok"> {
  const miss = new Set(missingSystems(ctx));
  const out = {} as Record<QcSystemCode, "missing" | "ok">;
  for (const code of QC_SYSTEM_CODES) {
    out[code] = miss.has(code) ? "missing" : "ok";
  }
  return out;
}
