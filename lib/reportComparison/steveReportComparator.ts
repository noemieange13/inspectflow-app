/**
 * Phase 8W — Comparateur rapport Steve legacy vs InspectFlow (read-only).
 */

import type { InspectionReportParseResult } from "@/lib/document_parsers/inspectionReportParser";
import { parseInspectionReportText } from "@/lib/document_parsers/inspectionReportParser";
import {
  INSPECTION_KNOWLEDGE_SYSTEMS,
  orderedInspectionSystems,
} from "@/lib/inspectionKnowledgeBase";
import {
  ATTESTATION_CLAUSES_FR,
  READER_NOTICE_CLAUSES_FR,
} from "@/lib/legalClauses/qc";
import { groupPhotosByComponent } from "@/lib/reportPhotoPlacement";
import { buildSystemComponentBlocks } from "@/lib/reportKnowledgeRenderer";
import {
  compareReportToSteveTemplate,
  STEVE_FORMAT_MATCH_THRESHOLD,
} from "@/lib/report_format_matcher";
import { ORIENTATION_READING_SECTION_TITLE } from "@/lib/report_template_engine/sellerDisclosureSection";
import type {
  ComponentCheckResult,
  InspectFlowReportInput,
  LegacyPhotoMapping,
  LegacySteveReportInput,
  LockedClauseCheck,
  PhotoMappingResult,
  SteveReportScore,
  StructureCheckResult,
  ValidationStatus,
} from "@/lib/reportComparison/types";

export const STEVE_PRODUCTION_THRESHOLD = STEVE_FORMAT_MATCH_THRESHOLD;

export const DEFAULT_LEGACY_PHOTO_MAPPINGS: readonly LegacyPhotoMapping[] = [
  {
    legacy_label: "panneau électrique",
    legacy_section: "Électricité",
    expected_system_id: "electricite",
    expected_component_id: "electricite_panneau_principal",
    photo_hint: "electrical_panel_photo",
  },
  {
    legacy_label: "plancher",
    legacy_section: "Intérieur",
    expected_system_id: "interieur",
    expected_component_id: "interieur_planchers",
    photo_hint: "wood_floor_photo",
  },
] as const;

const STEVE_INSPECTION_SYSTEM_ORDER = [
  "structure",
  "exterieur",
  "toiture",
  "plomberie",
  "electricite",
  "chauffage_climatisation",
  "interieur",
] as const;

function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function statusFrom(required: boolean, present: boolean, partial?: boolean): ValidationStatus {
  if (present) return "conforme";
  if (partial) return "acceptable";
  return required ? "manquant" : "acceptable";
}

function pct(present: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((present / total) * 100);
}

function extractComponentHtml(html: string, componentId: string): string {
  const marker = `data-component-id="${componentId}"`;
  const start = html.indexOf(marker);
  if (start < 0) return "";
  const end = html.indexOf('data-component-id="', start + marker.length);
  return end > start ? html.slice(start, end) : html.slice(start, start + 4000);
}

function countPhotosInFragment(fragment: string): number {
  return (fragment.match(/class="pro-photo"/g) ?? []).length;
}

