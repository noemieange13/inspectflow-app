/**
 * Phase 8V — Progression tournée Steve (session locale, sans modifier payload DB core).
 */

import type { SteveFindingV1 } from "@/lib/findingSchema";
import type { SteveFindingsPayloadV1 } from "@/lib/findingSchema";
import { getSteveComponentById } from "@/lib/steveInspectionOrder";

const PROGRESS_KEY_PREFIX = "inspectflow_steve_tour_v1:";

export function readSteveTourFindingsFromSession(reportId: string): SteveFindingV1[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(`${PROGRESS_KEY_PREFIX}${reportId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SteveFindingsPayloadV1;
    return Array.isArray(parsed.findings) ? parsed.findings : [];
  } catch {
    return [];
  }
}

export function writeSteveTourFindingsToSession(
  reportId: string,
  findings: SteveFindingV1[],
): void {
  if (typeof window === "undefined") return;
  const payload: SteveFindingsPayloadV1 = { schema_version: 1, findings };
  window.sessionStorage.setItem(
    `${PROGRESS_KEY_PREFIX}${reportId}`,
    JSON.stringify(payload),
  );
}

export function mergeSteveTourFinding(
  reportId: string,
  finding: SteveFindingV1,
): SteveFindingV1[] {
  const existing = readSteveTourFindingsFromSession(reportId).filter(
    (f) => f.component_id !== finding.component_id,
  );
  const next = [...existing, finding];
  writeSteveTourFindingsToSession(reportId, next);
  return next;
}

export function markSteveTourComponentNa(reportId: string, componentId: string): SteveFindingV1[] {
  const comp = getSteveComponentById(componentId);
  const existing = readSteveTourFindingsFromSession(reportId).filter(
    (f) => f.component_id !== componentId,
  );
  const row: SteveFindingV1 = {
    schema_version: 1,
    component_id: componentId,
    section: comp?.section ?? "",
    component: comp?.component ?? componentId,
    observation: "—",
    commentaire: "—",
    severity: "none",
    photos: [],
    status: "na",
    approved: true,
  };
  const next = [...existing, row];
  writeSteveTourFindingsToSession(reportId, next);
  return next;
}
