/**
 * Phase 8V.2 — Rendu hiérarchique Système → Composantes pour le template rapport.
 */

import { readSteveFindingsFromPayload } from "@/lib/findingSchema";
import {
  orderedInspectionSystems,
  readInspectionKnowledgeBaseFromPayload,
} from "@/lib/inspectionStandardClauses";
import type { InspectionComponentKnowledge } from "@/lib/inspectionStandardClauses/types";
import {
  INSPECTOR_REPORT_STYLE_V1_KEY,
  normalizeInspectorReportStyleV1,
} from "@/lib/inspectorReportStyle";
import {
  groupPhotosByComponent,
  type PhotoPlacementInput,
} from "@/lib/reportPhotoPlacement";
import {
  buildReportComponentBlock,
  renderReportComponentBlockHtml,
  type ReportComponentBlockV1,
} from "@/lib/reportKnowledgeWriter";
import { toWriterLanguage, type ReportLocale } from "@/lib/reportLocale";
import { readStevePhotoContextsFromPayload } from "@/lib/stevePhotoContext";

const INSPECTION_INVENTORY_V1_KEY = "inspection_inventory_v1";

function readInventoryValuesFromPayload(
  payload: Record<string, unknown>,
  componentId: string,
): Record<string, string> | undefined {
  const raw = payload[INSPECTION_INVENTORY_V1_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const byComponent = (raw as Record<string, unknown>)[componentId];
  if (!byComponent || typeof byComponent !== "object" || Array.isArray(byComponent)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(byComponent as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function findFindingForComponent(
  payload: Record<string, unknown>,
  component: InspectionComponentKnowledge,
): ReturnType<typeof readSteveFindingsFromPayload>[number] | undefined {
  const findings = readSteveFindingsFromPayload(payload);
  return findings.find(
    (f) =>
      f.component_id === component.id ||
      (component.steve_component_id != null && f.component_id === component.steve_component_id),
  );
}

export function collectPhotoPlacementsFromPayload(
  payload: Record<string, unknown>,
): PhotoPlacementInput[] {
  const contexts = readStevePhotoContextsFromPayload(payload);
  return contexts.map((c) => ({
    photo_id: c.photo_id,
    system_hint: c.inspection_section,
    component_hint: c.component_id ?? c.component,
    defect_candidate: c.defect_candidate,
  }));
}

export function buildSystemComponentBlocks(
  payload: Record<string, unknown>,
  systemId: string,
  locale: ReportLocale,
): ReportComponentBlockV1[] {
  const kb = readInspectionKnowledgeBaseFromPayload(payload);
  const system = kb.systems.find((s) => s.id === systemId);
  if (!system) return [];

  const lang = toWriterLanguage(locale);
  const style = normalizeInspectorReportStyleV1(payload[INSPECTOR_REPORT_STYLE_V1_KEY]);
  const photoMap = groupPhotosByComponent(collectPhotoPlacementsFromPayload(payload));

  return system.components.map((component) =>
    buildReportComponentBlock({
      system_id: system.id,
      system_title: system.title,
      component,
      finding: findFindingForComponent(payload, component),
      photos: photoMap.get(component.id) ?? [],
      inventory_values: readInventoryValuesFromPayload(payload, component.id),
      inspector_style: style,
      language: lang,
    }),
  );
}

export function buildHierarchicalReportHtml(
  payload: Record<string, unknown>,
  locale: ReportLocale,
): string {
  const kb = readInspectionKnowledgeBaseFromPayload(payload);
  const lang = toWriterLanguage(locale);
  const systems = [...kb.systems].sort((a, b) => a.order - b.order);
  const parts: string[] = [];

  for (const system of systems) {
    const blocks = buildSystemComponentBlocks(payload, system.id, locale);
    if (blocks.length === 0) continue;

    parts.push(
      `<section class="pro-kb-system pro-break" data-system-id="${system.id}">`,
      `<h3 style="margin:1em 0 0.5em;font-size:16px;font-weight:800;letter-spacing:0.02em">${system.title}</h3>`,
    );

    for (const block of blocks) {
      parts.push(renderReportComponentBlockHtml(block, lang));
    }

    parts.push("</section>");
  }

  return parts.join("");
}

export function buildElectriciteReportHtml(
  payload: Record<string, unknown>,
  locale: ReportLocale,
): string {
  const blocks = buildSystemComponentBlocks(payload, "electricite", locale);
  const lang = toWriterLanguage(locale);
  return (
    `<section class="pro-kb-system" data-system-id="electricite">` +
    `<h3 style="margin:0 0 0.5em;font-size:16px;font-weight:800">ÉLECTRICITÉ</h3>` +
    blocks.map((b) => renderReportComponentBlockHtml(b, lang)).join("") +
    `</section>`
  );
}

export function knowledgeBaseComponentOrder(systemId: string): string[] {
  const system = orderedInspectionSystems().find((s) => s.id === systemId);
  return system?.components.map((c) => c.id) ?? [];
}
