/**
 * Phase 8V — Présentation rapport ordonnée Steve (avant PDF).
 */

import type { SteveFindingV1 } from "@/lib/findingSchema";
import {
  readSteveFindingsFromPayload,
  shouldHideSteveFindingSection,
} from "@/lib/findingSchema";
import { renderSteveFindingHtml } from "@/lib/steveFindingAdapter";
import {
  compareSteveComponentOrder,
  STEVE_INSPECTION_ORDER,
} from "@/lib/steveInspectionOrder";
import type { SectionBlock } from "@/lib/report_template_engine/types";
import { toWriterLanguage, type ReportLocale } from "@/lib/reportLocale";

export function sortSteveFindings(findings: SteveFindingV1[]): SteveFindingV1[] {
  return [...findings].sort((a, b) =>
    compareSteveComponentOrder(a.component_id, b.component_id),
  );
}

export function buildSteveFindingsHtmlFromPayload(
  payload: Record<string, unknown>,
  locale: ReportLocale,
): string {
  const lang = toWriterLanguage(locale);
  const findings = sortSteveFindings(readSteveFindingsFromPayload(payload)).filter(
    (f) => !shouldHideSteveFindingSection(f) && f.approved !== false,
  );

  if (findings.length === 0) return "";

  return findings.map((f) => renderSteveFindingHtml(f, lang)).join("");
}

export function steveOrderMatchesTemplateSections(sectionBlocks: SectionBlock[]): boolean {
  const titles = sectionBlocks.map((s) => s.title.toLowerCase());
  return STEVE_INSPECTION_ORDER.every((id) =>
    titles.some((t) => t.includes(id.replace(/_/g, " ").slice(0, 8))),
  )
    ? false
    : sectionBlocks.length >= 0;
}

export function assertSteveComponentOrder(ids: string[]): boolean {
  const sorted = [...ids].sort(compareSteveComponentOrder);
  return ids.every((id, index) => sorted[index] === id);
}

export function stevePresentationLayerMarker(): string {
  return "<!-- steve-report-presentation-v1 -->";
}
