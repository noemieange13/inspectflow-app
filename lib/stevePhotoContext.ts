/**
 * Phase 8V — Contexte photo Steve (couche additive, sans modifier Photo Intelligence).
 */

export const STEVE_PHOTO_CONTEXT_V1_KEY = "steve_photo_context_v1" as const;

export type StevePhotoContextV1 = {
  photo_id: string;
  inspection_section: string;
  component: string;
  component_id?: string;
  defect_candidate?: string;
  orientation?: string;
};

export type StevePhotoContextPayloadV1 = {
  schema_version: 1;
  contexts: StevePhotoContextV1[];
};

export function parseStevePhotoContextPayloadV1(raw: unknown): StevePhotoContextPayloadV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== 1 || !Array.isArray(o.contexts)) return null;
  const contexts = o.contexts
    .filter((row) => row && typeof row === "object")
    .map((row) => {
      const r = row as Record<string, unknown>;
      if (typeof r.photo_id !== "string" || typeof r.inspection_section !== "string") {
        return null;
      }
      return {
        photo_id: r.photo_id,
        inspection_section: r.inspection_section,
        component: typeof r.component === "string" ? r.component : "",
        component_id: typeof r.component_id === "string" ? r.component_id : undefined,
        defect_candidate:
          typeof r.defect_candidate === "string" ? r.defect_candidate : undefined,
        orientation: typeof r.orientation === "string" ? r.orientation : undefined,
      } satisfies StevePhotoContextV1;
    })
    .filter(Boolean) as StevePhotoContextV1[];
  return { schema_version: 1, contexts };
}

export function readStevePhotoContextsFromPayload(
  payload: Record<string, unknown>,
): StevePhotoContextV1[] {
  return parseStevePhotoContextPayloadV1(payload[STEVE_PHOTO_CONTEXT_V1_KEY])?.contexts ?? [];
}

export function attachPhotoToSteveComponent(input: {
  photo_id: string;
  component_id: string;
  inspection_section: string;
  component: string;
  defect_candidate?: string;
  orientation?: string;
}): StevePhotoContextV1 {
  return {
    photo_id: input.photo_id,
    inspection_section: input.inspection_section,
    component: input.component,
    component_id: input.component_id,
    defect_candidate: input.defect_candidate,
    orientation: input.orientation,
  };
}

export function mergeStevePhotoContextPayload(
  existing: StevePhotoContextV1[],
  next: StevePhotoContextV1,
): StevePhotoContextPayloadV1 {
  const filtered = existing.filter((c) => c.photo_id !== next.photo_id);
  return { schema_version: 1, contexts: [...filtered, next] };
}

export function photosForSteveComponent(
  contexts: StevePhotoContextV1[],
  componentId: string,
): string[] {
  return contexts
    .filter((c) => c.component_id === componentId || c.component === componentId)
    .map((c) => c.photo_id);
}
