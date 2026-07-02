/**
 * Phase 8G — `inspection_weather_v1` payload helpers.
 * Human edits always win over fetched values.
 */

export const INSPECTION_WEATHER_PAYLOAD_KEY = "inspection_weather_v1" as const;

export type InspectionWeatherV1 = {
  temperature_c: number;
  condition: string;
  humidity: number | null;
  wind_speed: number | null;
  recorded_at: string;
  location: string | null;
  notes: string | null;
};

export type InspectionWeatherDraft = Partial<
  Omit<InspectionWeatherV1, "recorded_at">
> & {
  recorded_at?: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/** WMO weather code → French condition label (capitalized for UI). */
export function wmoCodeToConditionFr(code: number): string {
  if (code === 0) return "Ensoleillé";
  if (code <= 3) return "Nuageux";
  if (code <= 48) return "Brouillard";
  if (code <= 57) return "Bruine";
  if (code <= 67) return "Pluie";
  if (code <= 77) return "Neige";
  if (code <= 82) return "Averses";
  if (code <= 86) return "Averses de neige";
  if (code <= 99) return "Orage";
  return "Conditions variables";
}

export function parseInspectionWeatherV1(raw: unknown): InspectionWeatherV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const condition = normalizeString(o.condition);
  if (!condition || !isFiniteNumber(o.temperature_c)) return null;
  const recordedAt = normalizeString(o.recorded_at);
  if (!recordedAt) return null;
  return {
    temperature_c: Math.round(o.temperature_c),
    condition,
    humidity: isFiniteNumber(o.humidity) ? Math.round(o.humidity) : null,
    wind_speed: isFiniteNumber(o.wind_speed) ? Math.round(o.wind_speed * 10) / 10 : null,
    recorded_at: recordedAt,
    location: normalizeString(o.location),
    notes: normalizeString(o.notes),
  };
}

export function readInspectionWeatherFromPayload(
  payload: unknown,
): InspectionWeatherV1 | null {
  if (!payload || typeof payload !== "object") return null;
  return parseInspectionWeatherV1(
    (payload as Record<string, unknown>)[INSPECTION_WEATHER_PAYLOAD_KEY],
  );
}

/** Merge manual inspector edits onto a base snapshot (human wins). */
export function mergeInspectionWeatherEdits(
  base: InspectionWeatherV1,
  edits: InspectionWeatherDraft,
): InspectionWeatherV1 {
  return {
    temperature_c: isFiniteNumber(edits.temperature_c)
      ? Math.round(edits.temperature_c)
      : base.temperature_c,
    condition: normalizeString(edits.condition) ?? base.condition,
    humidity:
      edits.humidity === null
        ? null
        : isFiniteNumber(edits.humidity)
          ? Math.round(edits.humidity)
          : base.humidity,
    wind_speed:
      edits.wind_speed === null
        ? null
        : isFiniteNumber(edits.wind_speed)
          ? Math.round(edits.wind_speed * 10) / 10
          : base.wind_speed,
    recorded_at: normalizeString(edits.recorded_at) ?? base.recorded_at,
    location: edits.location === null ? null : normalizeString(edits.location) ?? base.location,
    notes: edits.notes === null ? null : normalizeString(edits.notes) ?? base.notes,
  };
}

export function formatWeatherRecordedTime(iso: string, language: "fr" | "en" = "fr"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString(language === "en" ? "en-CA" : "fr-CA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function buildWeatherSaveBody(
  reportId: string,
  accessToken: string,
  weather: InspectionWeatherV1,
): Record<string, unknown> {
  return {
    report_id: reportId,
    access_token: accessToken,
    inspection_weather_v1: weather,
  };
}
