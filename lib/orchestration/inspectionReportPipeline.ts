/**
 * Orchestration métier : chaîne inspecteur → contenu rapport → PDF Edge.
 * Les étapes réelles sont réparties entre composants (couverture, Zero Draft, APIs) et
 * `ensureReportPayloadHtml` + `invokeReportsPdf` pour le PDF.
 */

import { extractSellerDeclarationCoverFromImage } from "@/lib/extractSellerDeclarationCoverAi";
import { fetchWeatherOpenMeteo } from "@/lib/weatherOpenMeteo";
import { buildStructuredReport } from "@/lib/reportNarrative";
import type { ReportEntryInput } from "@/lib/reportNarrative";
import { ensureReportPayloadHtml } from "@/lib/ensureReportPayloadHtml";
import { invokeReportsPdf } from "@/lib/triggerInspectionUltimate";

export type InspectionReportPipelineInput = {
  /** Image DV (base64 sans préfixe data: ou avec) + mime */
  dv?: { imageBase64: string; mimeType: string };
  /** Coordonnées pour météo Open-Meteo */
  location?: { latitude: number; longitude: number };
  /** Entrées terrain → narrative structurée */
  entries?: ReportEntryInput[];
  /** Notes brutes (texte) — fusion côté produit via `/api/process-notes` si besoin */
  notes?: string;
  /** Identifiant rapport existant pour finaliser PDF */
  reportId?: string;
};

export type InspectionReportPipelineResult = {
  dvExtract: Awaited<ReturnType<typeof extractSellerDeclarationCoverFromImage>> | null;
  weather: Awaited<ReturnType<typeof fetchWeatherOpenMeteo>> | null;
  structured: ReturnType<typeof buildStructuredReport> | null;
  notesEcho: string | null;
  pdfInvoke: { ok: boolean; status?: number; detail?: string } | null;
};

/**
 * Orchestrateur central : DV → météo → narrative → (optionnel) HTML + Edge PDF.
 * Pas d’effet de bord sauf si `finalizePdf` et `reportId` sont fournis.
 */
export async function generateInspectionReport(
  input: InspectionReportPipelineInput,
  opts?: { finalizePdf?: boolean },
): Promise<InspectionReportPipelineResult> {
  const finalizePdf = opts?.finalizePdf === true && !!input.reportId?.trim();

  let dvExtract: InspectionReportPipelineResult["dvExtract"] = null;
  if (input.dv?.imageBase64 && input.dv.mimeType) {
    let b64 = input.dv.imageBase64.trim();
    if (b64.includes(",")) b64 = b64.split(",").pop() ?? b64;
    dvExtract = await extractSellerDeclarationCoverFromImage({
      imageBase64: b64,
      mimeType: input.dv.mimeType,
    });
  }

  let weather: InspectionReportPipelineResult["weather"] = null;
  if (
    input.location &&
    Number.isFinite(input.location.latitude) &&
    Number.isFinite(input.location.longitude)
  ) {
    try {
      weather = await fetchWeatherOpenMeteo(
        input.location.latitude,
        input.location.longitude,
      );
    } catch {
      weather = null;
    }
  }

  let structured: InspectionReportPipelineResult["structured"] = null;
  if (input.entries && input.entries.length > 0) {
    structured = buildStructuredReport(input.entries);
  }

  const notesEcho = input.notes?.trim() ? input.notes.trim() : null;

  let pdfInvoke: InspectionReportPipelineResult["pdfInvoke"] = null;
  if (finalizePdf && input.reportId) {
    const ensured = await ensureReportPayloadHtml(input.reportId);
    if (!ensured.ok) {
      pdfInvoke = { ok: false, detail: ensured.error };
    } else {
      const res = await invokeReportsPdf(input.reportId, {
        htmlForPdf: ensured.builtHtml,
      });
      const text = await res.text();
      pdfInvoke = {
        ok: res.ok,
        status: res.status,
        detail: text.slice(0, 500),
      };
    }
  }

  return {
    dvExtract,
    weather,
    structured,
    notesEcho,
    pdfInvoke,
  };
}
