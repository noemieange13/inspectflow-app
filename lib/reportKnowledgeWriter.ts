/**
 * Phase 8V — Génération bloc composante (couche au-dessus du report_writer_engine).
 */

import type { ComponentType, InspectionComponentKnowledge } from "@/lib/inspectionKnowledgeBase";
import {
  isDefectFinding,
  NO_ANOMALY_OBSERVATION_FR,
  resolveComponentInventoryItems,
} from "@/lib/inspectionKnowledgeBase";
import type { SteveFindingV1 } from "@/lib/findingSchema";
import {
  normalizeInspectorReportStyleV1,
  type InspectorReportStyleV1,
} from "@/lib/inspectorReportStyle";
import { applyDetailLevel } from "@/lib/report_writer_engine/inspectorStyle";
import { defaultSteveNoAnomalyComment } from "@/lib/steveWritingStyle";

export { NO_ANOMALY_OBSERVATION_FR };

export type ReportComponentBlockV1 = {
  system_id: string;
  system_title: string;
  component_id: string;
  component_title: string;
  component_type: ComponentType;
  subcomponent_titles: string[];
  limitations: string[];
  characteristics: string[];
  inventory_items: Array<{ label: string; value: string }>;
  observations: string[];
  commentaires: string[];
  maintenance_advice: string[];
  recommendation?: string;
  photos: string[];
};

export type BuildComponentBlockInput = {
  system_id: string;
  system_title: string;
  component: InspectionComponentKnowledge;
  finding?: SteveFindingV1 | null;
  photos?: string[];
  inventory_values?: Record<string, string>;
  inspector_style?: InspectorReportStyleV1 | null;
  language?: "fr" | "en";
};

function applyStyleToComments(
  comments: string[],
  style: InspectorReportStyleV1 | null | undefined,
  language: "fr" | "en",
): string[] {
  if (!comments.length) return comments;
  const normalized = normalizeInspectorReportStyleV1(style);
  return comments.map((c) => applyDetailLevel(c, normalized.detail_level, language));
}

function resolveRenderType(
  component: InspectionComponentKnowledge,
  finding?: SteveFindingV1 | null,
): ComponentType {
  if (isDefectFinding(finding)) return "defect_based";
  return component.componentType;
}

/** Limitations obligatoires — jamais retirées par le style 8Q. */
export function resolveComponentLimitations(
  component: InspectionComponentKnowledge,
  finding?: SteveFindingV1 | null,
): string[] {
  const standard = [...component.standardLimitations];
  if (finding?.limitation_standard?.trim()) {
    standard.push(finding.limitation_standard.trim());
  }
  return [...new Set(standard)];
}

export function resolveComponentCharacteristics(
  component: InspectionComponentKnowledge,
): string[] {
  return [...(component.standardCharacteristics ?? [])];
}

export function resolveComponentObservations(
  component: InspectionComponentKnowledge,
  finding?: SteveFindingV1 | null,
  language: "fr" | "en" = "fr",
): string[] {
  if (isDefectFinding(finding) && finding?.observation?.trim()) {
    return [finding.observation.trim()];
  }
  if (finding?.observation?.trim() && finding.status !== "na" && finding.severity === "none") {
    return [finding.observation.trim()];
  }
  if (component.standardObservations.length > 0) {
    return [...component.standardObservations];
  }
  return [
    language === "en"
      ? "No apparent anomaly was observed at the time of inspection."
      : NO_ANOMALY_OBSERVATION_FR,
  ];
}

export function resolveComponentCommentaires(
  component: InspectionComponentKnowledge,
  finding?: SteveFindingV1 | null,
  style?: InspectorReportStyleV1 | null,
  language: "fr" | "en" = "fr",
): string[] {
  const raw: string[] = [];
  if (isDefectFinding(finding) && finding?.commentaire?.trim()) {
    raw.push(finding.commentaire.trim());
  } else if (finding?.commentaire?.trim() && finding.status !== "na" && !isDefectFinding(finding)) {
    raw.push(finding.commentaire.trim());
  } else if (component.standardComments.length > 0) {
    raw.push(...component.standardComments);
  } else if (!finding || finding.severity === "none" || finding.status === "conforme") {
    raw.push(defaultSteveNoAnomalyComment(language));
  }
  return applyStyleToComments(raw, style, language);
}

export function resolveComponentRecommendation(
  finding?: SteveFindingV1 | null,
): string | undefined {
  if (!isDefectFinding(finding)) return undefined;
  const rec = finding?.recommandation_optional?.trim();
  return rec || undefined;
}

export function buildReportComponentBlock(input: BuildComponentBlockInput): ReportComponentBlockV1 {
  const language = input.language ?? "fr";
  const { component, finding } = input;
  const component_type = resolveRenderType(component, finding);

  return {
    system_id: input.system_id,
    system_title: input.system_title,
    component_id: component.id,
    component_title: component.title,
    component_type,
    subcomponent_titles: component.subcomponents?.map((s) => s.title) ?? [],
    limitations: resolveComponentLimitations(component, finding),
    characteristics: resolveComponentCharacteristics(component),
    inventory_items: resolveComponentInventoryItems(component, input.inventory_values),
    observations: resolveComponentObservations(component, finding, language),
    commentaires: resolveComponentCommentaires(component, finding, input.inspector_style, language),
    maintenance_advice: [...component.maintenanceAdvice],
    recommendation: resolveComponentRecommendation(finding),
    photos: input.photos ?? finding?.photos ?? [],
  };
}

