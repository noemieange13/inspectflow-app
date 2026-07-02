import { hasReportProfessionalSnapshot } from "@/lib/inspectorProfile";
import { resolvePayloadReportLocale } from "@/lib/reportLanguage";
import type { ReportLocale } from "@/lib/reportLocale";
import { toWriterLanguage } from "@/lib/reportLocale";
import {
  brandingFromPayload,
  coverFieldsFromPayload,
} from "@/lib/report_template_engine/branding";
import {
  buildExecutiveSummary,
  buildPriorityFindings,
  buildSectionBlocks,
  parseEntriesAlignedWithSections,
} from "@/lib/report_template_engine/sections";
import {
  pickFacadePhotoUrl,
  resolvePhotoLayout,
} from "@/lib/report_template_engine/photoLayout";
import { professionalTemplateLocale } from "@/lib/report_template_engine/locales";
import {
  buildLegalClausesHtml,
  buildLimitationsHtml,
  renderProfessionalReportHtml,
  type RenderProfessionalOptions,
} from "@/lib/report_template_engine/render";
import type {
  BuildProfessionalTemplateOptions,
  CoverData,
  ProfessionalReportTemplate,
  SectionRowInput,
} from "@/lib/report_template_engine/types";
import { readInspectionWeatherFromPayload } from "@/lib/weather/inspectionWeather";
import { formatWeatherSummary } from "@/lib/weather/weatherLabels";
import { readBuildingProfileFromPayload } from "@/lib/buildingProfile";
import { parseCoverV1FromUnknown } from "@/lib/inspectionCoverPayload";
import { readReportPropertySnapshotFromPayload } from "@/lib/reportPropertySnapshot";
import { buildHierarchicalReportHtml } from "@/lib/reportKnowledgeRenderer";
import { buildSteveFindingsHtmlFromPayload } from "@/lib/steveReportPresentation";
import {
  buildLegalFrontMatterContextFromPayload,
  buildLegalFrontMatterHtml,
} from "@/lib/report_legal_sections_engine";
import {
  readCarbonMonoxideContextFromPayload,
  readSellerDisclosureV1FromPayload,
} from "@/lib/report_template_engine/sellerDisclosureSection";
import { buildCarbonMonoxideComments } from "@/lib/report_template_engine/sellerDisclosureSection";
import { parseObservationPhotoUrlsFromPayload } from "@/lib/reportObservationPhotos";
import { buildReaderNoticeHtml } from "@/lib/legalClauses/renderReaderNotice";
import { buildReportConclusionHtml } from "@/lib/reportConclusionEngine";
import {
  buildInspectorAttestationHtml,
  resolveCertificationEntriesForPayload,
} from "@/lib/inspectorAttestation";

export type { ProfessionalReportTemplate, BuildProfessionalTemplateOptions };
export { renderProfessionalReportHtml } from "@/lib/report_template_engine/render";
export {
  dedupeAnnexPhotoUrls,
  inspectorPrimaryPreserved,
  readIncludeFullPhotoBank,
  resolvePhotoLayout,
} from "@/lib/report_template_engine/photoLayout";
export {
  buildExecutiveSummary,
  buildPriorityFindings,
  buildSectionBlocks,
  isPriorityEntry,
} from "@/lib/report_template_engine/sections";
export { PROFESSIONAL_SECTION_ORDER } from "@/lib/report_template_engine/constants";

function normalizeSections(raw: unknown[]): SectionRowInput[] {
  return raw.filter((x) => x && typeof x === "object") as SectionRowInput[];
}

/**
 * Build read-only professional template model from payload (Phase 8L).
 * Never mutates source payload.
 */
