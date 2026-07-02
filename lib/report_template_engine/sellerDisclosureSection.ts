import { escapeHtml } from "@/lib/buildInspectionReportHtml";
import type { SellerDisclosureV1 } from "@/lib/document-intelligence";
import type { CarbonMonoxideContextV1 } from "@/lib/report_template_engine/types";
import {
  readDocumentIntakeFromPayload,
} from "@/lib/documentContextHints";
import {
  parseDocumentFusionV1,
  DOCUMENT_FUSION_KEY,
} from "@/lib/documentFusionEngine";

export const SELLER_DISCLOSURE_SECTION_TITLE = "DÉCLARATION DU PROPRIÉTAIRE";

export const SELLER_DISCLOSURE_INTRO_FR =
  "Nous nous sommes assurés de faire remplir par le vendeur un document « Divulgation du propriétaire vendeur » concernant les conditions de la résidence que seule sa connaissance de la propriété et son expérience passée pourraient révéler. Vous trouverez donc les renseignements donnés par le vendeur à l'inspecteur dans ce document en annexe à la fin du présent rapport.";

export const ORIENTATION_READING_SECTION_TITLE =
  "LECTURE DU RAPPORT FACE AUX ORIENTATIONS";

export const ORIENTATION_READING_BODY_FR =
  "Pour les orientations mentionnées dans ce rapport, considérez que vous êtes dans la rue, face au bâtiment ou à la pièce concernée. Cette façade est l'AVANT ; les murs opposés qui délimitent l'immeuble ou la pièce forment l'ARRIÈRE. Vous regardez la façade de l'extérieur, le CÔTÉ DROIT est à votre DROITE et le côté gauche est à votre GAUCHE. Si vous vous placez à l'intérieur du bâtiment ou de la pièce, votre côté droit est donc à votre droite quand vous faites DOS à la façade.";

export const CARBON_MONOXIDE_NOTE_TITLE = "Note";

export const CARBON_MONOXIDE_NOTE_BODY_FR =
  "Les détecteurs de monoxyde de carbone sont obligatoires à proximité des foyers qui fonctionnent au bois, gaz, charbon, fuel, pétrole, propane... Un garage est attaché à la maison, un détecteur de monoxyde de carbone sera mis à proximité de la porte qui mène au garage de l'intérieur de la résidence. La hauteur recommandée pour placer votre détecteur de monoxyde de carbone est à 1 pied du sol.";

export const CARBON_MONOXIDE_DEFAULT_COMMENTS_FR =
  "Aucune composante alimentée au gaz ou au bois ne faisant partie intégrante du bâtiment, ce ne serait donc pas obligatoire d'installer des détecteurs de monoxyde de carbone sur chacun des étages. Un foyer au bois était présent dans le salon mais ne serait pas utilisé.";

export type { CarbonMonoxideContextV1 } from "@/lib/report_template_engine/types";

export const CARBON_MONOXIDE_CONTEXT_KEY = "carbon_monoxide_context_v1";

/** Lit le contexte CO optionnel — texte Steve fixe par défaut si absent. */
export function readCarbonMonoxideContextFromPayload(
  payload: Record<string, unknown>,
): CarbonMonoxideContextV1 | null {
  const raw = payload[CARBON_MONOXIDE_CONTEXT_KEY];
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  return {
    fireplace_present:
      typeof row.fireplace_present === "boolean" ? row.fireplace_present : undefined,
    garage_attached:
      typeof row.garage_attached === "boolean" ? row.garage_attached : undefined,
    gas_appliance_present:
      typeof row.gas_appliance_present === "boolean"
        ? row.gas_appliance_present
        : undefined,
    recommendation_text:
      typeof row.recommendation_text === "string"
        ? row.recommendation_text.trim()
        : undefined,
    source: typeof row.source === "string" ? row.source : undefined,
  };
}

export function buildCarbonMonoxideComments(
  context: CarbonMonoxideContextV1 | null | undefined,
): string {
  const custom = context?.recommendation_text?.trim();
  if (custom) return custom;
  return CARBON_MONOXIDE_DEFAULT_COMMENTS_FR;
}

