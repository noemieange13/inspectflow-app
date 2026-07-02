import type { InspectionCoverPayloadV1 } from "@/lib/inspectionCoverPayload";

/** Confiance perçue pour le texte issu de l’IA / imports (affichage seul). */
export type IaConfidenceLevel = "high" | "medium" | "low";

export function confidenceLabelFr(level: IaConfidenceLevel): string {
  switch (level) {
    case "high":
      return "Fiable";
    case "medium":
      return "À valider";
    case "low":
      return "Incertain";
  }
}

/**
 * Indique si le bloc a une source IA/import et quel niveau de prudence afficher.
 * `null` = saisie manuelle ou non applicable.
 */
export function blockIaConfidence(
  block: "requerant" | "propriete" | "description" | "condition",
  cover: InspectionCoverPayloadV1,
): IaConfidenceLevel | null {
  const h = cover.ia_hints ?? {};
  switch (block) {
    case "requerant":
    case "propriete":
      if (h.dv_photo_imported) return "high";
      return null;
    case "description":
      if (h.photos_description_imported || cover.description_sommaire.mode === "photos_ia") {
        return "medium";
      }
      return null;
    case "condition":
      if (h.photos_condition_imported) return "medium";
      if (h.notes_voice_imported) return "low";
      return null;
    default:
      return null;
  }
}