export function buildProfessionalReportTemplate(
  payload: Record<string, unknown>,
  options?: BuildProfessionalTemplateOptions,
): ProfessionalReportTemplate | null {
  const useProfessional =
    options?.useProfessionalTemplate ?? hasReportProfessionalSnapshot(payload);
  if (!useProfessional) return null;

  const sections = normalizeSections(
    Array.isArray(payload.sections) ? payload.sections : [],
  );
  if (sections.length === 0) return null;

  const locale =
    options?.locale ??
    resolvePayloadReportLocale(payload);
  const lang = toWriterLanguage(locale);
  const branding = brandingFromPayload(payload);
  if (!branding) return null;

  const fields = coverFieldsFromPayload(payload, branding);
  const photoLayout = resolvePhotoLayout(payload, locale);
  const urlsByObs = parseObservationPhotoUrlsFromPayload(payload);
  const entries = parseEntriesAlignedWithSections(payload, sections);

  const weather = readInspectionWeatherFromPayload(payload);
  const weatherSummary = weather
    ? formatWeatherSummary(weather, lang)
    : fields.cover?.conditions_meteo?.trim() || null;

  const L = professionalTemplateLocale(locale);
  const cover: CoverData = {
    title: L.reportTitle,
    companyName: branding.companyName,
    logoUrl: branding.logoUrl,
    facadePhotoUrl: pickFacadePhotoUrl(payload, photoLayout),
    address: fields.address,
    clientName: fields.clientName,
    inspectionDate: fields.inspectionDate,
    inspectorName: fields.inspectorName,
    certification: fields.certification,
    signatureUrl: branding.signatureUrl,
    weatherSummary,
  };

  const executiveSummary = buildExecutiveSummary(entries, locale);
  const priorityFindings = buildPriorityFindings(
    sections,
    entries,
    photoLayout.primaryByObservationId,
    locale,
  );
  const sectionBlocks = buildSectionBlocks(
    sections,
    entries,
    urlsByObs,
    locale,
  );

  const limitationsHtml = buildLimitationsHtml(payload, locale);
  const legalClausesHtml = buildLegalClausesHtml(payload, locale);

  const signatureHtml = branding.signatureUrl
    ? `<img src="${branding.signatureUrl}" alt="" class="pro-sign"/>`
    : "";

  const propertySnapshot = readReportPropertySnapshotFromPayload(payload);
  const buildingProfile = readBuildingProfileFromPayload(payload);
  const sellerDisclosure = readSellerDisclosureV1FromPayload(payload);
  const carbonMonoxideContext = readCarbonMonoxideContextFromPayload(payload);
  const coverPayload = parseCoverV1FromUnknown(payload.cover_v1);
  const facadeDirection =
    buildingProfile?.orientation.facade_direction ||
    coverPayload?.orientation_facade ||
    null;
  const facadePhotoUrl = pickFacadePhotoUrl(payload, photoLayout);
  const legalFrontMatterHtml = buildLegalFrontMatterHtml(
    payload,
    locale,
    buildLegalFrontMatterContextFromPayload(payload, {
      facadePhotoUrl,
      carbonMonoxideRecommendation: buildCarbonMonoxideComments(carbonMonoxideContext),
    }),
  );
  const steveFindingsHtml =
    buildHierarchicalReportHtml(payload, locale) ||
    buildSteveFindingsHtmlFromPayload(payload, locale);

  const readerNoticeHtml = buildReaderNoticeHtml(locale);
  const conclusionHtml = buildReportConclusionHtml(payload, locale);
  const attestationHtml = buildInspectorAttestationHtml({
    locale,
    branding,
    cover,
    certificationEntries: resolveCertificationEntriesForPayload(payload, branding),
  });

  return {
    locale,
    branding,
    cover,
    executiveSummary,
    priorityFindings,
    sections: sectionBlocks,
    photoLayout,
    limitationsHtml,
    legalClausesHtml,
    propertySnapshot,
    buildingProfile,
    sellerDisclosure,
    facadeDirection: facadeDirection ? String(facadeDirection) : null,
    carbonMonoxideContext,
    legalFrontMatterHtml,
    steveFindingsHtml,
    readerNoticeHtml,
    conclusionHtml,
    attestationHtml,
    signatureHtml,
  };
}

export function buildProfessionalHtmlFromPayload(
  payload: Record<string, unknown>,
  opts?: RenderProfessionalOptions & {
    locale?: ReportLocale;
    useProfessionalTemplate?: boolean;
    legalClauseRows?: RenderProfessionalOptions["legalClauseRows"];
  },
): string | null {
  const locale = opts?.locale ?? resolvePayloadReportLocale(payload);
  const template = buildProfessionalReportTemplate(payload, {
    locale,
    useProfessionalTemplate: opts?.useProfessionalTemplate,
  });
  if (!template) return null;

  if (opts?.legalClauseRows?.length) {
    template.legalClausesHtml = buildLegalClausesHtml(
      payload,
      locale,
      opts.legalClauseRows,
    );
  }

  return renderProfessionalReportHtml(template, locale);
}
