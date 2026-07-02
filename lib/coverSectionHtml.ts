import { escapeHtml } from "@/lib/buildInspectionReportHtml";
import { effectiveDescriptionNarrative } from "@/lib/coverResumeFormat";
import {
  effectiveComplianceNote,
  type InspectionCoverPayloadV1,
  type InspectorProfileV1,
} from "@/lib/inspectionCoverPayload";
import {
  fixedLimitationClausesFr,
  formatInspectorLimitationsBody,
  LIMITATIONS_FIXED_CLAUSE_VERSION,
} from "@/lib/limitations";

function row(label: string, value: string): string {
  const v = value.trim();
  if (!v) return "";
  return `<p style="margin:0.35em 0"><strong>${escapeHtml(label)}</strong> ${escapeHtml(v)}</p>`;
}

/**
 * Bloc HTML (fragment) pour le haut du PDF : couverture + identité inspecteur.
 */
export function buildCoverSectionHtml(
  cover: InspectionCoverPayloadV1,
  profile: InspectorProfileV1 | null,
): string {
  const logo =
    profile?.logo_data_url &&
    profile.logo_data_url.startsWith("data:image/") &&
    profile.logo_data_url.length < 900_000
      ? `<div style="margin-bottom:12px"><img src=${JSON.stringify(profile.logo_data_url)} alt="" style="max-height:72px;object-fit:contain" /></div>`
      : "";

  const entete = [
    row("REQUÉRANT(S)", cover.requerants),
    row("CONDITIONS MÉTÉO", cover.conditions_meteo),
    row("DATE / HEURE", cover.date_heure_affichage),
    row("DURÉE", cover.duree_inspection),
    row("INSPECTEUR", cover.inspecteur_nom),
    row("CERTIFICATION", cover.inspecteur_numero_certification),
    row("COMPAGNIE", cover.compagnie),
    row("INTERVENANTS SUR PLACE", cover.intervenants_sur_place),
  ].join("");

  const prop = cover.propriete;
  const propriete = [
    row("ADRESSE", prop.adresse),
    row("TYPE DE PROPRIÉTÉ", prop.type_propriete),
    row("ANNÉE DE CONSTRUCTION", prop.annee_construction),
    row("CLIENT (NOM)", prop.client_nom),
    row("Téléphone", prop.client_telephone),
    row("COURRIEL", prop.client_courriel),
  ].join("");

  const ds = cover.description_sommaire;
  const descTitle =
    cover.description_sommaire.mode === "photos_ia"
      ? "DESCRIPTION SOMMAIRE (pistes IA — à valider)"
      : "DESCRIPTION SOMMAIRE";
  const narrative = effectiveDescriptionNarrative(cover).trim();
  const description = narrative
    ? `<p style="margin:0.35em 0;white-space:pre-wrap;line-height:1.45">${escapeHtml(narrative)}</p>`
    : [
        row("TYPE DE MAISON", ds.type_maison),
        row("CONSTRUIT EN", ds.construit_en),
        row("FAÇADE AVANT", ds.facade),
        row("CÔTÉS", ds.cotes),
        row("ARRIÈRE", ds.arriere),
        row("TOITURE", ds.toiture),
        row("TYPE DE FONDATION", ds.type_fondation),
        row("TYPE DE STRUCTURE", ds.type_structure),
        row("CHAUFFAGE", ds.chauffage),
      ].join("");

  const orient = cover.orientation_facade
    ? row("ORIENTATION FAÇADE AVANT", cover.orientation_facade)
    : "";

  const limBody = formatInspectorLimitationsBody(cover).trim();
  const fixedLim = fixedLimitationClausesFr();
  const limitationsHtml =
    limBody || fixedLim.length > 0
      ? `<h3 style="margin:1em 0 0.5em;font-size:15px">Limitations de l’inspection</h3>` +
        (limBody
          ? `<p style="margin:0.35em 0;white-space:pre-wrap;line-height:1.45">${escapeHtml(limBody)}</p>`
          : "") +
        `<p style="margin:0.75em 0 0.35em;font-size:12px;font-weight:600;color:#334155">Clauses types (non modifiables — réf. ${escapeHtml(LIMITATIONS_FIXED_CLAUSE_VERSION)})</p>` +
        `<ul style="margin:0.25em 0 0;padding-left:1.25em;font-size:13px;line-height:1.4;color:#1e293b">` +
        fixedLim.map((line) => `<li>${escapeHtml(line)}</li>`).join("") +
        `</ul>`
      : "";

  return `
<section class="inspectflow-cover" style="margin-bottom:1.75em;padding:1em 1.25em;border:1px solid #cbd5e1;border-radius:8px;background:#f8fafc">
  <h2 style="margin:0 0 0.75em;font-size:18px">Couverture & en-tête</h2>
  ${logo}
  <h3 style="margin:1em 0 0.5em;font-size:15px">Inspection</h3>
  ${entete}
  <h3 style="margin:1em 0 0.5em;font-size:15px">Propriété</h3>
  ${propriete}
  <h3 style="margin:1em 0 0.5em;font-size:15px">${escapeHtml(descTitle)}</h3>
  ${description}
  ${row("CONDITION GÉNÉRALE", cover.condition_generale)}
  ${orient}
  ${limitationsHtml}
  <h3 style="margin:1em 0 0.5em;font-size:15px">Conformité</h3>
  <p style="margin:0.35em 0;white-space:pre-wrap">${escapeHtml(effectiveComplianceNote(cover) || "—")}</p>
  ${
    cover.compliance_block_v1?.template_version
      ? `<p style="margin:0.3em 0 0;font-size:11px;color:#64748b">Référence modèle conformité : ${escapeHtml(cover.compliance_block_v1.template_version)}${cover.compliance_block_v1.is_user_modified ? " — texte adapté par l’inspecteur" : ""}</p>`
      : ""
  }
</section>`.trim();
}
