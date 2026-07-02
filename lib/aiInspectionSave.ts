import {
  buildFindingsReviewSaveBody,
  buildInspectorEditedNote,
  parseEntriesFromPayload,
  resolveReportJurisdiction,
  resolveReportLanguage,
} from "@/lib/findingsReview";
import { stampDevInspectorAttribution } from "@/lib/devInspectorMode";
import type { StructuredObservation } from "@/lib/inspection-local-ai";
import { localSeverityToReport } from "@/lib/inspection-local-ai";
import { createObservationId } from "@/lib/observationIds";
import type { PhotoObservationLinkInput } from "@/lib/reportObservationPhotos";
import type { ReportEntryInput } from "@/lib/reportNarrative";

export type EditableObservationFields = {
  room: string;
  component: string;
  issue: string;
  severity: StructuredObservation["severity"];
  recommendation: string;
};

export function structuredToEditable(obs: StructuredObservation): EditableObservationFields {
  return {
    room: obs.room,
    component: obs.component,
    issue: obs.issue,
    severity: obs.severity,
    recommendation: obs.recommendation,
  };
}

/** Construit le texte de note inspecteur (sans marqueurs machine IA batch). */
export function buildLocalAiObservationNote(
  fields: EditableObservationFields,
  language: "fr" | "en" = "fr",
): string {
  const location =
    language === "en"
      ? `Location: ${fields.room} — ${fields.component}`
      : `Pièce : ${fields.room} — ${fields.component}`;
  const body = `${location}\n\n${fields.issue.trim()}`;
  return buildInspectorEditedNote(body, fields.recommendation, language);
}

export function editableFieldsToEntry(
  fields: EditableObservationFields,
  structured: StructuredObservation,
  language: "fr" | "en" = "fr",
): ReportEntryInput {
  return {
    id: createObservationId(),
    zone: structured.zone,
    issue: structured.issueCode,
    severity: localSeverityToReport(fields.severity),
    note: buildLocalAiObservationNote(fields, language),
  };
}

export function appendObservationEntry(
  payload: Record<string, unknown>,
  entry: ReportEntryInput,
): ReportEntryInput[] {
  const existing = parseEntriesFromPayload(payload);
  return [...existing, entry];
}

export function buildObservationSaveBody(
  reportId: string,
  accessToken: string,
  payload: Record<string, unknown>,
  entries: ReportEntryInput[],
): Record<string, unknown> {
  return buildFindingsReviewSaveBody(reportId, accessToken, payload, entries);
}

export function mergePhotoObservationLink(
  payload: Record<string, unknown>,
  photoId: string,
  observationId: string | null,
): PhotoObservationLinkInput[] {
  const existing = Array.isArray(payload.photo_observation_links)
    ? (payload.photo_observation_links as PhotoObservationLinkInput[])
    : [];
  const filtered = existing.filter((l) => l.photo_id !== photoId);
  return [...filtered, { photo_id: photoId, observation_id: observationId }];
}

export async function persistPhotoObservationLink(
  reportId: string,
  accessToken: string,
  links: PhotoObservationLinkInput[],
  validObservationIds: string[],
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch("/api/photo-observation-links", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      report_id: reportId,
      access_token: accessToken,
      photo_observation_links: links,
      valid_observation_ids: validObservationIds,
    }),
  });
  const body = (await res.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
  } | null;
  if (!res.ok || !body?.success) {
    return { success: false, error: body?.error ?? `Erreur ${res.status}` };
  }
  return { success: true };
}

export async function saveObservationEntries(
  reportId: string,
  accessToken: string,
  payload: Record<string, unknown>,
  entries: ReportEntryInput[],
): Promise<{ success: boolean; error?: string }> {
  const body = buildObservationSaveBody(
    reportId,
    accessToken,
    stampDevInspectorAttribution(payload),
    entries,
  );
  const res = await fetch("/api/report-content", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await res.json().catch(() => null)) as {
    success?: boolean;
    error?: string;
  } | null;
  if (!res.ok || !result?.success) {
    return { success: false, error: result?.error ?? `Erreur ${res.status}` };
  }
  return { success: true };
}

export function resolveReportLanguageFromPayload(payload: unknown): "fr" | "en" {
  return resolveReportLanguage(payload);
}

export function resolveReportJurisdictionFromPayload(payload: unknown) {
  return resolveReportJurisdiction(payload);
}
