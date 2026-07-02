import type { InspectionCoverPayloadV1 } from "@/lib/inspectionCoverPayload";

/** Préfère le texte unique généré / édité ; sinon assemble les sous-champs. */
export function effectiveDescriptionNarrative(cover: InspectionCoverPayloadV1): string {
  const g = cover.generated_description_text?.trim();
  if (g) return g;
  return formatDescriptionSommaireFr(cover.description_sommaire);
}

/** Texte continu lisible pour la vue « résumé » (pas un formulaire grille). */
export function formatDescriptionSommaireFr(
  ds: InspectionCoverPayloadV1["description_sommaire"],
): string {
  const bits: string[] = [];
  const push = (label: string, v: string) => {
    const t = v.trim();
    if (t) bits.push(`${label} ${t}`);
  };
  push("Type :", ds.type_maison);
  push("Construit en", ds.construit_en);
  push("Façade avant :", ds.facade);
  push("Côtés :", ds.cotes);
  push("Arrière :", ds.arriere);
  push("Toiture :", ds.toiture);
  push("Fondation :", ds.type_fondation);
  push("Structure :", ds.type_structure);
  push("Chauffage :", ds.chauffage);
  return bits.length ? bits.join(". ") + (bits.length ? "." : "") : "";
}

export function formatProprieteUneLigne(
  p: InspectionCoverPayloadV1["propriete"],
): string {
  const parts: string[] = [];
  if (p.adresse.trim()) parts.push(p.adresse.trim());
  if (p.type_propriete.trim()) parts.push(`Type : ${p.type_propriete.trim()}`);
  if (p.annee_construction.trim()) parts.push(`Construction : ${p.annee_construction.trim()}`);
  return parts.join(" — ");
}
