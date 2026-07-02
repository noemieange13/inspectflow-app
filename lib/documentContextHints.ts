import type { DocumentIntelligenceResult, DocumentRisk } from "@/lib/document-intelligence";
import {
  DOCUMENT_FUSION_KEY,
  type DocumentFusionV1,
  parseDocumentFusionV1,
} from "@/lib/documentFusionEngine";

export type DocumentContextPayload = {
  analysis?: DocumentIntelligenceResult;
  suggestedChecks?: string[];
};

export function readDocumentFusionFromPayload(
  payload: Record<string, unknown>,
): DocumentFusionV1 | null {
  const raw = payload[DOCUMENT_FUSION_KEY];
  if (raw && typeof raw === "object" && "schema_version" in (raw as object)) {
    return parseDocumentFusionV1(raw);
  }
  const intake = payload.document_fusion_v1;
  if (intake && typeof intake === "object") {
    const nested = (intake as Record<string, unknown>).fusion;
    if (nested) return parseDocumentFusionV1(nested);
  }
  return parseDocumentFusionV1(raw);
}

export function readDocumentIntakeFromPayload(
  payload: Record<string, unknown>,
): DocumentContextPayload | null {
  const raw = payload.document_intake_v1;
  if (!raw || typeof raw !== "object") return null;
  const intake = raw as Record<string, unknown>;
  const analysis = intake.analysis;
  if (!analysis || typeof analysis !== "object") return null;
  return {
    analysis: analysis as DocumentIntelligenceResult,
    suggestedChecks: Array.isArray((analysis as DocumentIntelligenceResult).suggestedChecks)
      ? (analysis as DocumentIntelligenceResult).suggestedChecks
      : [],
  };
}

function normalizeRoom(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function riskMatchesRoom(risk: DocumentRisk, roomHint: string | null | undefined): boolean {
  if (!roomHint?.trim()) return true;
  const room = normalizeRoom(roomHint);
  const loc = normalizeRoom(risk.location);
  if (loc.includes(room) || room.includes(loc)) return true;
  if (room.includes("sous") && loc.includes("sous")) return true;
  if (room.includes("toit") && loc.includes("toit")) return true;
  return false;
}

/** Rappels contextuels pour l'assistant terrain (sans données privées brutes). */
export function getDocumentContextReminders(
  payload: Record<string, unknown>,
  roomHint?: string | null,
): string[] {
  const fusion = readDocumentFusionFromPayload(payload);
  const fusionReminders = buildFusionReminders(fusion, roomHint);
  if (fusionReminders.length > 0) return fusionReminders;

  const ctx = readDocumentIntakeFromPayload(payload);
  if (!ctx?.analysis?.risks?.length) return [];

  return ctx.analysis.risks
    .filter((r) => riskMatchesRoom(r, roomHint))
    .slice(0, 4)
    .map((r) => formatDvReminder(r, roomHint));
}

function formatDvReminder(risk: DocumentRisk, roomHint?: string | null): string {
  const room = roomHint?.trim() ? `Vous êtes au ${roomHint.toLowerCase()}. ` : "";
  if (risk.category === "Infiltration") {
    const kind = risk.note.toLowerCase().includes("ancien")
      ? "une ancienne infiltration"
      : "un problème d'humidité";
    return `${room}La DV mentionnait ${kind} (${risk.location}). Voulez-vous vérifier ce point?`;
  }
  return `${room}La DV mentionnait ${risk.category.toLowerCase()} (${risk.location}). Voulez-vous vérifier ce point?`;
}

function buildFusionReminders(
  fusion: DocumentFusionV1 | null,
  roomHint?: string | null,
): string[] {
  if (!fusion?.seller_disclosure.risks.length) return [];
  const room = roomHint?.trim() ? `Vous êtes au ${roomHint.toLowerCase()}. ` : "";
  return fusion.seller_disclosure.risks
    .filter((r) => riskMatchesRoom(r, roomHint))
    .slice(0, 3)
    .map((r) => {
      if (r.category === "Infiltration") {
        return `${room}La DV mentionnait une ancienne infiltration (${r.location}). Voulez-vous vérifier ce point?`;
      }
      return `${room}La DV mentionnait ${r.category.toLowerCase()} (${r.location}). Voulez-vous vérifier ce point?`;
    });
}

export function detectRoomHintFromText(text: string): string | null {
  const lower = text.toLowerCase();
  if (/\bsous[- ]?sol\b/.test(lower)) return "Sous-sol";
  if (/\bgrenier\b/.test(lower)) return "Grenier";
  if (/\btoiture\b/.test(lower)) return "Toiture";
  if (/\bcuisine\b/.test(lower)) return "Cuisine";
  if (/\bsalle de bain\b/.test(lower)) return "Salle de bain";
  if (/\bsalon\b/.test(lower)) return "Salon";
  if (/\bgarage\b/.test(lower)) return "Garage";
  return null;
}
