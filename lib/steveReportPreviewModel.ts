/**
 * Phase 8T — Read-only report preview model (no PDF generation).
 */
import {
  buildFindingDisplays,
  buildPhotoCountByObservationId,
  buildPrimaryPhotoByObservationId,
  deriveReviewDecisionsFromPayload,
  parseEntriesFromPayload,
  resolveReportJurisdiction,
  resolveReportLanguage,
  reviewedIdsFromDecisions,
  type FindingDisplay,
} from "@/lib/findingsReview";
import { parseCoverFromPayload } from "@/lib/inspectorHomeList";
import { parseObservationPhotoUrlsFromPayload } from "@/lib/reportObservationPhotos";
import type { ReportLanguage } from "@/lib/reportNarrative";

export type ReportPreviewCover = {
  address: string;
  clientName: string;
  inspectorName: string;
  inspectionDate: string;
};

export type ReportPreviewModel = {
  cover: ReportPreviewCover;
  findings: FindingDisplay[];
  language: ReportLanguage;
};

function inspectorNameFromPayload(payload: Record<string, unknown>): string {
  const cover = payload.cover_v1;
  if (cover && typeof cover === "object") {
    const c = cover as Record<string, unknown>;
    if (typeof c.inspecteur_nom === "string" && c.inspecteur_nom.trim()) {
      return c.inspecteur_nom.trim();
    }
  }
  const snap = payload.report_professional_snapshot_v1;
  if (snap && typeof snap === "object") {
    const s = snap as Record<string, unknown>;
    if (typeof s.display_name === "string" && s.display_name.trim()) {
      return s.display_name.trim();
    }
  }
  return "";
}

function inspectionDateFromPayload(payload: Record<string, unknown>): string {
  const cover = payload.cover_v1;
  if (cover && typeof cover === "object") {
    const c = cover as Record<string, unknown>;
    if (typeof c.date_heure_affichage === "string" && c.date_heure_affichage.trim()) {
      return c.date_heure_affichage.trim();
    }
  }
  return "";
}

export function buildReportPreviewModel(payload: Record<string, unknown>): ReportPreviewModel {
  const language = resolveReportLanguage(payload);
  const jurisdiction = resolveReportJurisdiction(payload);
  const entries = parseEntriesFromPayload(payload);
  const decisions = deriveReviewDecisionsFromPayload(payload, entries);
  const reviewedIds = reviewedIdsFromDecisions(decisions);

  const urlMap = parseObservationPhotoUrlsFromPayload(payload);
  const syntheticPhotos = Object.entries(urlMap).flatMap(([obsId, urls]) =>
    urls.map((url, index) => ({
      id: `${obsId}-${index}`,
      observation_id: obsId,
      url,
    })),
  );

  const photoByObs = buildPrimaryPhotoByObservationId(syntheticPhotos);
  const photoCountByObs = buildPhotoCountByObservationId(syntheticPhotos);

  const findings = buildFindingDisplays(
    entries,
    language,
    jurisdiction,
    photoByObs,
    photoCountByObs,
    reviewedIds,
  );

  const coverParsed = parseCoverFromPayload(payload);

  return {
    cover: {
      address: coverParsed.address,
      clientName: coverParsed.clientName,
      inspectorName: inspectorNameFromPayload(payload),
      inspectionDate: inspectionDateFromPayload(payload),
    },
    findings,
    language,
  };
}
