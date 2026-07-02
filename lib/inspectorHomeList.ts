import { isMachineGeneratedEntryNote } from "@/lib/report_writer_engine/protectInspector";
import { parsePayloadEntries } from "@/lib/qcSystemSections";
import {
  buildInspectionProgressInput,
  deriveInspectorProgressPhase,
  humanInspectionStatusLabel,
  inspectionCompletionPercent,
  isInspectionCompleted,
  isInspectionDraft,
  type InspectionProgressInput,
  type InspectorProgressPhase,
} from "@/lib/inspectionProgressLabel";
import type { InspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";

export type InspectorHomeReportRow = {
  id: string;
  created_at: string;
  updated_at?: string | null;
  user_id?: string | null;
  inspection_id?: string | null;
  organization_id?: string | null;
  pdf_path?: string | null;
  access_token?: string | null;
  payload?: unknown;
};

export type InspectorHomeListItem = {
  reportId: string;
  address: string;
  clientName: string;
  phase: InspectorProgressPhase;
  statusLabel: string;
  completionPercent: number;
  photoCount: number;
  reportHref: string;
  updatedAt: string;
  isCompleted: boolean;
  isDraft: boolean;
};

export type InspectorHomeWeekStats = {
  completedThisWeek: number;
  draftsThisWeek: number;
};

export type CoverV1Fields = {
  clientName: string;
  address: string;
  inspectionType: string;
};

const BUILDING_TYPE_LABEL: Record<string, string> = {
  residential: "Résidentiel",
  commercial: "Commercial",
  multiplex: "Multiplex",
  condo: "Condominium",
};

export function parseCoverFromPayload(payload: unknown): CoverV1Fields {
  if (!payload || typeof payload !== "object") {
    return { clientName: "", address: "", inspectionType: "residential" };
  }
  const cover = (payload as Record<string, unknown>).cover_v1;
  if (!cover || typeof cover !== "object") {
    return { clientName: "", address: "", inspectionType: "residential" };
  }
  const c = cover as Record<string, unknown>;
  return {
    clientName: typeof c.client_name === "string" ? c.client_name.trim() : "",
    address: typeof c.address === "string" ? c.address.trim() : "",
    inspectionType:
      typeof c.inspection_type === "string" && c.inspection_type.trim()
        ? c.inspection_type.trim()
        : "residential",
  };
}

export function buildingTypeLabel(type: string): string {
  return BUILDING_TYPE_LABEL[type] ?? "Résidentiel";
}

export function hasUnreviewedAiInPayload(payload: unknown): boolean {
  const entries = parsePayloadEntries(
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).entries
      : null,
  );
  return entries.some((e) => isMachineGeneratedEntryNote(e.note));
}

export function buildProgressInputForReport(
  row: InspectorHomeReportRow,
  photoProgress?: InspectionPhotoProgress | null,
): InspectionProgressInput {
  const hasPdf = Boolean(row.pdf_path?.trim());
  return buildInspectionProgressInput({
    photoProgress: photoProgress ?? null,
    hasUnreviewedAi: hasUnreviewedAiInPayload(row.payload),
    hasPdf,
  });
}

export function buildInspectorHomeListItem(
  row: InspectorHomeReportRow,
  photoProgress?: InspectionPhotoProgress | null,
): InspectorHomeListItem {
  const cover = parseCoverFromPayload(row.payload);
  const progressInput = buildProgressInputForReport(row, photoProgress);
  const phase = deriveInspectorProgressPhase(progressInput);
  const token = typeof row.access_token === "string" ? row.access_token.trim() : "";
  const reportHref = token
    ? `/report/${encodeURIComponent(row.id)}?token=${encodeURIComponent(token)}`
    : `/report/${encodeURIComponent(row.id)}`;

  return {
    reportId: row.id,
    address: cover.address || "Adresse à compléter",
    clientName: cover.clientName || "Client",
    phase,
    statusLabel: humanInspectionStatusLabel(phase),
    completionPercent: inspectionCompletionPercent(progressInput),
    photoCount: photoProgress?.upload.done ?? progressInput.photoUploadDone,
    reportHref,
    updatedAt: row.created_at,
    isCompleted: isInspectionCompleted(progressInput),
    isDraft: isInspectionDraft(progressInput),
  };
}

/** Fusionne rapports possédés + assignés, dédupliqués par id, tri récents d'abord. */
export function mergeAndSortReportRows(
  owned: InspectorHomeReportRow[],
  assigned: InspectorHomeReportRow[],
): InspectorHomeReportRow[] {
  const byId = new Map<string, InspectorHomeReportRow>();
  for (const row of [...owned, ...assigned]) {
    if (!row?.id) continue;
    if (!byId.has(row.id)) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()].sort((a, b) => {
    const ta = Date.parse(a.created_at) || 0;
    const tb = Date.parse(b.created_at) || 0;
    return tb - ta;
  });
}

export function pickActiveInspection(
  items: InspectorHomeListItem[],
): InspectorHomeListItem | null {
  for (const item of items) {
    if (!item.isCompleted) return item;
  }
  return items[0] ?? null;
}

export function computeWeekStats(items: InspectorHomeListItem[]): InspectorHomeWeekStats {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let completedThisWeek = 0;
  let draftsThisWeek = 0;

  for (const item of items) {
    const ts = Date.parse(item.updatedAt);
    if (!Number.isFinite(ts) || ts < weekAgo) continue;
    if (item.isCompleted) completedThisWeek += 1;
    else if (item.isDraft) draftsThisWeek += 1;
  }

  return { completedThisWeek, draftsThisWeek };
}

/** Infère la juridiction depuis l'adresse — valeur par défaut org/profil. */
export function inferJurisdictionFromAddress(address: string): "ca_qc" | "ca_general" {
  const a = address.toLowerCase();
  if (
    /\b(qc|qu[eé]bec|montr[eé]al|laval|gatineau|sherbrooke|qu[eé]bec)\b/i.test(a) ||
    /,\s*qc\b/i.test(a)
  ) {
    return "ca_qc";
  }
  return "ca_general";
}
