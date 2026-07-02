/**
 * Phase 8T — Non-blocking photo ↔ finding validation before PDF.
 */
import { parseEntriesFromPayload } from "@/lib/findingsReview";
import { parsePhotoObservationLinks } from "@/lib/reportObservationPhotos";
import {
  parseReportPhotoSelectionIds,
  parseReportPhotoSelectionTiers,
} from "@/lib/reportPhotoSelectionPayload";
import type { ZoneCode } from "@/lib/reportNarrative";

export type PhotoFindingWarningCode =
  | "missing_linked_photo"
  | "critical_photo_unused"
  | "zone_category_conflict";

export type PhotoFindingWarning = {
  code: PhotoFindingWarningCode;
  message_fr: string;
  message_en: string;
  finding_id?: string;
  photo_id?: string;
};

export type PhotoFindingValidationResult = {
  status: "ok" | "warnings";
  message: string;
  message_en: string;
  items: PhotoFindingWarning[];
};

export type PhotoForValidation = {
  id: string;
  observation_id?: string | null;
  linked_zone?: ZoneCode;
};

const ZONE_SYSTEM: Partial<Record<ZoneCode, string>> = {
  installation_electrique: "electrical",
  plomberie: "plumbing",
  salle_de_bain: "plumbing",
  toiture: "roof",
  grenier: "roof",
  fondation: "structure",
  facade: "structure",
  sous_sol: "structure",
  cuisine: "interior",
  salon: "interior",
  garage: "exterior",
  exterieur: "exterior",
  autre: "general",
};

function systemForZone(zone: ZoneCode | undefined): string {
  if (!zone) return "general";
  return ZONE_SYSTEM[zone] ?? "general";
}

function zonesConflict(findingZone: ZoneCode, photoZone: ZoneCode): boolean {
  const a = systemForZone(findingZone);
  const b = systemForZone(photoZone);
  if (a === "general" || b === "general") return false;
  return a !== b;
}

export function parsePhotosForValidation(payload: Record<string, unknown>): PhotoForValidation[] {
  const byId = new Map<string, PhotoForValidation>();

  const links = parsePhotoObservationLinks(payload.photo_observation_links);
  if (links) {
    for (const link of links) {
      byId.set(link.photo_id, {
        id: link.photo_id,
        observation_id: link.observation_id,
      });
    }
  }

  const meta = payload.photos_meta_v1;
  if (Array.isArray(meta)) {
    for (const row of meta) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const id = typeof o.id === "string" ? o.id.trim() : "";
      if (!id) continue;
      const linked_zone =
        typeof o.linked_zone === "string" ? (o.linked_zone as ZoneCode) : undefined;
      const observation_id =
        typeof o.observation_id === "string" ? o.observation_id.trim() : null;
      const prev = byId.get(id);
      byId.set(id, {
        id,
        observation_id: observation_id ?? prev?.observation_id ?? null,
        linked_zone: linked_zone ?? prev?.linked_zone,
      });
    }
  }

  const selectionIds = parseReportPhotoSelectionIds(payload.report_photo_selection_v1) ?? [];
  for (const id of selectionIds) {
    if (!byId.has(id)) byId.set(id, { id });
  }

  return [...byId.values()];
}

export function validatePhotoFindingAssociations(input: {
  payload: Record<string, unknown>;
  photos?: PhotoForValidation[];
  language?: "fr" | "en";
}): PhotoFindingValidationResult {
  const language = input.language ?? "fr";
  const photos = input.photos ?? parsePhotosForValidation(input.payload);
  const entries = parseEntriesFromPayload(input.payload);
  const entryIds = new Set(
    entries
      .map((e) => e.id?.trim())
      .filter((id): id is string => Boolean(id)),
  );
  const photoIds = new Set(photos.map((p) => p.id));
  const photoById = new Map(photos.map((p) => [p.id, p]));
  const obsLinkedPhotoIds = new Set<string>();

  const items: PhotoFindingWarning[] = [];

  for (const photo of photos) {
    const obs = photo.observation_id?.trim();
    if (obs && entryIds.has(obs)) obsLinkedPhotoIds.add(photo.id);
  }

  for (const entry of entries) {
    const entryId = entry.id?.trim();
    if (!entryId) continue;
    const linkedPhotos = photos.filter((p) => p.observation_id?.trim() === entryId);
    if (linkedPhotos.length === 0) {
      items.push({
        code: "missing_linked_photo",
        finding_id: entryId,
        message_fr: `Constat sans photo associée (${entry.zone}).`,
        message_en: `Finding without linked photo (${entry.zone}).`,
      });
      continue;
    }
    for (const photo of linkedPhotos) {
      if (!photoIds.has(photo.id)) {
        items.push({
          code: "missing_linked_photo",
          finding_id: entryId,
          photo_id: photo.id,
          message_fr: "Photo liée introuvable dans la sélection.",
          message_en: "Linked photo missing from selection.",
        });
      }
      const photoZone = photo.linked_zone ?? "autre";
      const entryZone = entry.zone as ZoneCode;
      if (zonesConflict(entryZone, photoZone)) {
        items.push({
          code: "zone_category_conflict",
          finding_id: entryId,
          photo_id: photo.id,
          message_fr: `Zone photo (${photoZone}) différente du constat (${entryZone}).`,
          message_en: `Photo zone (${photoZone}) differs from finding (${entryZone}).`,
        });
      }
    }
  }

  const tiers = parseReportPhotoSelectionTiers(input.payload.report_photo_selection_v1);
  for (const [photoId, tier] of Object.entries(tiers)) {
    if (tier !== "critical") continue;
    if (!obsLinkedPhotoIds.has(photoId)) {
      items.push({
        code: "critical_photo_unused",
        photo_id: photoId,
        message_fr: "Photo critique non utilisée dans un constat.",
        message_en: "Critical photo not used in any finding.",
      });
    }
  }

  if (items.length === 0) {
    return {
      status: "ok",
      message: language === "en" ? "Ready for PDF" : "Prêt pour le PDF",
      message_en: "Ready for PDF",
      items: [],
    };
  }

  const count = items.length;
  return {
    status: "warnings",
    message:
      language === "en"
        ? `${count} item${count !== 1 ? "s" : ""} to verify`
        : `${count} élément${count !== 1 ? "s" : ""} à vérifier`,
    message_en: `${count} item${count !== 1 ? "s" : ""} to verify`,
    items,
  };
}
