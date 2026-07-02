import {
  parseCoverFromPayload,
  type InspectorHomeListItem,
} from "@/lib/inspectorHomeList";

import type { AnyDevOfflineInspection } from "./types";

export function offlineInspectionToHomeListItem(
  record: AnyDevOfflineInspection,
): InspectorHomeListItem {
  const cover = parseCoverFromPayload(record.payload);
  const token = record.access_token.trim();
  const reportHref = `/report/${encodeURIComponent(record.id)}?token=${encodeURIComponent(token)}&offline=1`;

  return {
    reportId: record.id,
    address: cover.address || "Adresse à compléter",
    clientName: cover.clientName || "Client",
    phase: "draft",
    statusLabel: "Development Draft",
    completionPercent: 0,
    photoCount: 0,
    reportHref,
    updatedAt: record.updated_at || record.created_at,
    isCompleted: false,
    isDraft: true,
  };
}