function checkStructure(
  html: string,
  legacy?: LegacySteveReportInput,
): StructureCheckResult[] {
  const lower = html.toLowerCase();
  const legacyText = legacy?.text ?? "";
  const expectsDv =
    /d[ée]claration.*(vendeur|propri[ée]taire)|\bdv\b/i.test(legacyText) ||
    legacy?.expected_sections?.some((s) => /propri[ée]taire|dv/i.test(s));

  const checks: Array<Omit<StructureCheckResult, "status"> & { present: boolean; partial?: boolean }> = [
    { code: "cover", label: "Page couverture", required: true, present: lower.includes("pro-cover") },
    {
      code: "info",
      label: "Informations inspection",
      required: true,
      present: /informations sur l'inspection|inspection information/i.test(html),
    },
    {
      code: "building",
      label: "Description bâtiment",
      required: true,
      present: /description sommaire du b/i.test(html),
    },
    {
      code: "dv",
      label: "Déclaration propriétaire",
      required: Boolean(expectsDv),
      present: /d[ée]claration du propri[ée]taire|owner disclosure/i.test(html),
      partial: !expectsDv,
    },
    {
      code: "legal",
      label: "Clauses légales",
      required: true,
      present: /port[ée]e et limites|scope and limits/i.test(html),
    },
    {
      code: "orientation",
      label: "Orientation",
      required: true,
      present: html.includes(ORIENTATION_READING_SECTION_TITLE),
    },
    {
      code: "technical",
      label: "Sections techniques",
      required: true,
      present: html.includes("pro-kb-system") || /constats d'inspection|inspection findings/i.test(html),
    },
    {
      code: "conclusion",
      label: "Conclusion",
      required: true,
      present: html.includes('data-block="conclusion"'),
    },
    {
      code: "attestation",
      label: "Attestation",
      required: true,
      present: html.includes('data-block="attestation"'),
    },
    {
      code: "reader_notice",
      label: "Avis lecteur",
      required: true,
      present: html.includes('data-block="reader_notice"'),
    },
  ];

  return checks.map(({ present, partial, ...rest }) => ({
    ...rest,
    status: statusFrom(rest.required, present, partial),
  }));
}

function checkSystemOrder(html: string): boolean {
  let lastIdx = -1;
  for (const systemId of STEVE_INSPECTION_SYSTEM_ORDER) {
    const idx = html.indexOf(`data-system-id="${systemId}"`);
    if (idx < 0) continue;
    if (idx <= lastIdx) return false;
    lastIdx = idx;
  }
  return lastIdx >= 0;
}

function checkComponents(
  input: InspectFlowReportInput,
): ComponentCheckResult[] {
  const results: ComponentCheckResult[] = [];
  const locale = (input.payload.report_language as string) ?? "fr-CA";

  for (const system of INSPECTION_KNOWLEDGE_SYSTEMS) {
    const blocks = buildSystemComponentBlocks(input.payload, system.id, locale as "fr-CA");
    for (const component of system.components) {
      const block = blocks.find((b) => b.component_id === component.id);
      const fragment = extractComponentHtml(input.html, component.id);
      const photoCount =
        countPhotosInFragment(fragment) || (block?.photos.length ?? 0);

      const hasTitle = fragment.includes(component.title) || input.html.includes(component.title);
      const needsLimitation = component.standardLimitations.length > 0;
      const hasLimitation =
        !needsLimitation ||
        fragment.includes("Limitations") ||
        (block?.limitations.length ?? 0) > 0;
      const hasObservation =
        fragment.includes("Observations") ||
        (block?.observations.length ?? 0) > 0;
      const hasComment =
        !component.standardComments.length ||
        fragment.includes("Commentaires") ||
        (block?.commentaires.length ?? 0) > 0;
      const needsAdvice = component.maintenanceAdvice.length > 0;
      const hasAdvice =
        !needsAdvice ||
        fragment.includes("Conseils entretien") ||
        (block?.maintenance_advice.length ?? 0) > 0;

      const warnings: string[] = [];
      if (needsLimitation && !hasLimitation) warnings.push("Limitation standard manquante");
      if (!hasObservation) warnings.push("Observation manquante");
      if (needsAdvice && !hasAdvice) warnings.push("Conseil entretien manquant");

      let status: ValidationStatus = "conforme";
      if (!hasTitle || !hasObservation) status = "manquant";
      else if (warnings.length > 0) status = "acceptable";

      results.push({
        system_id: system.id,
        component_id: component.id,
        title: component.title,
        status,
        has_title: hasTitle,
        has_limitation: hasLimitation,
        has_observation: hasObservation,
        has_comment: hasComment,
        has_advice: hasAdvice,
        photo_count: photoCount,
        warnings,
      });
    }
  }

  return results;
}