/** Lit `seller_disclosure_v1` depuis document_fusion_v1 ou document_intake_v1. */
export function readSellerDisclosureV1FromPayload(
  payload: Record<string, unknown>,
): SellerDisclosureV1 | null {
  const fusionRaw = payload[DOCUMENT_FUSION_KEY];
  if (fusionRaw && typeof fusionRaw === "object") {
    const wrapper = fusionRaw as Record<string, unknown>;
    const inner = wrapper.fusion ?? fusionRaw;
    const fusion = parseDocumentFusionV1(inner);
    const sd = fusion?.seller_disclosure.seller_disclosure_v1;
    if (sd?.received_before_inspection) return sd;
  }

  const intake = readDocumentIntakeFromPayload(payload);
  const fromIntake = intake?.analysis?.seller_disclosure_v1;
  if (fromIntake?.received_before_inspection) return fromIntake;

  return null;
}

/** Commentaires DV — texte exact selon champs extraits (jamais inventés). */
export function buildSellerDisclosureComments(dv: SellerDisclosureV1): string {
  const parts: string[] = [];

  if (typeof dv.seller_acquisition_year === "number") {
    parts.push(
      `Le vendeur déclare avoir acquis l'immeuble en ${dv.seller_acquisition_year}.`,
    );
  }

  if (dv.dv_number?.trim()) {
    parts.push(
      `Une déclaration du vendeur nous a été remise avant l'inspection DV ${dv.dv_number.trim()}.`,
    );
  } else if (dv.received_before_inspection) {
    parts.push(
      "Une déclaration du vendeur nous a été remise avant l'inspection.",
    );
  }

  return parts.join(" ");
}

export function isSellerDisclosureSectionAvailable(
  dv: SellerDisclosureV1 | null | undefined,
): boolean {
  return Boolean(dv?.received_before_inspection);
}

export function buildSellerDisclosureSectionHtml(
  dv: SellerDisclosureV1 | null | undefined,
): string {
  if (!isSellerDisclosureSectionAvailable(dv) || !dv) return "";

  const comments = buildSellerDisclosureComments(dv);
  if (!comments.trim()) return "";

  return (
    `<section class="pro-seller-disclosure pro-break">` +
    `<h2 style="margin:1.25em 0 0.5em;font-size:17px">${escapeHtml(SELLER_DISCLOSURE_SECTION_TITLE)}</h2>` +
    `<p style="white-space:pre-wrap;line-height:1.45;margin:0 0 0.75em">${escapeHtml(SELLER_DISCLOSURE_INTRO_FR)}</p>` +
    `<h3 style="margin:0.75em 0 0.35em;font-size:15px">Commentaires</h3>` +
    `<p style="white-space:pre-wrap;line-height:1.45;margin:0">${escapeHtml(comments)}</p>` +
    `</section>`
  );
}

export function buildOrientationReadingSectionHtml(
  carbonMonoxideContext?: CarbonMonoxideContextV1 | null,
): string {
  const coComments = buildCarbonMonoxideComments(carbonMonoxideContext);

  return (
    `<section class="pro-orientation-reading pro-break">` +
    `<h2 style="margin:1.25em 0 0.5em;font-size:17px">${escapeHtml(ORIENTATION_READING_SECTION_TITLE)}</h2>` +
    `<p style="white-space:pre-wrap;line-height:1.45;margin:0 0 0.75em">${escapeHtml(ORIENTATION_READING_BODY_FR)}</p>` +
    `<h3 style="margin:0.75em 0 0.35em;font-size:15px">${escapeHtml(CARBON_MONOXIDE_NOTE_TITLE)}</h3>` +
    `<p style="white-space:pre-wrap;line-height:1.45;margin:0 0 0.75em">${escapeHtml(CARBON_MONOXIDE_NOTE_BODY_FR)}</p>` +
    `<h3 style="margin:0.75em 0 0.35em;font-size:15px">Commentaires</h3>` +
    `<p style="white-space:pre-wrap;line-height:1.45;margin:0">${escapeHtml(coComments)}</p>` +
    `</section>`
  );
}
