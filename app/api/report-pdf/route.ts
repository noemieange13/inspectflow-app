/**
 * POST /api/report-pdf
 * Génère un PDF professionnel d'inspection à partir de inspectionData complet.
 * Utilise Puppeteer (HTML → PDF) — serveur Node.js uniquement (non Edge).
 * Format : Rapport d'inspection pré-achat québécois (norme AIBQ).
 */

import { buildSmartInspectionComplianceContext } from "@/lib/compliance/compliance-rules/adapters/smartInspectionAdapter";
import {
  buildComplianceValidationV1,
  COMPLIANCE_VALIDATION_RESPONSE_HEADER,
  validateCompliance,
} from "@/lib/compliance/compliance-rules/validate";
import { recordInspectionEventSafe } from "@/lib/inspection_audit_trail";
import { hashInspectionContent } from "@/lib/inspection_audit_trail/metadata";
import { createServiceRoleClient } from "@/lib/supabaseServer";
import { photosForConstat, type SmartInspectionPhoto } from "@/lib/smartInspectionPhotos";

// ─── escapeHtml helper ────────────────────────────────────────────────────────
function esc(s: unknown): string {
  if (typeof s !== "string") return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface PhotoItem {
  photo_id?: string;
  observation_id?: string | null;
  name?: string;
  base64?: string;
  url?: string;
  photoNumber?: number;
  sectionName?: string;
  subTopic?: string;
}

interface Deficiency {
  description?: string;
  severity?: string;
  category?: string;
  recommendation?: string;
  urgency?: string;
  description_en?: string;
  recommendation_en?: string;
}

interface Constat {
  id?: string;
  title?: string;
  observation?: string;
  recommendation?: string;
  gravite?: string;
  urgence?: string;
  photos?: PhotoItem[];
}

interface Section {
  name?: string;
  icon?: string;
  constats?: Constat[];
  photos_pool?: PhotoItem[];
}

interface SectionPhotos {
  photos: PhotoItem[];
}

interface InspectionData {
  id?: string;
  requerants?: string;
  propriete_adresse?: string;
  client_nom?: string;
  client_telephone?: string;
  client_courriel?: string;
  type_propriete?: string;
  annee_construction?: string;
  date_heure?: string;
  heure_inspection?: string;
  conditions_meteo?: string;
  duree_inspection?: string;
  orientation_facade?: string;
  description_sommaire?: string;
  condition_generale?: string;
  intervenants?: string;
  declaration_proprietaire?: string;
  created_at?: string;
  compliance_province?: string;
  reportLanguage?: "fr" | "en" | "bilingual";
  legal_clauses?: Array<{
    labelFr?: string;
    textFr?: string;
    labelEn?: string;
    textEn?: string;
    category?: string;
  }>;
  disclaimer?: string;
  auto_constats?: Record<string, string>;
  auto_constats_en?: Record<string, string>;
  deficiencies?: Record<string, Deficiency[]>;
  recommendations?: string[];
  sections?: Section[];
  sections_photos?: Record<string, SectionPhotos>;
  // Inspector info from client payload
  inspectorName?: string;
  inspectorCompany?: string;
  inspectorAddress?: string;
  inspectorPhone?: string;
  inspectorEmail?: string;
  inspectorAibqNumber?: string;
  inspectorLogoUrl?: string;
  inspectorProvince?: string;
  inspectorWebsite?: string;
}

// ─── Normative limitation text per section ────────────────────────────────────
function getSectionLimitation(sectionName: string): string {
  const n = sectionName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (
    n.includes("fondat") ||
    n.includes("structural") ||
    n.includes("structur") ||
    n.includes("dalle") ||
    n.includes("poutre") ||
    n.includes("mur porteur")
  )
    return "L\u2019inspecteur a examin\u00e9 les composants structuraux visibles et accessibles, incluant les fondations, dalles de b\u00e9ton, planchers, poutres et murs porteurs. Les \u00e9l\u00e9ments structuraux enterr\u00e9s, recouverts ou dissimul\u00e9s n\u2019ont pu \u00eatre \u00e9valu\u00e9s. Aucun calcul structural ni sondage intrusif n\u2019est effectu\u00e9. (AIBQ Section I \u2014 Art. 2\u20133)";

  if (
    n.includes("exterieur") ||
    n.includes("facade") ||
    n.includes("revetement") ||
    n.includes("terrasse") ||
    n.includes("balcon") ||
    n.includes("escalier ext") ||
    n.includes("porche") ||
    n.includes("rampe ext")
  )
    return "L\u2019inspecteur a examin\u00e9 les composants ext\u00e9rieurs visibles, incluant le rev\u00eatement, les portes et fen\u00eatres, les terrasses, balcons, escaliers ext\u00e9rieurs et garages attach\u00e9s. Les \u00e9l\u00e9ments couverts de neige, de glace ou dissimul\u00e9s par la v\u00e9g\u00e9tation n\u2019ont pu \u00eatre inspect\u00e9s. (AIBQ Section II \u2014 Art. 4\u20135)";

  if (
    n.includes("toiture") ||
    n.includes("toit") ||
    n.includes("couverture") ||
    n.includes("goutiere") ||
    n.includes("solin") ||
    n.includes("cheminee") ||
    n.includes("lucarne") ||
    n.includes("puits de lumiere")
  )
    return "L\u2019inspecteur a examin\u00e9 la toiture depuis le sol ou en y acc\u00e9dant selon les conditions de s\u00e9curit\u00e9. La toiture peut ne pas \u00eatre accessible en cas de neige, glace, pente excessive ou conditions dangereuses. Les composants de toiture couverts ou non accessibles n\u2019ont pu \u00eatre \u00e9valu\u00e9s. (AIBQ Section III \u2014 Art. 6)";

  if (
    n.includes("plomberie") ||
    n.includes("plumb") ||
    n.includes("robinette") ||
    n.includes("chauffe-eau") ||
    n.includes("fosse septique") ||
    n.includes("sanitaire")
  )
    return "L\u2019inspecteur a examin\u00e9 la plomberie visible et accessible, incluant les tuyauteries d\u2019alimentation et de drainage, les appareils sanitaires et le chauffe-eau. Les tuyaux encastr\u00e9s, souterrains ou dissimul\u00e9s n\u2019ont pu \u00eatre \u00e9valu\u00e9s. Aucun essai de pression ni analyse de qualit\u00e9 de l\u2019eau n\u2019est effectu\u00e9. (AIBQ Section IV \u2014 Art. 7)";

  if (
    n.includes("electri") ||
    n.includes("panneau") ||
    n.includes("circuit") ||
    n.includes("prise") ||
    n.includes("tableau")
  )
    return "L\u2019inspecteur a examin\u00e9 le syst\u00e8me \u00e9lectrique visible et accessible, incluant le panneau de service, les circuits, les disjoncteurs et les prises accessibles. Les fils dans les murs ou espaces inaccessibles n\u2019ont pu \u00eatre inspect\u00e9s. Aucun essai de charge ni mesure \u00e9lectrique n\u2019est effectu\u00e9. (AIBQ Section V \u2014 Art. 8)";

  if (
    n.includes("chauffage") ||
    n.includes("heating") ||
    n.includes("thermostat") ||
    n.includes("fournaise") ||
    n.includes("chaudiere") ||
    n.includes("plinthe") ||
    n.includes("radiateur")
  )
    return "L\u2019inspecteur a examin\u00e9 les syst\u00e8mes de chauffage visibles et accessibles, incluant les appareils, les contr\u00f4les et la distribution apparente. Les conduits dans les murs ou plafonds n\u2019ont pu \u00eatre \u00e9valu\u00e9s. Les appareils hors service n\u2019ont pas \u00e9t\u00e9 mis en marche. (AIBQ Section VI \u2014 Art. 9)";

  if (
    n.includes("climatisation") ||
    n.includes("cooling") ||
    n.includes("pompe a chaleur") ||
    n.includes("thermopompe") ||
    n.includes("climatiseur")
  )
    return "L\u2019inspecteur a examin\u00e9 les syst\u00e8mes de climatisation et de pompe \u00e0 chaleur si en service au moment de l\u2019inspection. Les syst\u00e8mes mis hors service pour la saison n\u2019ont pas \u00e9t\u00e9 test\u00e9s. (AIBQ Section VII \u2014 Art. 10)";

  if (
    n.includes("interieur") ||
    n.includes("interior") ||
    n.includes("finition") ||
    n.includes("plancher") ||
    n.includes("plafond int") ||
    n.includes("escalier int") ||
    n.includes("porte int") ||
    n.includes("fenetre int") ||
    n.includes("armoire")
  )
    return "L\u2019inspecteur a examin\u00e9 les surfaces int\u00e9rieures visibles, incluant les murs, planchers, plafonds, escaliers int\u00e9rieurs, portes et fen\u00eatres int\u00e9rieures. Les \u00e9l\u00e9ments dissimul\u00e9s sous les rev\u00eatements, derri\u00e8re les meubles ou dans des espaces non accessibles n\u2019ont pu \u00eatre \u00e9valu\u00e9s. (AIBQ Section VIII \u2014 Art. 11)";

  if (
    n.includes("isolation") ||
    n.includes("insulation") ||
    n.includes("pare-vapeur") ||
    n.includes("vapeur") ||
    n.includes("grenier") ||
    n.includes("vide sanitaire") ||
    n.includes("sous-sol non fini")
  )
    return "L\u2019inspecteur a examin\u00e9 les mat\u00e9riaux d\u2019isolation visibles dans les espaces non finis. L\u2019isolation dans les murs finis, les vides inaccessibles ou sous les planchers n\u2019a pu \u00eatre \u00e9valu\u00e9e. (AIBQ Section IX \u2014 Art. 12)";

  if (
    n.includes("ventilation") ||
    n.includes("vrc") ||
    n.includes("erv") ||
    n.includes("echangeur") ||
    n.includes("hotte") ||
    n.includes("extracteur") ||
    n.includes("hrv")
  )
    return "L\u2019inspecteur a examin\u00e9 les syst\u00e8mes de ventilation visibles et accessibles, incluant la ventilation des greniers et sous-sols, les extracteurs de cuisine et salle de bain, et l\u2019\u00e9changeur d\u2019air si pr\u00e9sent. Les conduits dans les murs n\u2019ont pu \u00eatre \u00e9valu\u00e9s. (AIBQ Section X \u2014 Art. 13)";

  if (
    n.includes("securite") ||
    n.includes("safety") ||
    n.includes("rampe") ||
    n.includes("garde-fou") ||
    n.includes("detecteur") ||
    n.includes("fumee") ||
    n.includes("monoxyde") ||
    n.includes("sortie de secours") ||
    n.includes("egress")
  )
    return "L\u2019inspecteur a v\u00e9rifi\u00e9 les \u00e9l\u00e9ments de s\u00e9curit\u00e9 visibles, incluant les rampes, garde-fous, d\u00e9tecteurs de fum\u00e9e et de monoxyde de carbone, et les sorties de secours. La conformit\u00e9 au Code du b\u00e2timent en vigueur n\u2019est pas garantie. (AIBQ Section XI \u2014 Art. 14)";

  if (n.includes("garage"))
    return "L\u2019inspecteur a examin\u00e9 le garage et ses composants accessibles, incluant les portes, l\u2019entr\u00e9e de service et les syst\u00e8mes visibles. Les \u00e9l\u00e9ments dans les murs ou inaccessibles n\u2019ont pu \u00eatre \u00e9valu\u00e9s. (AIBQ Section II \u2014 Art. 4\u20135)";

  if (n.includes("sous-sol") || n.includes("basement") || n.includes("cave"))
    return "L\u2019inspecteur a examin\u00e9 le sous-sol visible et accessible. Les murs de fondation cach\u00e9s par les finitions ou les espaces inaccessibles n\u2019ont pu \u00eatre \u00e9valu\u00e9s. Tout signe visible d\u2019humidit\u00e9, de fissures ou d\u2019infiltration a \u00e9t\u00e9 signal\u00e9. (AIBQ Sections I + VIII)";

  // Generic fallback
  return "L\u2019inspecteur a examin\u00e9 les composants visibles et accessibles de cette section. Les \u00e9l\u00e9ments dissimul\u00e9s, non accessibles ou hors service n\u2019ont pu \u00eatre \u00e9valu\u00e9s. L\u2019inspection est visuelle et non exhaustive, conform\u00e9ment \u00e0 la Norme de pratique de l\u2019AIBQ.";
}

// ─── Photo block (2 per row, captions ABOVE in bold caps) ─────────────────────
function buildPhotoBlock(photos: PhotoItem[]): string {
  const valid = photos.filter((p) => {
    const src = p.base64 ?? p.url ?? "";
    return src.length > 50;
  });
  if (valid.length === 0) return "";

  let html =
    '<div style="margin:14px 0;display:flex;flex-wrap:wrap;gap:10px;">';
  for (const p of valid) {
    const src = esc(p.base64 ?? p.url ?? "");
    const caption = esc(
      (p.name ?? p.subTopic ?? "PHOTO").toUpperCase()
    );
    html += `
      <div style="flex:0 0 calc(50% - 5px);max-width:calc(50% - 5px);">
        <p style="font-size:9pt;font-weight:bold;text-transform:uppercase;margin:0 0 3px 0;text-align:center;color:#000;">${caption}</p>
        <img src="${src}" alt="${caption}"
          style="width:100%;max-height:200px;object-fit:cover;border:1px solid #aaa;display:block;"/>
      </div>`;
  }
  html += "</div>";
  return html;
}

// ─── HTML Template ────────────────────────────────────────────────────────────
function buildReportHtml(data: InspectionData): string {
  const reportNumber = data.id ?? `INS-${Date.now()}`;
  const address = data.propriete_adresse ?? "\u2014";
  const client = data.requerants ?? data.client_nom ?? "\u2014";
  const dateHeure = data.date_heure ?? new Date().toLocaleDateString("fr-CA");
  const heureInspection = data.heure_inspection ?? "";
  const dateDisplay = heureInspection
    ? `${dateHeure} \u00e0 ${heureInspection}`
    : dateHeure;
  const inspector = data.inspectorName ?? "\u2014";
  const company = data.inspectorCompany ?? "";
  const aibq = data.inspectorAibqNumber ?? "";
  const phone = data.inspectorPhone ?? "";
  const email = data.inspectorEmail ?? "";
  const inspAddr = data.inspectorAddress ?? "";
  const website = data.inspectorWebsite ?? "";
  const logo = data.inspectorLogoUrl ?? "";
  const province = data.compliance_province ?? data.inspectorProvince ?? "QC";

  const weather = data.conditions_meteo ?? "\u2014";
  const duration = data.duree_inspection ?? "\u2014";
  const typeProp = data.type_propriete ?? "\u2014";
  const yearBuilt = data.annee_construction ?? "\u2014";
  const orientation = data.orientation_facade ?? "\u2014";
  const summary = data.description_sommaire ?? "";
  const condition = data.condition_generale ?? "";
  const intervenants = data.intervenants ?? "\u2014";

  // ── Count deficiencies ────────────────────────────────────────────────────
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const allConstats: Constat[] = sections.flatMap((s) =>
    Array.isArray(s.constats) ? s.constats : []
  );
  const majeurCount = allConstats.filter((c) => c.gravite === "Majeur").length;
  const modereCount = allConstats.filter((c) => c.gravite === "Mod\u00e9r\u00e9").length;
  const mineurCount = allConstats.filter((c) => c.gravite === "Mineur").length;
  const allDefs: Deficiency[] = data.deficiencies
    ? Object.values(data.deficiencies).flat()
    : [];
  const majeurDef = allDefs.filter(
    (d) => (d.severity ?? "").toLowerCase() === "majeur"
  ).length;
  const modereDef = allDefs.filter(
    (d) => (d.severity ?? "").toLowerCase() === "mod\u00e9r\u00e9"
  ).length;
  const mineurDef = allDefs.filter(
    (d) => (d.severity ?? "").toLowerCase() === "mineur"
  ).length;
  const totalMajeur = majeurCount + majeurDef;
  const totalModere = modereCount + modereDef;
  const totalMineur = mineurCount + mineurDef;

  // ── Helper: row for info table ────────────────────────────────────────────
  function infoRow(label: string, value: string): string {
    return `<tr>
      <td style="font-weight:bold;padding:5px 8px;border:1px solid #ccc;background:#f5f5f5;width:38%;vertical-align:top;">${esc(label)}</td>
      <td style="padding:5px 8px;border:1px solid #ccc;vertical-align:top;">${esc(value)}</td>
    </tr>`;
  }

  // ── Sections d'inspection HTML ────────────────────────────────────────────
  // Build a merged map: sectionName → { constats, autoConstat, photos }
  const autoConstats = data.auto_constats ?? {};

  // Start with named sections
  const sectionNames: string[] = sections
    .map((s) => s.name ?? "")
    .filter(Boolean);

  // Add auto_constats keys not already in sections
  for (const key of Object.keys(autoConstats)) {
    if (key && !sectionNames.includes(key)) {
      sectionNames.push(key);
    }
  }

  let sectionsHtml = "";
  for (const secName of sectionNames) {
    const secData = sections.find((s) => s.name === secName);
    const constats = Array.isArray(secData?.constats) ? secData!.constats : [];
    const autoText = autoConstats[secName] ?? "";
    const limitation = getSectionLimitation(secName);

    const poolRaw: PhotoItem[] = [
      ...(Array.isArray(secData?.photos_pool) ? secData!.photos_pool! : []),
      ...constats.flatMap((c) => (Array.isArray(c.photos) ? c.photos : [])),
    ];
    const poolById = new Map<string, PhotoItem>();
    for (const p of poolRaw) {
      if (typeof p.photo_id === "string" && p.photo_id) poolById.set(p.photo_id, p);
    }
    const photoPool = [...poolById.values()];

    // Build constats observations text (+ photos liées par observation_id)
    const observationBlocks: string[] = constats
      .map((c) => {
        const parts: string[] = [];
        if (c.title) parts.push(`<strong>${esc(c.title)}</strong>`);
        if (c.observation) parts.push(esc(c.observation));
        const gravite = c.gravite ? ` <em>[${esc(c.gravite)}]</em>` : "";
        const urgence =
          c.urgence === "Urgent" ? " <em>[URGENT]</em>" : "";
        const textLine = parts.join(" \u2014 ") + gravite + urgence;
        if (!textLine) return "";

        const linked = photosForConstat(
          { id: c.id ?? "", photos: photoPool as SmartInspectionPhoto[] },
          photoPool as SmartInspectionPhoto[],
        );
        const photoHtml =
          linked.length > 0 ? buildPhotoBlock(linked as PhotoItem[]) : "";

        return `<li style="margin-bottom:8px;">${textLine}${photoHtml ? `<div style="margin-top:6px;">${photoHtml}</div>` : ""}</li>`;
      })
      .filter(Boolean);

    const observationLines: string[] = observationBlocks;

    const recommendationLines: string[] = constats
      .map((c) => c.recommendation ?? "")
      .filter(Boolean);

    // Also check deficiencies for this section
    const secDefs: Deficiency[] = data.deficiencies?.[secName] ?? [];

    // Build the section block
    sectionsHtml += `
    <div style="page-break-before:always;">
      <!-- Limitation normative -->
      <p style="font-style:italic;font-size:9.5pt;color:#444;margin:0 0 14px 0;line-height:1.5;">${limitation}</p>

      <!-- Section title -->
      <h2 style="font-size:14pt;font-weight:bold;text-transform:uppercase;border-bottom:2px solid #000;padding-bottom:4px;margin:0 0 14px 0;letter-spacing:0.5px;">${esc(secName)}</h2>

      <!-- Observations -->
      <p style="font-size:11pt;font-weight:bold;margin:10px 0 4px 0;">Observations&nbsp;:</p>
      ${
        observationLines.length > 0
          ? `<ul style="margin:0 0 10px 20px;padding:0;font-size:10.5pt;line-height:1.6;">
              ${observationLines.join("")}
            </ul>`
          : `<p style="font-size:10.5pt;margin:0 0 10px 0;font-style:italic;color:#555;">Aucune anomalie notable observ\u00e9e.</p>`
      }

      <!-- Commentaires (auto_constats IA) -->
      ${
        autoText
          ? `<p style="font-size:11pt;font-weight:bold;margin:10px 0 4px 0;">Commentaires&nbsp;:</p>
             <p style="font-size:10.5pt;margin:0 0 10px 0;line-height:1.6;white-space:pre-line;">${esc(autoText)}</p>`
          : ""
      }

      <!-- Deficiencies structurées -->
      ${
        secDefs.length > 0
          ? `<div style="margin:8px 0;">
              ${secDefs
                .map(
                  (d) =>
                    `<div style="margin-bottom:6px;padding:6px 10px;border-left:3px solid #555;">
                      <p style="margin:0;font-size:10.5pt;"><strong>[${esc((d.severity ?? "").toUpperCase())}]</strong> ${esc(d.description ?? "")}</p>
                      ${d.recommendation ? `<p style="margin:3px 0 0 0;font-size:10pt;font-style:italic;">${esc(d.recommendation)}</p>` : ""}
                    </div>`
                )
                .join("")}
            </div>`
          : ""
      }

      <!-- Recommandation -->
      ${
        recommendationLines.length > 0
          ? `<p style="font-size:11pt;font-weight:bold;margin:10px 0 4px 0;">Recommandation&nbsp;:</p>
             <ul style="margin:0 0 10px 20px;padding:0;font-size:10.5pt;line-height:1.6;">
               ${recommendationLines.map((r) => `<li style="margin-bottom:4px;">${esc(r)}</li>`).join("")}
             </ul>`
          : ""
      }
    </div>`;
  }

  // ── Recommendations (global) ──────────────────────────────────────────────
  const recs = Array.isArray(data.recommendations)
    ? data.recommendations.filter(Boolean)
    : [];
  const recsHtml =
    recs.length > 0
      ? `<ol style="margin:0 0 0 20px;padding:0;font-size:10.5pt;line-height:1.7;">
          ${recs.map((r) => `<li style="margin-bottom:6px;">${esc(r)}</li>`).join("")}
        </ol>`
      : `<p style="font-style:italic;color:#555;font-size:10.5pt;">Aucune recommandation globale enregistr\u00e9e.</p>`;

  // ── Legal clauses ─────────────────────────────────────────────────────────
  const legalClauses = Array.isArray(data.legal_clauses) ? data.legal_clauses : [];
  let legalHtml = "";
  if (legalClauses.length > 0) {
    legalHtml = legalClauses
      .map(
        (c) => `
      <div style="margin-bottom:14px;">
        <p style="font-weight:bold;font-size:10.5pt;margin:0 0 3px 0;">${esc(c.labelFr ?? c.labelEn ?? "")}</p>
        <p style="font-size:10pt;margin:0;line-height:1.6;">${esc(c.textFr ?? c.textEn ?? "")}</p>
      </div>`
      )
      .join("");
  }

  // ── Disclaimer (avis au lecteur) ──────────────────────────────────────────
  const disclaimerText =
    data.disclaimer ??
    "Cette inspection visuelle pr\u00e9-achat a \u00e9t\u00e9 effectu\u00e9e conform\u00e9ment \u00e0 la Norme de pratique de l\u2019AIBQ. Le rapport refl\u00e8te l\u2019\u00e9tat apparent du b\u00e2timent au moment de la visite et ne constitue pas une garantie ni une certification aux codes du b\u00e2timent. Les \u00e9l\u00e9ments non visibles ou non accessibles n\u2019ont pu \u00eatre \u00e9valu\u00e9s. La responsabilit\u00e9 de l\u2019inspecteur est limit\u00e9e au montant des honoraires per\u00e7us. Toute r\u00e9clamation doit \u00eatre formul\u00e9e par \u00e9crit dans l\u2019ann\u00e9e suivant la date de l\u2019inspection.";

  // ── Declaration du propriétaire ───────────────────────────────────────────
  const declText =
    data.declaration_proprietaire ??
    "Le vendeur a la l\u00e9gale obligation de divulguer \u00e0 l\u2019acheteur tout d\u00e9faut ou vice connu susceptible de r\u00e9duire la valeur ou l\u2019usage de l\u2019immeuble. La pr\u00e9sente inspection ne se substitue pas \u00e0 la d\u00e9claration du vendeur pr\u00e9vue au contrat de courtage immobilier. Il est fortement recommand\u00e9 \u00e0 l\u2019acheteur d\u2019obtenir et d\u2019examiner attentivement la d\u00e9claration du vendeur avant de finaliser toute transaction.";

  // ─── Full HTML ─────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>Rapport d\u2019inspection \u2014 ${esc(reportNumber)}</title>
  <style>
    @page { size: A4; margin: 25mm 20mm 20mm 20mm; }
    * { box-sizing: border-box; }
    body {
      font-family: 'Times New Roman', Times, Georgia, serif;
      margin: 0; color: #000; font-size: 11pt; line-height: 1.5;
    }
    h2 {
      font-size: 14pt; font-weight: bold; text-transform: uppercase;
      border-bottom: 2px solid #000; padding-bottom: 4px;
      margin: 0 0 14px 0; letter-spacing: 0.5px;
    }
    h3 {
      font-size: 12pt; font-weight: bold; text-transform: uppercase;
      margin: 16px 0 8px 0; border-bottom: 1px solid #666; padding-bottom: 2px;
    }
    table { border-collapse: collapse; width: 100%; }
    p { margin: 0 0 8px 0; }
  </style>
</head>
<body>

<!-- ════════════════════════════════════════════════════════════
     PAGE 1 — COUVERTURE
     ════════════════════════════════════════════════════════════ -->
<div style="page-break-after:always;min-height:220mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:20mm 20mm;">

  <!-- Logo entreprise -->
  ${
    logo
      ? `<img src="${esc(logo)}" alt="Logo" style="max-width:200px;max-height:100px;object-fit:contain;margin-bottom:24px;"/>`
      : `<div style="width:80px;height:80px;border:2px solid #000;display:flex;align-items:center;justify-content:center;margin-bottom:24px;font-size:28pt;font-weight:bold;">I</div>`
  }

  <!-- Dossier # -->
  <p style="font-size:12pt;margin:0 0 6px 0;">Dossier #&nbsp;: <strong>${esc(reportNumber)}</strong></p>

  <!-- Titre rapport -->
  <h1 style="font-size:22pt;font-weight:bold;text-transform:uppercase;letter-spacing:1px;margin:16px 0 20px 0;border-top:2px solid #000;border-bottom:2px solid #000;padding:10px 0;">RAPPORT D&apos;INSPECTION PR\u00c9-ACHAT</h1>

  <!-- Propriété -->
  <p style="font-size:13pt;margin:0 0 4px 0;font-weight:bold;">PROPRI\u00c9T\u00c9 SISE AU&nbsp;:</p>
  <p style="font-size:13pt;margin:0 0 28px 0;">${esc(address)}</p>

  <!-- Ligne séparation -->
  <hr style="border:none;border-top:1px solid #000;width:80%;margin:0 0 24px 0;"/>

  <!-- Informations entreprise -->
  ${company ? `<p style="font-size:11pt;font-weight:bold;margin:0 0 4px 0;">${esc(company)}</p>` : ""}
  ${website ? `<p style="font-size:10.5pt;margin:0 0 4px 0;">${esc(website)}</p>` : ""}
  ${inspAddr ? `<p style="font-size:10.5pt;margin:0 0 4px 0;"><strong>PLACE D\u2019AFFAIRE&nbsp;:</strong> ${esc(inspAddr)}</p>` : ""}
  ${phone ? `<p style="font-size:10.5pt;margin:0 0 4px 0;">T\u00e9l.&nbsp;: ${esc(phone)}</p>` : ""}
  ${email ? `<p style="font-size:10.5pt;margin:0 0 8px 0;">${esc(email)}</p>` : ""}
  ${aibq ? `<p style="font-size:11pt;font-weight:bold;margin:12px 0 0 0;">MEMBRE AIBQ \u2014 ${esc(aibq)}</p>` : ""}
</div>


<!-- ════════════════════════════════════════════════════════════
     PAGE 2 — INFORMATIONS GÉNÉRALES
     ════════════════════════════════════════════════════════════ -->
<div style="page-break-after:always;">
  <h2>INFORMATIONS G\u00c9N\u00c9RALES</h2>

  <table style="margin-bottom:18px;">
    ${infoRow("REQ\u00c9RANT(S)", client)}
    ${infoRow("CONDITIONS M\u00c9T\u00c9O", weather)}
    ${infoRow("DATE ET HEURE", dateDisplay)}
    ${infoRow("DUR\u00c9E DE L\u2019INSPECTION", duration)}
    ${infoRow("INSPECTEUR", inspector + (company ? ` \u2014 ${company}` : ""))}
    ${infoRow("INTERVENANTS SUR PLACE", intervenants)}
  </table>

  <h3>PROPRI\u00c9T\u00c9 INSPECT\u00c9E</h3>
  <table style="margin-bottom:18px;">
    ${infoRow("Adresse", address)}
    ${infoRow("Type de propri\u00e9t\u00e9", typeProp)}
    ${infoRow("Ann\u00e9e de construction", yearBuilt)}
    ${infoRow("Province", province)}
  </table>

  ${
    summary
      ? `<h3>DESCRIPTION SOMMAIRE DU B\u00c2TIMENT</h3>
         <p style="font-size:10.5pt;line-height:1.6;">${esc(summary)}</p>`
      : ""
  }

  ${
    condition
      ? `<h3>CONDITION G\u00c9N\u00c9RALE DU B\u00c2TIMENT</h3>
         <p style="font-size:10.5pt;line-height:1.6;">${esc(condition)}</p>`
      : ""
  }

  <p style="margin-top:14px;font-size:10.5pt;"><strong>ORIENTATION DE LA FA\u00c7ADE&nbsp;:</strong> ${esc(orientation)}</p>
</div>


<!-- ════════════════════════════════════════════════════════════
     PAGE 3 — DÉCLARATION DU PROPRIÉTAIRE
     ════════════════════════════════════════════════════════════ -->
<div style="page-break-after:always;">
  <h2>D\u00c9CLARATION DU PROPRI\u00c9TAIRE</h2>
  <p style="font-size:10.5pt;line-height:1.7;">${esc(declText)}</p>

  ${
    data.condition_generale
      ? `<h3>COMMENTAIRES RELATIFS \u00c0 LA D\u00c9CLARATION</h3>
         <p style="font-size:10.5pt;line-height:1.6;">${esc(data.condition_generale)}</p>`
      : ""
  }
</div>


<!-- ════════════════════════════════════════════════════════════
     PAGE 4 — AVIS IMPORTANT
     ════════════════════════════════════════════════════════════ -->
<div style="page-break-after:always;">
  <h2>AVIS IMPORTANT</h2>
  <p style="font-size:10.5pt;line-height:1.8;font-weight:bold;text-transform:uppercase;">
    CERTAINS \u00c9L\u00c9MENTS DU B\u00c2TIMENT PEUVENT REQU\u00c9RIR UNE \u00c9VALUATION PAR UN OU DES SP\u00c9CIALISTES, NOTAMMENT&nbsp;: LES SYST\u00c8MES \u00c9LECTRIQUES, LA PLOMBERIE, LES STRUCTURES MAJEURES, LES SYST\u00c8MES DE CHAUFFAGE ET DE CLIMATISATION, LES FONDATIONS ET LES \u00c9L\u00c9MENTS ENVIRONNEMENTAUX (AMIANTE, MOISISSURES, RADON). L\u2019INSPECTEUR EN B\u00c2TIMENT N\u2019EST PAS UN ING\u00c9NIEUR, UN \u00c9LECTRICIEN, UN PLOMBIER OU UN EXPERT EN ENVIRONNEMENT. TOUTE ANOMALIE OU LIMITE SIGNAL\u00c9E DANS CE RAPPORT DEVRAIT \u00caRE \u00c9VALU\u00c9E PAR LE SP\u00c9CIALISTE CONCERN\u00c9 AVANT LA FINALISATION DE LA TRANSACTION.
  </p>
  <p style="font-size:10.5pt;line-height:1.8;font-weight:bold;text-transform:uppercase;margin-top:20px;">
    CE RAPPORT EST EXCLUSIVEMENT R\u00c9DIG\u00c9 \u00c0 L\u2019INTENTION DU CLIENT SIGN\u00c9. IL NE PEUT \u00caRE UTILIS\u00c9 \u00c0 D\u2019AUTRES FINS SANS LE CONSENTEMENT \u00c9CRIT DE L\u2019INSPECTEUR.
  </p>
</div>


<!-- ════════════════════════════════════════════════════════════
     PAGES 5+ — SECTIONS D'INSPECTION
     ════════════════════════════════════════════════════════════ -->
${sectionsHtml}


<!-- ════════════════════════════════════════════════════════════
     AVANT-DERNIÈRE PAGE — CONCLUSION + ATTESTATION
     ════════════════════════════════════════════════════════════ -->
<div style="page-break-before:always;">
  <h2>CONCLUSION</h2>
  <p style="font-size:10.5pt;line-height:1.7;">
    La pr\u00e9sente inspection du b\u00e2timent situ\u00e9 au <strong>${esc(address)}</strong>
    a \u00e9t\u00e9 effectu\u00e9e le ${esc(dateDisplay)} par ${esc(inspector)}${company ? `, ${esc(company)}` : ""}.
  </p>

  ${
    totalMajeur + totalModere + totalMineur > 0
      ? `<p style="font-size:10.5pt;line-height:1.7;">
          L\u2019inspection a r\u00e9v\u00e9l\u00e9&nbsp;:
          ${totalMajeur > 0 ? `<strong>${totalMajeur} probl\u00e9matique(s) majeure(s)</strong>` : ""}
          ${totalMajeur > 0 && totalModere > 0 ? ", " : ""}
          ${totalModere > 0 ? `<strong>${totalModere} probl\u00e9matique(s) mod\u00e9r\u00e9e(s)</strong>` : ""}
          ${(totalMajeur > 0 || totalModere > 0) && totalMineur > 0 ? " et " : ""}
          ${totalMineur > 0 ? `<strong>${totalMineur} probl\u00e9matique(s) mineure(s)</strong>` : ""}.
          Il est recommand\u00e9 de prendre les mesures n\u00e9cessaires \u00e0 la correction des anomalies identifi\u00e9es.
        </p>`
      : `<p style="font-size:10.5pt;line-height:1.7;">Aucune anomalie majeure n\u2019a \u00e9t\u00e9 d\u00e9tect\u00e9e lors de cette inspection. L\u2019entretien courant est recommand\u00e9.</p>`
  }

  <!-- Recommandations globales -->
  ${
    recs.length > 0
      ? `<h3>RECOMMANDATIONS</h3>${recsHtml}`
      : ""
  }

  <!-- Clauses légales -->
  ${
    legalHtml
      ? `<h3>CLAUSES L\u00c9GALES</h3>${legalHtml}`
      : ""
  }

  <!-- Attestation -->
  <h3>ATTESTATION</h3>
  <ul style="font-size:10.5pt;line-height:1.8;margin:0 0 0 20px;padding:0;">
    <li>Je soussign\u00e9(e) n\u2019ai aucun int\u00e9r\u00eat pr\u00e9sent ou futur dans la propri\u00e9t\u00e9 inspect\u00e9e.</li>
    <li>Mon rapport n\u2019a pas \u00e9t\u00e9 influenc\u00e9 par des parties autres que le client sign\u00e9.</li>
    <li>Je n\u2019ai omis, \u00e0 ma connaissance, aucune observation importante susceptible d\u2019affecter la d\u00e9cision d\u2019achat du client.</li>
  </ul>

  <!-- Signature -->
  <div style="margin-top:28px;display:flex;gap:40px;flex-wrap:wrap;">
    <div style="min-width:220px;">
      <p style="font-size:10.5pt;margin:0 0 4px 0;"><strong>Inspecteur&nbsp;:</strong> ${esc(inspector)}</p>
      ${company ? `<p style="font-size:10.5pt;margin:0 0 4px 0;"><strong>Entreprise&nbsp;:</strong> ${esc(company)}</p>` : ""}
      ${aibq ? `<p style="font-size:10.5pt;margin:0 0 4px 0;"><strong>Membre AIBQ&nbsp;:</strong> ${esc(aibq)}</p>` : ""}
      ${phone ? `<p style="font-size:10.5pt;margin:0 0 4px 0;"><strong>T\u00e9l.&nbsp;:</strong> ${esc(phone)}</p>` : ""}
      ${email ? `<p style="font-size:10.5pt;margin:0 0 4px 0;"><strong>Courriel&nbsp;:</strong> ${esc(email)}</p>` : ""}
      <p style="font-size:10.5pt;margin:0 0 4px 0;"><strong>Date&nbsp;:</strong> ${esc(dateDisplay)}</p>
    </div>
    <div style="flex:1;min-width:200px;">
      <p style="font-size:10.5pt;margin:0 0 50px 0;">Signature de l\u2019inspecteur&nbsp;:</p>
      <div style="border-bottom:1px solid #000;width:250px;margin-bottom:4px;"></div>
      <p style="font-size:9pt;color:#555;margin:0;">${esc(inspector)}</p>
    </div>
  </div>
</div>


<!-- ════════════════════════════════════════════════════════════
     DERNIÈRE PAGE — AVIS AU LECTEUR
     ════════════════════════════════════════════════════════════ -->
<div style="page-break-before:always;">
  <!-- Logo AIBQ / association -->
  <div style="text-align:center;margin-bottom:20px;">
    ${
      logo
        ? `<img src="${esc(logo)}" alt="Logo" style="max-width:150px;max-height:60px;object-fit:contain;"/>`
        : ""
    }
    ${aibq ? `<p style="font-size:10pt;margin:6px 0 0 0;font-weight:bold;">MEMBRE AIBQ \u2014 ${esc(aibq)}</p>` : ""}
  </div>

  <h2>AVIS AU LECTEUR</h2>

  <p style="font-size:10pt;line-height:1.8;">${esc(disclaimerText)}</p>

  <h3>NORMES ET PRATIQUE</h3>
  <p style="font-size:10pt;line-height:1.8;">
    Ce rapport d\u2019inspection a \u00e9t\u00e9 pr\u00e9par\u00e9 conform\u00e9ment \u00e0 la Norme de pratique de l\u2019AIBQ (Association des inspecteurs en b\u00e2timent du Qu\u00e9bec). L\u2019inspection constitue un examen visuel non destructif, non exhaustif du b\u00e2timent dans son \u00e9tat apparent au moment de la visite. Elle ne constitue pas une expertise d\u2019ing\u00e9nieur, une analyse environnementale, ni une garantie sur les syst\u00e8mes ou composants inspect\u00e9s.
  </p>

  <h3>LIMITES DE L\u2019INSPECTION VISUELLE</h3>
  <p style="font-size:10pt;line-height:1.8;">
    L\u2019inspecteur n\u2019est pas tenu d\u2019acc\u00e9der aux zones ou composants pr\u00e9sentant un risque pour sa s\u00e9curit\u00e9, d\u2019actionner des syst\u00e8mes hors service, de d\u00e9placer des meubles ou obstructions, d\u2019analyser les substances dangereuses (amiante, moisissures, UVAR, radon, etc.) ni de d\u00e9tecter les organismes nuisibles (insectes, rongeurs). Les vices cach\u00e9s, les d\u00e9fauts latents ou les conditions dissimul\u00e9es ne peuvent \u00eatre d\u00e9tect\u00e9s par une inspection visuelle.
  </p>

  <h3>EXCLUSIONS</h3>
  <p style="font-size:10pt;line-height:1.8;">
    Ce rapport n\u2019inclut pas&nbsp;: l\u2019esp\u00e9rance de vie des composants\u00a0; l\u2019\u00e9valuation des co\u00fbts de correction\u00a0; l\u2019\u00e9valuation de la valeur marchande\u00a0; les recommandations d\u2019achat ou de refus d\u2019achat\u00a0; les composants souterrains (fondations enterr\u00e9es, drain fran\u00e7ais, r\u00e9servoirs enfouis)\u00a0; les piscines, spas, saunas\u00a0; les syst\u00e8mes d\u2019alarme et de s\u00e9curit\u00e9\u00a0; la conformit\u00e9 aux codes du b\u00e2timent, r\u00e8glements municipaux ou autres lois. (AIBQ Art. 12)
  </p>

  <h3>CONFIDENTIALIT\u00c9</h3>
  <p style="font-size:10pt;line-height:1.8;">
    Ce rapport est confidentiel et destin\u00e9 au seul usage du client sign\u00e9&nbsp;: <strong>${esc(client)}</strong>. Il ne peut \u00eatre transmis \u00e0 un tiers sans le consentement \u00e9crit pr\u00e9alable de l\u2019inspecteur ou sur ordonnance du tribunal. (AIBQ Convention de service, Art. 9)
  </p>

  <!-- Pied de page avis -->
  <div style="margin-top:30px;border-top:1px solid #000;padding-top:10px;text-align:center;font-size:9pt;color:#444;">
    <p style="margin:0;">Rapport d\u2019inspection \u2014 Dossier #&nbsp;${esc(reportNumber)} \u2014 ${esc(dateDisplay)}</p>
    ${company ? `<p style="margin:2px 0 0 0;">${esc(company)} ${aibq ? `\u2014 Membre AIBQ ${esc(aibq)}` : ""}</p>` : ""}
  </div>
</div>

</body>
</html>`;
}

// ─── Route Handler ────────────────────────────────────────────────────────────
export async function POST(req: Request): Promise<Response> {
  // Parse body
  let data: InspectionData;
  try {
    data = (await req.json()) as InspectionData;
  } catch {
    return Response.json({ error: "JSON invalide" }, { status: 400 });
  }

  if (!data || typeof data !== "object") {
    return Response.json({ error: "inspectionData requis" }, { status: 400 });
  }

  const complianceCtx = buildSmartInspectionComplianceContext(data);
  const complianceResult = validateCompliance(complianceCtx);
  const complianceValidationV1 = buildComplianceValidationV1(complianceResult);

  try {
    const reportIdForAudit =
      typeof data.id === "string" && data.id.trim() ? data.id.trim() : `smart-${Date.now()}`;
    const supabase = await createServiceRoleClient();
    void recordInspectionEventSafe(supabase, {
      report_id: reportIdForAudit,
      event_type: "compliance_validated",
      actor_type: "system",
      metadata: {
        gate: complianceValidationV1.gate,
        ruleset_id: complianceValidationV1.ruleset_id,
        blocking_count: complianceValidationV1.blocking.length,
        warning_count: complianceValidationV1.warnings.length,
        content_hash: hashInspectionContent({
          gate: complianceValidationV1.gate,
          ruleset_id: complianceValidationV1.ruleset_id,
        }),
      },
    });
  } catch {
    /* audit non bloquant */
  }

  if (complianceResult.gate === "blocked") {
    const first =
      complianceResult.blocking[0]?.messageFr ??
      complianceResult.warnings[0]?.messageFr ??
      "Conformité non satisfaite.";
    return Response.json(
      {
        error: `Rapport non certifié — génération PDF bloquée. ${first}`,
        gate: complianceResult.gate,
        compliance_validation_v1: complianceValidationV1,
      },
      { status: 422 },
    );
  }

  const html = buildReportHtml(data);

  // Derive values for puppeteer header/footer templates
  const _client = data.requerants ?? data.client_nom ?? "";
  const _reportNumber = data.id ?? `INS-${Date.now()}`;
  const _logo = data.inspectorLogoUrl ?? "";
  const _company = data.inspectorCompany ?? "";

  // Launch Puppeteer
  let puppeteer: typeof import("puppeteer");
  try {
    puppeteer = await import("puppeteer");
  } catch {
    return Response.json(
      {
        error:
          "Puppeteer non disponible. Installez-le\u00a0: npm install puppeteer --save-dev",
      },
      { status: 500 }
    );
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
    timeout: 30_000,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 25_000 });

    // Header: rapport title + logo; Footer: requérant + dossier + page
    const headerLogoHtml = _logo
      ? `<img src="${esc(_logo)}" style="max-height:20px;max-width:80px;object-fit:contain;vertical-align:middle;" alt=""/>`
      : `<span style="font-weight:bold;">${esc(_company)}</span>`;

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `<div style="font-family:'Times New Roman',Times,serif;font-size:8px;color:#444;width:100%;padding:4px 20mm 2px 20mm;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #bbb;box-sizing:border-box;">
        <span>RAPPORT D&apos;INSPECTION PR\u00c9-ACHAT</span>
        <span>${headerLogoHtml}</span>
      </div>`,
      footerTemplate: `<div style="font-family:'Times New Roman',Times,serif;font-size:8px;color:#444;width:100%;padding:2px 20mm 4px 20mm;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #bbb;box-sizing:border-box;">
        <span>Rapport exclusif \u00e0 usage confidentiel pour\u00a0: ${esc(_client)} \u2014 Dossier #\u00a0${esc(_reportNumber)}</span>
        <span>Page <span class="pageNumber"></span></span>
      </div>`,
      margin: { top: "22mm", right: "20mm", bottom: "18mm", left: "20mm" },
    });

    const reportId = data.id ?? `rapport-${Date.now()}`;
    const safeAddr = (data.propriete_adresse ?? "rapport")
      .replace(/[^a-zA-Z0-9\-_\u00e0\u00e2\u00e9\u00e8\u00ea\u00eb\u00ee\u00ef\u00f4\u00f9\u00fb\u00fc\u00e7]/gi, "_")
      .slice(0, 60);

    const body = Uint8Array.from(pdfBuffer);

    try {
      const supabase = await createServiceRoleClient();
      void recordInspectionEventSafe(supabase, {
        report_id: reportId,
        event_type: "pdf_generated",
        actor_type: "system",
        metadata: {
          content_hash: hashInspectionContent({ reportId, bytes: body.byteLength }),
        },
      });
    } catch {
      /* audit non bloquant */
    }

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="inspection-${esc(reportId)}-${safeAddr}.pdf"`,
        "Cache-Control": "no-store",
        [COMPLIANCE_VALIDATION_RESPONSE_HEADER]: JSON.stringify(complianceValidationV1),
      },
    });
  } finally {
    await browser.close();
  }
}