function checkLockedClauses(html: string): LockedClauseCheck[] {
  const lower = normalize(html);
  const checks: LockedClauseCheck[] = [
    {
      clause_id: "reader_notice",
      label: "Avis au lecteur",
      present: READER_NOTICE_CLAUSES_FR.some((c) =>
        lower.includes(normalize(c.content).slice(0, 35)),
      ),
      ai_modifiable: false,
    },
    {
      clause_id: "attestation",
      label: "Attestation",
      present: ATTESTATION_CLAUSES_FR.some((c) => lower.includes(normalize(c.content).slice(0, 30))),
      ai_modifiable: false,
    },
    {
      clause_id: "limitations",
      label: "Limitations",
      present: /limites d'acc[èe]s|accessibility limitations/i.test(html),
      ai_modifiable: false,
    },
    {
      clause_id: "co",
      label: "Note CO",
      present: /monoxyde de carbone|carbon monoxide/i.test(html),
      ai_modifiable: false,
    },
    {
      clause_id: "orientation",
      label: "Orientation",
      present: html.includes(ORIENTATION_READING_SECTION_TITLE),
      ai_modifiable: false,
    },
    {
      clause_id: "nb",
      label: "N.B.",
      present: />N\.B\.<|specialist/i.test(html),
      ai_modifiable: false,
    },
  ];

  return checks;
}

function checkPhotoMappings(
  input: InspectFlowReportInput,
  mappings: LegacyPhotoMapping[],
): PhotoMappingResult[] {
  const contexts = collectPhotoPlacements(input);
  const photoMap = groupPhotosByComponent(contexts);

  return mappings.map((mapping) => {
    const photos = photoMap.get(mapping.expected_component_id) ?? [];
    const fragment = extractComponentHtml(input.html, mapping.expected_component_id);
    const inHtml = photos.some((url) => fragment.includes(url)) || countPhotosInFragment(fragment) > 0;

    if (inHtml || photos.length > 0) {
      return {
        legacy_label: mapping.legacy_label,
        status: "conforme" as const,
        message: `Photo placée sous ${mapping.expected_component_id}`,
        expected_component_id: mapping.expected_component_id,
      };
    }

    return {
      legacy_label: mapping.legacy_label,
      status: "manquant" as const,
      message: `Attendu: ${mapping.legacy_section ?? mapping.expected_system_id} / ${mapping.expected_component_id}`,
      expected_component_id: mapping.expected_component_id,
    };
  });
}

function collectPhotoPlacements(input: InspectFlowReportInput): Array<{
  photo_id: string;
  component_hint?: string;
}> {
  const raw = input.payload.steve_photo_context_v1;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const contexts = (raw as Record<string, unknown>).contexts;
  if (!Array.isArray(contexts)) return [];

  return contexts
    .filter((c) => c && typeof c === "object")
    .map((c) => {
      const row = c as Record<string, unknown>;
      return {
        photo_id: typeof row.photo_id === "string" ? row.photo_id : "",
        component_hint:
          (typeof row.component_id === "string" ? row.component_id : undefined) ??
          (typeof row.component_hint === "string" ? row.component_hint : undefined),
      };
    })
    .filter((p) => p.photo_id);
}

function compareLegacyContent(
  parsed: InspectionReportParseResult | null,
  payload: Record<string, unknown>,
): { match: number; warnings: string[] } {
  if (!parsed) return { match: 100, warnings: [] };

  const warnings: string[] = [];
  let matched = 0;
  let total = 0;

  const cover =
    payload.cover_v1 && typeof payload.cover_v1 === "object"
      ? (payload.cover_v1 as Record<string, unknown>)
      : null;

  const pairs: Array<[string | null | undefined, string | null | undefined, string]> = [
    [parsed.property.address, cover?.address as string, "adresse"],
    [parsed.client.name, (cover?.propriete as Record<string, unknown>)?.client_nom as string, "client"],
    [parsed.building.type, null, "type bâtiment"],
    [parsed.building.year, null, "année"],
  ];

  for (const [legacyVal, newVal, label] of pairs) {
    if (!legacyVal?.trim()) continue;
    total += 1;
    const legacyNorm = normalize(legacyVal);
    const newNorm = newVal ? normalize(String(newVal)) : "";
    if (newNorm && (newNorm.includes(legacyNorm) || legacyNorm.includes(newNorm))) {
      matched += 1;
    } else {
      warnings.push(`Écart ${label}: legacy « ${legacyVal} »`);
    }
  }

  return { match: pct(matched, total), warnings };
}

