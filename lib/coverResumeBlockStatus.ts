import type { InspectionCoverPayloadV1 } from "@/lib/inspectionCoverPayload";

import { effectiveDescriptionNarrative } from "@/lib/coverResumeFormat";
import { hasMinimumLimitationsContent } from "@/lib/limitations";
import { getComplianceExportMode } from "@/lib/inspectionCoverPayload";

export type ResumeBlockStatus = "ok" | "attention" | "missing";

/**
 * Statuts visuels sans bloquer l’inspecteur :
 * - missing : vide ou critique pour le rapport
 * - attention : prérempli IA / à relire
 * - ok : présent ou volontairement léger (ex. client)
 */
export function resumeBlockStatus(
  block:
    | "requerant"
    | "propriete"
    | "client"
    | "description"
    | "condition"
    | "limitations"
    | "orientation"
    | "inspecteur"
    | "compliance",
  cover: InspectionCoverPayloadV1,
): ResumeBlockStatus {
  const hints = cover.ia_hints ?? {};

  switch (block) {
    case "requerant":
      if (!cover.requerants.trim()) return "missing";
      if (hints.dv_photo_imported) return "attention";
      return "ok";
    case "propriete":
      if (!cover.propriete.adresse.trim()) return "missing";
      if (hints.dv_photo_imported) return "attention";
      return "ok";
    case "client":
      return "ok";
    case "description": {
      const t = effectiveDescriptionNarrative(cover).trim();
      if (!t) return "missing";
      if (hints.photos_description_imported || cover.description_sommaire.mode === "photos_ia") {
        return "attention";
      }
      return "ok";
    }
    case "condition":
      if (!cover.condition_generale.trim()) return "missing";
      if (hints.photos_condition_imported) return "attention";
      return "ok";
    case "limitations":
      if (getComplianceExportMode(cover) === "QC_2027" && !hasMinimumLimitationsContent(cover)) {
        return "missing";
      }
      return "ok";
    case "orientation":
      return "ok";
    case "inspecteur":
      if (!cover.inspecteur_nom.trim() && !cover.compagnie.trim()) return "attention";
      return "ok";
    case "compliance":
      return "ok";
    default:
      return "ok";
  }
}

export function statusLabel(s: ResumeBlockStatus): string {
  switch (s) {
    case "missing":
      return "Manquant";
    case "attention":
      return "À vérifier";
    case "ok":
      return "OK";
  }
}