export function renderReportComponentBlockHtml(
  block: ReportComponentBlockV1,
  language: "fr" | "en" = "fr",
): string {
  const hasContent =
    block.limitations.length > 0 ||
    block.characteristics.length > 0 ||
    block.inventory_items.length > 0 ||
    block.observations.length > 0 ||
    block.commentaires.length > 0 ||
    block.maintenance_advice.length > 0 ||
    block.recommendation ||
    block.photos.length > 0;

  if (!hasContent) return "";

  const labels =
    language === "en"
      ? {
          lim: "Limitations",
          char: "Characteristics",
          inv: "Inventory",
          obs: "Observations",
          com: "Comments",
          adv: "Maintenance advice",
          rec: "Recommendation",
        }
      : {
          lim: "Limitations",
          char: "Caractéristiques",
          inv: "Inventaire",
          obs: "Observations",
          com: "Commentaires",
          adv: "Conseils entretien",
          rec: "Recommandation",
        };

  const parts: string[] = [
    `<div class="pro-kb-component" data-component-id="${escapeAttr(block.component_id)}" data-component-type="${escapeAttr(block.component_type)}">`,
    `<h4 style="margin:0.75em 0 0.35em;font-size:15px;font-weight:700">${escapeHtml(block.component_title)}</h4>`,
  ];

  if (block.component_type === "technical" && block.subcomponent_titles.length > 0) {
    parts.push('<ul style="margin:0.25em 0 0.5em;padding-left:1.25em;font-size:13px">');
    for (const sub of block.subcomponent_titles) {
      parts.push(`<li>${escapeHtml(sub)}</li>`);
    }
    parts.push("</ul>");
  }

  if (block.limitations.length > 0) {
    parts.push(`<p style="margin:0.35em 0 0.25em;font-weight:600">${labels.lim} :</p>`);
    for (const lim of block.limitations) {
      parts.push(`<p style="white-space:pre-wrap;margin:0 0 0.5em;line-height:1.45">${escapeHtml(lim)}</p>`);
    }
  }

  if (block.characteristics.length > 0) {
    parts.push(`<p style="margin:0.35em 0 0.25em;font-weight:600">${labels.char} :</p>`);
    for (const ch of block.characteristics) {
      parts.push(`<p style="white-space:pre-wrap;margin:0 0 0.5em;line-height:1.45">${escapeHtml(ch)}</p>`);
    }
  }

  if (block.inventory_items.length > 0) {
    parts.push(`<p style="margin:0.35em 0 0.25em;font-weight:600">${labels.inv} :</p>`);
    parts.push('<ul style="margin:0.25em 0 0.5em;padding-left:1.25em;font-size:13px;line-height:1.45">');
    for (const item of block.inventory_items) {
      parts.push(`<li>${escapeHtml(item.label)} : ${escapeHtml(item.value)}</li>`);
    }
    parts.push("</ul>");
  }

  if (block.observations.length > 0) {
    parts.push(`<p style="margin:0.35em 0 0.25em;font-weight:600">${labels.obs} :</p>`);
    for (const obs of block.observations) {
      parts.push(`<p style="white-space:pre-wrap;margin:0 0 0.5em;line-height:1.45">${escapeHtml(obs)}</p>`);
    }
  }

  if (block.commentaires.length > 0) {
    parts.push(`<p style="margin:0.35em 0 0.25em;font-weight:600">${labels.com} :</p>`);
    for (const com of block.commentaires) {
      parts.push(`<p style="white-space:pre-wrap;margin:0 0 0.5em;line-height:1.45">${escapeHtml(com)}</p>`);
    }
  }

  if (block.maintenance_advice.length > 0) {
    parts.push(`<p style="margin:0.35em 0 0.25em;font-weight:600">${labels.adv} :</p>`);
    for (const adv of block.maintenance_advice) {
      parts.push(`<p style="white-space:pre-wrap;margin:0 0 0.5em;line-height:1.45">${escapeHtml(adv)}</p>`);
    }
  }

  if (block.recommendation) {
    parts.push(`<p style="margin:0.35em 0 0.25em;font-weight:600">${labels.rec} :</p>`);
    parts.push(`<p style="white-space:pre-wrap;margin:0 0 0.5em;line-height:1.45">${escapeHtml(block.recommendation)}</p>`);
  }

  for (const url of block.photos) {
    if (url.startsWith("data:image/") || /^https?:\/\//i.test(url)) {
      parts.push(`<img src=${JSON.stringify(url)} alt="" class="pro-photo"/>`);
    }
  }

  parts.push("</div>");
  return parts.join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
