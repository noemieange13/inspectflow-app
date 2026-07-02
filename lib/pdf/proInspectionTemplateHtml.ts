/**
 * Gabarit HTML « pro » (mise en page marché) pour prévisualisation locale Puppeteer.
 * Le flux production documenté reste Edge `reports-pdf` + `buildHtmlFromReportPayload` / QC 2027.
 */

import { escapeHtml } from "@/lib/buildInspectionReportHtml";
import {
  INSPECTOR_PROFILE_PAYLOAD_KEY,
  parseCoverV1FromUnknown,
  parseInspectorProfileFromUnknown,
} from "@/lib/inspectionCoverPayload";

const PRO_PRINT_CSS =
  ":root{--ink:#0f172a;--muted:#64748b;--border:#e2e8f0;--accent:#1d4ed8}" +
  "*{box-sizing:border-box}" +
  "body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;margin:0;padding:40px 48px;color:var(--ink);font-size:14px;line-height:1.5}" +
  "h1{font-size:26px;font-weight:700;margin:0 0 8px}" +
  "h2{font-size:17px;font-weight:600;margin:0 0 12px;padding-bottom:6px;border-bottom:2px solid var(--accent)}" +
  ".section{margin-bottom:28px;page-break-inside:avoid}" +
  ".cover{text-align:center;margin:80px 0 48px;padding:32px;border:1px solid var(--border);border-radius:12px;background:#fafafa}" +
  ".logo{max-width:160px;max-height:80px;object-fit:contain;margin-bottom:16px}" +
  ".subtitle{color:var(--muted);font-size:15px;margin:4px 0}" +
  ".grid{display:flex;gap:24px;flex-wrap:wrap}" +
  ".box{flex:1;min-width:220px}" +
  ".photo{width:100%;max-height:320px;object-fit:contain;margin-top:10px;border:1px solid var(--border);border-radius:8px;background:#f8fafc}" +
  ".muted{color:var(--muted);font-size:13px}";

function pickSummaryFromCover(
  cover: NonNullable<ReturnType<typeof parseCoverV1FromUnknown>>,
): string {
  const g = cover.generated_description_text?.trim();
  if (g) return g;
  const d = cover.description_sommaire;
  const parts = [
    d.type_maison,
    d.construit_en,
    d.facade,
    d.cotes,
    d.arriere,
    d.toiture,
    d.type_fondation,
    d.type_structure,
    d.chauffage,
  ].filter((x) => typeof x === "string" && x.trim().length > 0);
  return parts.join(" — ");
}

function sectionPhotos(sec: Record<string, unknown>): string[] {
  const raw = sec.photos ?? sec.images;
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string" && /^https?:\/\//i.test(item.trim())) {
      out.push(item.trim());
      continue;
    }
    if (item && typeof item === "object") {
      const u = (item as { url?: unknown }).url;
      if (typeof u === "string" && /^https?:\/\//i.test(u.trim())) out.push(u.trim());
    }
  }
  return out;
}

function sectionBody(sec: Record<string, unknown>): string {
  const title = typeof sec.title === "string" ? sec.title.trim() : "";
  const obs = typeof sec.observation === "string" ? sec.observation.trim() : "";
  const ana = typeof sec.analysis === "string" ? sec.analysis.trim() : "";
  const rec = typeof sec.recommendation === "string" ? sec.recommendation.trim() : "";
  const parts = [obs && `Observation : ${obs}`, ana && `Analyse : ${ana}`, rec && `Recommandation : ${rec}`]
    .filter(Boolean) as string[];
  const body = parts.join("\n\n");
  return title ? `${title}\n\n${body}`.trim() : body;
}

/**
 * HTML prêt pour `page.setContent` / impression — à partir de `reports.payload` (même source que le PDF Edge).
 */
