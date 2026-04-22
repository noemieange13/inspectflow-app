/**
 * Orchestration terrain-first : une seule fonction relie DV → météo → photos → notes → sections.
 * Les étapes appellent les modules déjà présents (Edge / routes Next).
 */

import { extractSellerDeclarationCoverFromImage } from "@/lib/extractSellerDeclarationCoverAi";
import { fetchWeatherOpenMeteo } from "@/lib/weatherOpenMeteo";
import { buildStructuredReport } from "@/lib/reportNarrative";
import type { ReportEntryInput } from "@/lib/reportNarrative";
import { buildPremiumViewModelFromPayload } from "@/lib/premiumReportViewModel";

export type FullTerrainPipelineInput = {
  /** Image DV en base64 (sans préfixe data:) + mime */
  dvImage?: { base64: string; mimeType: string };
  /** Position pour météo Open-Meteo */
  geo?: { latitude: number; longitude: number };
  /** Entrées terrain (constats) pour narrative structurée */
  entries?: ReportEntryInput[];
  /** Notes texte brutes (fusion métier côté `/api/process-notes` si besoin) */
  notesText?: string;
  /** Payload rapport courant (sections, cover, entries) pour vue premium + clauses */
  reportPayload?: Record<string, unknown> | null;
  /** Sections normalisées (Zero Draft) */
  sectionsRaw?: unknown[];
  /** Clauses légales déjà résolues (après filtre contexte) */
  legalClauseRows?: import("@/lib/qcLegalClauses").QcLegalClauseRow[] | null;
};

export type FullTerrainPipelineResult = {
  dv: Awaited<ReturnType<typeof extractSellerDeclarationCoverFromImage>> | null;
  weather: Awaited<ReturnType<typeof fetchWeatherOpenMeteo>> | null;
  structured: ReturnType<typeof buildStructuredReport> | null;
  notesEcho: string | null;
  viewModel: ReturnType<typeof buildPremiumViewModelFromPayload> | null;
};

/**
 * Pipeline de synthèse (aucun effet de bord réseau vers Supabase sauf si vous étendez l’appel).
 */
export async function fullTerrainPipeline(
  input: FullTerrainPipelineInput,
): Promise<FullTerrainPipelineResult> {
  let dv: FullTerrainPipelineResult["dv"] = null;
  if (input.dvImage?.base64 && input.dvImage.mimeType) {
    let b64 = input.dvImage.base64.trim();
    if (b64.includes(",")) b64 = b64.split(",").pop() ?? b64;
    dv = await extractSellerDeclarationCoverFromImage({
      imageBase64: b64,
      mimeType: input.dvImage.mimeType,
    });
  }

  let weather: FullTerrainPipelineResult["weather"] = null;
  if (
    input.geo &&
    Number.isFinite(input.geo.latitude) &&
    Number.isFinite(input.geo.longitude)
  ) {
    try {
      weather = await fetchWeatherOpenMeteo(
        input.geo.latitude,
        input.geo.longitude,
      );
    } catch {
      weather = null;
    }
  }

  let structured: FullTerrainPipelineResult["structured"] = null;
  if (input.entries && input.entries.length > 0) {
    structured = buildStructuredReport(input.entries);
  }

  const notesEcho = input.notesText?.trim() ? input.notesText.trim() : null;

  let viewModel: FullTerrainPipelineResult["viewModel"] = null;
  const payload = input.reportPayload;
  const sections = input.sectionsRaw ?? payload?.sections;
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray(sections) &&
    sections.length > 0
  ) {
    viewModel = buildPremiumViewModelFromPayload(
      payload,
      sections,
      input.legalClauseRows ?? null,
    );
  }

  return {
    dv,
    weather,
    structured,
    notesEcho,
    viewModel,
  };
}
