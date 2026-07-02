/**
 * Phase 8T — Steve pilot simulation metrics (anonymous, localStorage only).
 */
export const STEVE_PILOT_METRICS_KEY = "steve_pilot_v1" as const;

export type StevePilotWorkflow = "field_assistant" | "post_inspection" | null;

export type StevePilotMetricsV1 = {
  started_at: string;
  workflow_used: StevePilotWorkflow;
  photo_count: number;
  corrections_count: number;
  report_generation_time: number | null;
  pdf_preview_opened: boolean;
  completed: boolean;
};

export type PreDeliveryReadiness = {
  clientPresent: boolean;
  addressPresent: boolean;
  /** @deprecated use clientPresent + addressPresent */
  clientInfo: boolean;
  photosAnalyzed: boolean;
  findingsLinked: boolean;
  weatherAdded: boolean;
  styleApplied: boolean;
  steveFormat: boolean;
};

const DEFAULT_METRICS = (): StevePilotMetricsV1 => ({
  started_at: new Date().toISOString(),
  workflow_used: null,
  photo_count: 0,
  corrections_count: 0,
  report_generation_time: null,
  pdf_preview_opened: false,
  completed: false,
});

function guard(): boolean {
  return typeof window !== "undefined";
}

export function readStevePilotMetrics(): StevePilotMetricsV1 | null {
  if (!guard()) return null;
  try {
    const raw = window.localStorage.getItem(STEVE_PILOT_METRICS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StevePilotMetricsV1;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStevePilotMetrics(metrics: StevePilotMetricsV1): void {
  if (!guard()) return;
  try {
    window.localStorage.setItem(STEVE_PILOT_METRICS_KEY, JSON.stringify(metrics));
  } catch {
    /* quota */
  }
}

export function startStevePilot(workflow: StevePilotWorkflow = null): StevePilotMetricsV1 {
  const existing = readStevePilotMetrics();
  if (existing?.started_at) return existing;
  const metrics = { ...DEFAULT_METRICS(), workflow_used: workflow };
  writeStevePilotMetrics(metrics);
  return metrics;
}

export function updateStevePilotMetrics(
  patch: Partial<Omit<StevePilotMetricsV1, "started_at">>,
): StevePilotMetricsV1 {
  const base = readStevePilotMetrics() ?? DEFAULT_METRICS();
  const next: StevePilotMetricsV1 = { ...base, ...patch };
  writeStevePilotMetrics(next);
  return next;
}

export function markStevePilotCompleted(): StevePilotMetricsV1 {
  return updateStevePilotMetrics({ completed: true });
}

export function incrementStevePilotCorrections(delta = 1): StevePilotMetricsV1 {
  const base = readStevePilotMetrics() ?? startStevePilot();
  return updateStevePilotMetrics({
    corrections_count: Math.max(0, base.corrections_count + delta),
  });
}

export function recordStevePilotPreviewOpened(): StevePilotMetricsV1 {
  return updateStevePilotMetrics({ pdf_preview_opened: true });
}

export function recordStevePilotGenerationTime(seconds: number): StevePilotMetricsV1 {
  return updateStevePilotMetrics({
    report_generation_time: Math.max(0, Math.round(seconds)),
  });
}

/** Simulated bulk import metrics (300 photos pilot). */
export function simulateStevePilotPhotoBatch(count: number): StevePilotMetricsV1 {
  return updateStevePilotMetrics({ photo_count: Math.max(0, count) });
}

export function buildPreDeliveryReadiness(input: {
  payload: Record<string, unknown>;
  photoCount: number;
  findingsCount: number;
  weatherPresent: boolean;
  photosReady?: boolean;
  observationsReady?: boolean;
}): PreDeliveryReadiness {
  const cover = input.payload.cover_v1;
  const coverObj = cover && typeof cover === "object" ? (cover as Record<string, unknown>) : {};
  const propriete =
    coverObj.propriete && typeof coverObj.propriete === "object"
      ? (coverObj.propriete as Record<string, unknown>)
      : {};
  const clientFromPropriete =
    typeof propriete.client_nom === "string" ? propriete.client_nom.trim() : "";
  const clientName =
    typeof coverObj.client_name === "string" && coverObj.client_name.trim()
      ? coverObj.client_name.trim()
      : typeof coverObj.requerants === "string" && coverObj.requerants.trim()
        ? coverObj.requerants.trim()
        : clientFromPropriete;
  const address =
    typeof coverObj.address === "string"
      ? coverObj.address.trim()
      : typeof (coverObj.propriete as Record<string, unknown> | undefined)?.adresse === "string"
        ? String((coverObj.propriete as Record<string, unknown>).adresse).trim()
        : "";

  const snap = input.payload.report_ready_snapshot_v1;
  const snapObj = snap && typeof snap === "object" ? (snap as Record<string, unknown>) : null;

  const styleRaw = input.payload.inspector_report_style_v1;
  const styleApplied = styleRaw != null && typeof styleRaw === "object";

  const steveFormat =
    snapObj?.compliance_ready === true ||
    snapObj?.observations_ready === true ||
    (input.findingsCount > 0 && input.photoCount > 0);

  const photosAnalyzed =
    input.photosReady === true ||
    snapObj?.photos_ready === true ||
    input.photoCount > 0;

  const findingsLinked =
    input.observationsReady === true ||
    snapObj?.observations_ready === true ||
    (input.findingsCount > 0 && input.photoCount > 0);

  return {
    clientPresent: clientName.length > 0,
    addressPresent: address.length > 0,
    clientInfo: clientName.length > 0 && address.length > 0,
    photosAnalyzed,
    findingsLinked,
    weatherAdded: input.weatherPresent,
    styleApplied,
    steveFormat,
  };
}

export function allPreDeliveryReady(readiness: PreDeliveryReadiness): boolean {
  return (
    readiness.clientPresent &&
    readiness.addressPresent &&
    readiness.photosAnalyzed &&
    readiness.findingsLinked &&
    readiness.weatherAdded &&
    readiness.styleApplied &&
    readiness.steveFormat
  );
}