function checkObservationCommentSeparation(html: string): boolean {
  const components = html.match(/data-component-id="[^"]+"/g) ?? [];
  if (components.length === 0) return true;

  let separated = 0;
  let checked = 0;
  for (const marker of components) {
    const id = marker.match(/data-component-id="([^"]+)"/)?.[1];
    if (!id) continue;
    const fragment = extractComponentHtml(html, id);
    if (!fragment.includes("Observations")) continue;
    checked += 1;
    if (fragment.includes("Commentaires") || !fragment.includes("Commentaire")) {
      separated += 1;
    }
  }
  return checked === 0 || separated / checked >= 0.85;
}

export function compareSteveReports(
  legacy: LegacySteveReportInput,
  inspectflow: InspectFlowReportInput,
): SteveReportScore {
  const parsed = legacy.text?.trim() ? parseInspectionReportText(legacy.text) : null;
  const structureChecks = checkStructure(inspectflow.html, legacy);
  const requiredStructure = structureChecks.filter((c) => c.required);
  const structurePresent = requiredStructure.filter((c) => c.status === "conforme").length;
  const structureAcceptable = requiredStructure.filter(
    (c) => c.status === "conforme" || c.status === "acceptable",
  ).length;

  const structure_match = pct(structurePresent, requiredStructure.length);
  const structureScoreWithAcceptable = pct(structureAcceptable, requiredStructure.length);

  const componentResults = checkComponents(inspectflow);
  const componentsOk = componentResults.filter((c) => c.status !== "manquant").length;
  const contentFromComponents = pct(componentsOk, componentResults.length);

  const legacyContent = compareLegacyContent(parsed, inspectflow.payload);
  const content_match = Math.round((contentFromComponents * 0.7 + legacyContent.match * 0.3));

  const formatResult = compareReportToSteveTemplate(inspectflow.payload, inspectflow.html);
  let overall_score = Math.round(
    structureScoreWithAcceptable * 0.35 +
      content_match * 0.35 +
      formatResult.score * 0.3,
  );

  const lockedClauses = checkLockedClauses(inspectflow.html);
  const locked_clauses_ok = lockedClauses.every((c) => c.present);
  const system_order_match = checkSystemOrder(inspectflow.html);
  const allRequiredConforme = requiredStructure.every((c) => c.status === "conforme");

  if (allRequiredConforme && locked_clauses_ok && system_order_match) {
    overall_score = Math.max(overall_score, STEVE_PRODUCTION_THRESHOLD);
  }

  const photoMappings = legacy.photo_mappings ?? [...DEFAULT_LEGACY_PHOTO_MAPPINGS];
  const photo_mapping_results = checkPhotoMappings(inspectflow, photoMappings);
  const photosOk = photo_mapping_results.every((p) => p.status !== "manquant");
  if (photosOk && photo_mapping_results.length > 0) {
    overall_score = Math.min(100, overall_score + 1);
  }

  const missing_sections = [
    ...structureChecks.filter((c) => c.required && c.status === "manquant").map((c) => c.label),
    ...formatResult.missing.map((code) => code),
    ...componentResults.filter((c) => c.status === "manquant").map((c) => c.title),
  ];

  const warnings = [
    ...legacyContent.warnings,
    ...componentResults.flatMap((c) => c.warnings.map((w) => `${c.title}: ${w}`)),
    ...photo_mapping_results
      .filter((p) => p.status === "manquant")
      .map((p) => `Photo ${p.legacy_label}: ${p.message}`),
    ...(locked_clauses_ok ? [] : ["Clauses verrouillées manquantes ou altérées"]),
  ];

  const observation_comment_separated = checkObservationCommentSeparation(inspectflow.html);

  return {
    structure_match,
    content_match,
    overall_score,
    missing_sections: [...new Set(missing_sections)],
    warnings,
    ready_for_client:
      overall_score >= STEVE_PRODUCTION_THRESHOLD &&
      locked_clauses_ok &&
      system_order_match &&
      allRequiredConforme,
    structure_checks: structureChecks,
    system_order_match,
    component_results: componentResults,
    locked_clauses: lockedClauses,
    locked_clauses_ok,
    photo_mapping_results,
    observation_comment_separated,
  };
}

export function steveSystemOrderLabels(): string[] {
  return orderedInspectionSystems().map((s) => s.title);
}
