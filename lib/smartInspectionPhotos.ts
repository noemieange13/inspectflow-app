import { createObservationId, isObservationId } from "@/lib/observationIds";

/** Photo Smart Inspection — `observation_id` est la seule source de vérité pour le lien constat. */
export type SmartInspectionPhoto = {
  photo_id: string;
  observation_id: string | null;
  name: string;
  size?: number;
  type?: string;
  lastModified?: number;
  sectionName?: string;
  url?: string | null;
  base64?: string | null;
  originalFileName?: string;
};

export type SmartInspectionConstat = {
  id: string;
  title: string;
  maxPhotos?: number;
  photos: SmartInspectionPhoto[];
  observation?: string;
  recommendation?: string;
  gravite?: string;
  urgence?: string;
  inspector_notes?: string;
};

export type SmartInspectionSection = {
  name: string;
  icon?: string;
  constats: SmartInspectionConstat[];
  /** Pool sectionnel (optionnel) — affichage/PDF via observation_id uniquement. */
  photos_pool?: SmartInspectionPhoto[];
};

export type SmartPhotoRegistryEntry = {
  photo_id: string;
  name: string;
  observation_id: string | null;
};

export const SMART_PHOTO_REGISTRY_KEY = "smartInspectionPhotoRegistry";

export function createSmartPhotoId(): string {
  return createObservationId();
}

export function ensureSmartConstatId(id: unknown): string {
  return isObservationId(id) ? String(id).trim() : createObservationId();
}

/** Assignations photo-pick : indices API → observation_id sur le registre. */
export function applyPhotoPickAssignments(
  pickBatch: ReadonlyArray<{ photo_id: string }>,
  assignments: Record<string, number[] | undefined>,
  validConstatIds: ReadonlySet<string>,
  registry: Map<string, SmartPhotoRegistryEntry>,
): void {
  for (const constatId of validConstatIds) {
    const indices = assignments[constatId];
    if (!Array.isArray(indices)) continue;
    for (const rawIdx of indices) {
      if (typeof rawIdx !== "number" || !Number.isFinite(rawIdx)) continue;
      const idx = Math.floor(rawIdx);
      const picked = pickBatch[idx];
      if (!picked || !isObservationId(picked.photo_id)) continue;
      const entry = registry.get(picked.photo_id);
      if (entry) entry.observation_id = constatId;
    }
  }
}

/** Photos d'un constat — filtre strict par observation_id === constat.id. */
export function photosForConstat(
  constat: Pick<SmartInspectionConstat, "id" | "photos">,
  pool?: SmartInspectionPhoto[],
): SmartInspectionPhoto[] {
  const source = pool ?? constat.photos ?? [];
  return source.filter(
    (p) =>
      isObservationId(p.photo_id) &&
      isObservationId(constat.id) &&
      p.observation_id === constat.id,
  );
}

export function stripSmartPhotoForStorage(
  photo: SmartInspectionPhoto,
): Omit<SmartInspectionPhoto, "url" | "base64"> {
  return {
    photo_id: photo.photo_id,
    observation_id: photo.observation_id,
    name: photo.name,
    size: photo.size,
    type: photo.type,
    lastModified: photo.lastModified,
    sectionName: photo.sectionName,
    originalFileName: photo.originalFileName,
  };
}

export function stripSmartSectionsForStorage(
  sections: SmartInspectionSection[],
): SmartInspectionSection[] {
  return sections.map((section) => ({
    ...section,
    photos_pool: section.photos_pool?.map(stripSmartPhotoForStorage),
    constats: section.constats.map((constat) => ({
      ...constat,
      photos: photosForConstat(constat, section.photos_pool ?? constat.photos).map(
        stripSmartPhotoForStorage,
      ),
    })),
  }));
}

export function parseSmartPhotoRegistry(raw: unknown): Map<string, SmartPhotoRegistryEntry> {
  const out = new Map<string, SmartPhotoRegistryEntry>();
  if (!Array.isArray(raw)) return out;
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const photo_id = typeof o.photo_id === "string" ? o.photo_id.trim() : "";
    const name = typeof o.name === "string" ? o.name : "";
    if (!isObservationId(photo_id)) continue;
    const obsRaw = o.observation_id;
    const observation_id =
      obsRaw === null || obsRaw === undefined || obsRaw === ""
        ? null
        : isObservationId(obsRaw)
          ? String(obsRaw).trim()
          : null;
    out.set(photo_id, { photo_id, name, observation_id });
  }
  return out;
}

export function serializeSmartPhotoRegistry(
  registry: Map<string, SmartPhotoRegistryEntry>,
): SmartPhotoRegistryEntry[] {
  return [...registry.values()];
}

export type SmartPhotoMedia = { url?: string; base64?: string };

/** Restauration preview — clé unique photo_id (pas filename, pas photoNumber). */
export function buildSmartPhotoMediaByPhotoId(
  sections: SmartInspectionSection[],
): Map<string, SmartPhotoMedia> {
  const byId = new Map<string, SmartPhotoMedia>();
  for (const section of sections) {
    const pools = [
      ...(section.photos_pool ?? []),
      ...section.constats.flatMap((c) => c.photos ?? []),
    ];
    for (const p of pools) {
      if (!isObservationId(p.photo_id)) continue;
      const url = typeof p.url === "string" && p.url.length > 0 ? p.url : undefined;
      const base64 =
        typeof p.base64 === "string" && p.base64.length > 0 ? p.base64 : undefined;
      if (url || base64) byId.set(p.photo_id, { url, base64 });
    }
  }
  return byId;
}

export function attachMediaToPhotoPool(
  photos: SmartInspectionPhoto[],
  mediaByPhotoId: Map<string, SmartPhotoMedia>,
): SmartInspectionPhoto[] {
  return photos.map((photo) => {
    if (photo.url || photo.base64) return photo;
    const media = mediaByPhotoId.get(photo.photo_id);
    if (!media) return photo;
    return {
      ...photo,
      url: media.url ?? photo.url,
      base64: media.base64 ?? photo.base64,
    };
  });
}