export function buildProInspectionHtmlFromPayload(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  if (!payload || typeof payload !== "object") return null;

  const cover = parseCoverV1FromUnknown(payload.cover_v1);
  const profile = parseInspectorProfileFromUnknown(
    payload[INSPECTOR_PROFILE_PAYLOAD_KEY],
  );

  const logoUrl =
    profile?.logo_data_url?.trim() ||
    "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><text x="10" y="28" font-family="Arial" font-size="18" fill="#64748b">InspectFlow</text></svg>',
      );

  const inspectorName = cover?.inspecteur_nom?.trim() ||
    profile?.nom?.trim() ||
    "—";
  const license = cover?.inspecteur_numero_certification?.trim() ||
    profile?.numero_certification?.trim() ||
    "—";
  const companyLine = cover?.compagnie?.trim() || profile?.compagnie?.trim() || "";

  const address = cover?.propriete?.adresse?.trim() || "—";
  const clientName = cover?.propriete?.client_nom?.trim() || "—";
  const clientPhone = cover?.propriete?.client_telephone?.trim() || "—";
  const clientEmail = cover?.propriete?.client_courriel?.trim() || "—";

  const date = cover?.date_heure_affichage?.trim() || "—";
  const weather = cover?.conditions_meteo?.trim() || "—";
  const duration = cover?.duree_inspection?.trim() || "—";
  const requerants = cover?.requerants?.trim() || "—";

  const buildingSummary = (() => {
    if (cover) {
      const fromCover = pickSummaryFromCover(cover);
      if (fromCover.trim()) return fromCover.trim();
    }
    const summary = typeof payload.summary === "string" ? payload.summary.trim() : "";
    if (summary) return summary;
    const cs = typeof payload.client_section === "string" ? payload.client_section.trim() : "";
    return cs || "—";
  })();

  const globalCondition = cover?.condition_generale?.trim() ||
    (typeof payload.global_condition === "string" ? payload.global_condition.trim() : "") ||
    "—";

  const compliance = payload.compliance && typeof payload.compliance === "object"
    ? (payload.compliance as Record<string, unknown>)
    : null;
  const legalNotice = compliance && typeof compliance.legal_notice === "string"
    ? compliance.legal_notice.trim()
    : "";
  const legalClauses = [cover?.notes_conformite?.trim(), legalNotice]
    .filter((x): x is string => !!x && x.length > 0)
    .join("\n\n") || "—";

  const sectionsRaw = Array.isArray(payload.sections) ? payload.sections : [];
  const systemBlocks: string[] = [];
  for (const sec of sectionsRaw) {
    if (!sec || typeof sec !== "object") continue;
    const rec = sec as Record<string, unknown>;
    const name = typeof rec.title === "string" ? rec.title.trim() : "Section";
    const description = sectionBody(rec);
    const photos = sectionPhotos(rec);
    const imgs = photos
      .map((url) => `<img src="${escapeHtml(url)}" class="photo" alt=""/>`)
      .join("\n");
    systemBlocks.push(
      `<div class="section"><h2>${escapeHtml(name)}</h2>` +
        (description
          ? `<p>${escapeHtml(description).replace(/\n\n/g, "</p><p>")}</p>`
          : "") +
        imgs +
        `</div>`,
    );
  }

  const parts: string[] = [];
  parts.push(
    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>Rapport d'inspection</title>`,
  );
  parts.push(`<style>${PRO_PRINT_CSS}</style></head><body>`);

  parts.push(`<div class="cover">`);
  parts.push(`<img src="${escapeHtml(logoUrl)}" class="logo" alt=""/>`);
  parts.push(`<h1>Rapport d'inspection</h1>`);
  parts.push(`<p class="subtitle">${escapeHtml(inspectorName)}</p>`);
  parts.push(`<p class="subtitle"># ${escapeHtml(license)}</p>`);
  if (companyLine) {
    parts.push(`<p class="muted">${escapeHtml(companyLine)}</p>`);
  }
  parts.push(`</div>`);

  parts.push(`<div class="section"><h2>Informations générales</h2><div class="grid">`);
  parts.push(`<div class="box">`);
  parts.push(`<strong>Propriété :</strong> ${escapeHtml(address)}<br/>`);
  parts.push(`<strong>Client :</strong> ${escapeHtml(clientName)}<br/>`);
  parts.push(`<strong>Téléphone :</strong> ${escapeHtml(clientPhone)}<br/>`);
  parts.push(`<strong>Courriel :</strong> ${escapeHtml(clientEmail)}<br/>`);
  parts.push(`</div><div class="box">`);
  parts.push(`<strong>Date :</strong> ${escapeHtml(date)}<br/>`);
  parts.push(`<strong>Météo :</strong> ${escapeHtml(weather)}<br/>`);
  parts.push(`<strong>Durée :</strong> ${escapeHtml(duration)}<br/>`);
  parts.push(`<strong>Requérant(s) :</strong> ${escapeHtml(requerants)}<br/>`);
  parts.push(`</div></div></div>`);

  parts.push(
    `<div class="section"><h2>Sommaire du bâtiment</h2><p>${escapeHtml(buildingSummary).replace(/\n\n/g, "</p><p>")}</p></div>`,
  );

  parts.push(systemBlocks.join("\n"));

  parts.push(
    `<div class="section"><h2>Condition générale</h2><p>${escapeHtml(globalCondition)}</p></div>`,
  );
  parts.push(
    `<div class="section"><h2>Clauses réglementaires</h2><p>${escapeHtml(legalClauses).replace(/\n\n/g, "</p><p>")}</p></div>`,
  );

  parts.push(`</body></html>`);
  return parts.join("");
}
