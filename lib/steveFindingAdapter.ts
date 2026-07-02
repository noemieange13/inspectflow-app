/**
 * Phase 8V — Adaptateur constat Steve (couche au-dessus du writer existant).
 * Ne modifie pas report_writer_engine — transforme sa sortie en schéma Steve.
 */

import type { SteveFindingV1 } from "@/lib/findingSchema";
import {
  buildConformeFinding,
  validateSteveFinding,
} from "@/lib/findingSchema";
import type { ProfessionalObservationText } from "@/lib/report_writer_engine/types";
import { getSteveComponentById } from "@/lib/steveInspectionOrder";
import {
  buildSteveObservationPrefix,
  buildSteveRecommendation,
  defaultSteveNoAnomalyComment,
  ensureSteveCommentEnding,
  sanitizeSteveWriting,
} from "@/lib/steveWritingStyle";

export type SteveWriterAdaptInput = {
  component_id: string;
  writerText?: ProfessionalObservationText | null;
  rawObservation?: string;
  limitation_standard?: string;
  photos?: string[];
  language?: "fr" | "en";
  severity?: SteveFindingV1["severity"];
  status?: SteveFindingV1["status"];
};

function mapWriterSeverity(
  writerText: ProfessionalObservationText | null | undefined,
  explicit?: SteveFindingV1["severity"],
): SteveFindingV1["severity"] {
  if (explicit) return explicit;
  const level = writerText?.confidence_level;
  if (level === "low") return "entretien";
  return "mineur";
}

export function adaptWriterOutputToSteveFinding(input: SteveWriterAdaptInput): SteveFindingV1 {
  const comp = getSteveComponentById(input.component_id);
  const language = input.language ?? "fr";
  const section = comp?.section ?? "Inspection";
  const component = comp?.component ?? input.component_id;
  const writer = input.writerText;

  const observation = sanitizeSteveWriting(
    writer?.observation?.trim() ||
      input.rawObservation?.trim() ||
      `${buildSteveObservationPrefix(component, language)}${component}.`,
  );

  const commentaire = ensureSteveCommentEnding(
    writer?.impact?.trim() || defaultSteveNoAnomalyComment(language),
    language,
  );

  const recommendationRaw = writer?.recommendation?.trim();
  const recommandation_optional = recommendationRaw
    ? buildSteveRecommendation(recommendationRaw, language)
    : undefined;

  const finding: SteveFindingV1 = {
    schema_version: 1,
    component_id: input.component_id,
    section,
    component,
    limitation_standard: input.limitation_standard?.trim() || writer?.limitation?.trim() || undefined,
    observation,
    commentaire,
    recommandation_optional,
    severity: mapWriterSeverity(writer, input.severity),
    photos: input.photos ?? [],
    status: input.status ?? (recommendationRaw ? "observation" : "conforme"),
    approved: false,
  };

  return finding;
}

export function buildSteveConformeFinding(
  componentId: string,
  observation: string,
  language: "fr" | "en" = "fr",
): SteveFindingV1 {
  const comp = getSteveComponentById(componentId);
  return buildConformeFinding({
    component_id: componentId,
    section: comp?.section ?? "Inspection",
    component: comp?.component ?? componentId,
    observation: sanitizeSteveWriting(observation),
    commentaire: defaultSteveNoAnomalyComment(language),
  });
}

export type SteveFormattedFindingBlock = {
  title: string;
  limitation?: string;
  observationLabel: string;
  observation: string;
  commentaireLabel: string;
  commentaire: string;
  recommandationLabel: string;
  recommandation?: string;
  photos: string[];
};

export function formatSteveFindingForReport(
  finding: SteveFindingV1,
  language: "fr" | "en" = "fr",
): SteveFormattedFindingBlock {
  const labels =
    language === "en"
      ? {
          obs: "Observations",
          com: "Comments",
          rec: "Recommendation",
          lim: "Limitations",
        }
      : {
          obs: "Observations",
          com: "Commentaires",
          rec: "Recommandation",
          lim: "Limitations",
        };

  return {
    title: `${finding.section} — ${finding.component}`,
    limitation: finding.limitation_standard,
    observationLabel: labels.obs,
    observation: finding.observation,
    commentaireLabel: labels.com,
    commentaire: finding.commentaire,
    recommandationLabel: labels.rec,
    recommandation: finding.recommandation_optional,
    photos: finding.photos,
  };
}

export function renderSteveFindingHtml(
  finding: SteveFindingV1,
  language: "fr" | "en" = "fr",
): string {
  if (finding.status === "na") return "";

  const labels =
    language === "en"
      ? { obs: "Observations", com: "Comments", rec: "Recommendation", lim: "Limitations" }
      : { obs: "Observations", com: "Commentaires", rec: "Recommandation", lim: "Limitations" };

  const parts: string[] = [
    `<div class="pro-steve-finding">`,
    `<h4 style="margin:0 0 0.5em">${finding.section} — ${finding.component}</h4>`,
  ];

  if (finding.limitation_standard?.trim()) {
    parts.push(
      `<p><strong>${labels.lim} :</strong> ${escapeHtml(finding.limitation_standard)}</p>`,
    );
  }

  parts.push(
    `<p><strong>${labels.obs} :</strong></p>`,
    `<p style="white-space:pre-wrap;margin:0 0 0.75em">${escapeHtml(finding.observation)}</p>`,
    `<p><strong>${labels.com} :</strong></p>`,
    `<p style="white-space:pre-wrap;margin:0 0 0.75em">${escapeHtml(finding.commentaire)}</p>`,
  );

  if (finding.recommandation_optional?.trim()) {
    parts.push(
      `<p><strong>${labels.rec} :</strong></p>`,
      `<p style="white-space:pre-wrap;margin:0">${escapeHtml(finding.recommandation_optional)}</p>`,
    );
  }

  for (const url of finding.photos) {
    if (url.startsWith("data:image/") || /^https?:\/\//i.test(url)) {
      parts.push(`<img src=${JSON.stringify(url)} alt="" class="pro-photo"/>`);
    }
  }

  parts.push(`</div>`);
  return parts.join("");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function isSteveFindingReadyForReport(finding: SteveFindingV1): boolean {
  return validateSteveFinding(finding).valid && finding.approved === true;
}
