import type { AIObservationDraft } from "@/lib/observation_ai_engine";

import { REPORT_WRITER_MODEL, REPORT_WRITER_PROMPT_VERSION } from "./constants";
import {
  buildImpactText,
  buildLimitationText,
  buildRecommendationText,
  isAlarmistPhrase,
  normalizeProvince,
  resolveWriterLanguage,
} from "./language";
import { normalizeInspectorReportStyleV1 } from "@/lib/inspectorReportStyle";

import { adaptWrittenTextForInspectorStyle } from "./inspectorStyle";
import { sanitizeFactualObservation } from "./sanitize";
import type {
  FormattedProfessionalNote,
  ProfessionalObservationConfidence,
  ProfessionalObservationText,
  ReportWriterInput,
} from "./types";

function confidenceLevel(score: number): ProfessionalObservationConfidence {
  if (score >= 0.8) return "high";
  if (score >= 0.55) return "medium";
  return "low";
}

function observationFromDraft(
  draft: AIObservationDraft,
  language: "fr" | "en",
): string {
  const raw = draft.observation_text.trim() || draft.title.trim();
  const component = draft.component.trim();
  const prefix =
    language === "en"
      ? component
        ? `On the ${component}, `
        : ""
      : component
        ? `Au niveau du ${component}, `
        : "";

  const body = raw.replace(/^(\*\s*|•\s*|-\s*)+/gm, "").trim();
  return sanitizeFactualObservation(`${prefix}${body}`, language);
}

function formatNoteSections(
  text: ProfessionalObservationText,
  language: "fr" | "en",
): string {
  const labels =
    language === "en"
      ? {
          observation: "Observation",
          impact: "Possible consequence",
          recommendation: "Recommendation",
          limitation: "Limitation",
        }
      : {
          observation: "Observation",
          impact: "Conséquence possible",
          recommendation: "Recommandation",
          limitation: "Limitation",
        };

  const parts = [
    `${labels.observation}\n${text.observation}`,
    `${labels.impact}\n${text.impact}`,
    `${labels.recommendation}\n${text.recommendation}`,
  ];
  if (text.limitation) {
    parts.push(`${labels.limitation}\n${text.limitation}`);
  }
  return parts.join("\n\n");
}

/**
 * Transforme un AIObservationDraft en texte d'inspection professionnel structuré.
 * Ne modifie pas la détection 3A — rédaction uniquement.
 */
export function writeProfessionalObservation(input: ReportWriterInput): FormattedProfessionalNote {
  const { draft, normative_context, knowledge } = input;
  const language = resolveWriterLanguage(normative_context);
  const province = normalizeProvince(normative_context.province);
  const norme =
    knowledge?.applicable_references[0]?.label ??
    normative_context.norme?.trim() ??
    draft.normative_references[0]?.trim() ??
    undefined;

  const observation = observationFromDraft(draft, language);
  let impact = buildImpactText(draft.severity, draft.system, draft.component, language);
  let recommendation =
    knowledge?.recommended_action ??
    buildRecommendationText(draft.severity, draft.system, norme, language, province);

  if (knowledge?.applicable_references.length) {
    const refLabels = knowledge.applicable_references.map((r) => r.label).join(language === "en" ? "; " : " ; ");
    recommendation = `${recommendation} ${language === "en" ? "References:" : "Réf.:"} ${refLabels}.`;
  }

  if (knowledge?.specialist_required && !/spécialiste|specialist/i.test(recommendation)) {
    recommendation =
      language === "en"
        ? `${recommendation} Qualified specialist required.`
        : `${recommendation} Spécialiste qualifié requis.`;
  }

  if (draft.severity === "maintenance") {
    if (isAlarmistPhrase(impact, language)) {
      impact = buildImpactText("maintenance", draft.system, draft.component, language);
    }
    if (isAlarmistPhrase(recommendation, language)) {
      recommendation = buildRecommendationText(
        "maintenance",
        draft.system,
        norme,
        language,
        province,
      );
    }
  }

  const limitation =
    knowledge?.inspection_limitations[0] ??
    (draft.severity === "safety" || draft.confidence_score < 0.75
      ? buildLimitationText(draft.severity, language)
      : null);

  const inspectorStyle = normative_context.inspector_style
    ? normalizeInspectorReportStyleV1(normative_context.inspector_style)
    : null;

  const styled = inspectorStyle
    ? adaptWrittenTextForInspectorStyle(observation, impact, recommendation, inspectorStyle, language)
    : { observation, impact, recommendation };

  const generated_at = new Date().toISOString();
  const text: ProfessionalObservationText = {
    observation: styled.observation,
    impact: styled.impact,
    recommendation: styled.recommendation,
    limitation,
    confidence_level: confidenceLevel(knowledge?.confidence ?? draft.confidence_score),
    traceability: {
      writer_model: REPORT_WRITER_MODEL,
      prompt_version: REPORT_WRITER_PROMPT_VERSION,
      generated_at,
      draft_id: draft.draft_id,
      ...(inspectorStyle ? { inspector_style: inspectorStyle } : {}),
    },
  };

  const header =
    language === "en"
      ? "Professional draft — review before sign-off:\n"
      : "Brouillon professionnel — à valider avant signature :\n";

  const formatted_note = [
    header,
    formatNoteSections(text, language),
    "",
    `<!-- report-writer-engine:v1 -->`,
    `writer:${REPORT_WRITER_MODEL}`,
    `prompt:${REPORT_WRITER_PROMPT_VERSION}`,
    `draft_id:${draft.draft_id}`,
    `generated_at:${generated_at}`,
  ]
    .join("\n")
    .slice(0, 3500);

  return { text, formatted_note };
}

export function writeProfessionalObservations(
  drafts: AIObservationDraft[],
  normative_context: ReportWriterInput["normative_context"],
): FormattedProfessionalNote[] {
  return drafts.map((draft) =>
    writeProfessionalObservation({ draft, normative_context }),
  );
}
