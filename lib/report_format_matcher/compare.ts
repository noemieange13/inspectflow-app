import { parseReportProfessionalSnapshotV1, REPORT_PROFESSIONAL_SNAPSHOT_KEY } from "@/lib/inspectorProfile";
import { readReportReadySnapshotFromPayload } from "@/lib/report_readiness_engine";
import { parseStructuredEntriesFromPayload } from "@/lib/reportNarrative";
import {
  buildExpectedSteveSections,
  STEVE_PAGE_BLOCK_ORDER,
  STEVE_REQUIRED_COVER_FIELDS,
  STEVE_SECTION_ORDER,
} from "@/lib/report_format_matcher/steveTemplate";
import type { FormatMatchResult, SteveReportSection } from "@/lib/report_format_matcher/types";
import { INSPECTION_WEATHER_PAYLOAD_KEY } from "@/lib/weather/inspectionWeather";

const STEVE_FORMAT_MATCH_THRESHOLD = 95;

export { STEVE_FORMAT_MATCH_THRESHOLD };

function readCover(payload: Record<string, unknown>): Record<string, unknown> | null {
  const cover = payload.cover_v1;
  if (!cover || typeof cover !== "object") return null;
  return cover as Record<string, unknown>;
}

function markSection(
  sections: SteveReportSection[],
  code: string,
  present: boolean,
): SteveReportSection[] {
  return sections.map((s) => (s.code === code ? { ...s, present } : s));
}

function scoreSections(sections: SteveReportSection[]): { score: number; missing: string[] } {
  const required = sections.filter((s) => s.required);
  const optional = sections.filter((s) => !s.required);

  const requiredPresent = required.filter((s) => s.present).length;
  const optionalPresent = optional.filter((s) => s.present).length;

  const requiredWeight = 70;
  const optionalWeight = 30;

  const requiredScore =
    required.length > 0 ? (requiredPresent / required.length) * requiredWeight : requiredWeight;
  const optionalScore =
    optional.length > 0 ? (optionalPresent / optional.length) * optionalWeight : optionalWeight;

  const missing = sections.filter((s) => s.required && !s.present).map((s) => s.code);

  return {
    score: Math.round(Math.min(100, requiredScore + optionalScore)),
    missing,
  };
}

/**
 * Compare report payload (and optional rendered HTML) to Steve template expectations.
 * Read-only — does not mutate payload or invoke PDF engine.
 */
export function compareReportToSteveTemplate(
  payload: Record<string, unknown>,
  html?: string | null,
): FormatMatchResult {
  let sections = buildExpectedSteveSections();
  const cover = readCover(payload);

  if (cover) {
    for (const field of STEVE_REQUIRED_COVER_FIELDS) {
      const val = cover[field];
      const present = typeof val === "string" ? val.trim().length > 0 : val != null;
      sections = markSection(sections, `cover.${field}`, present);
    }
  }

  const snapshot = parseReportProfessionalSnapshotV1(payload[REPORT_PROFESSIONAL_SNAPSHOT_KEY]);
  if (snapshot?.inspector?.trim()) {
    sections = markSection(sections, "cover.inspecteur_nom", true);
  }

  const readySnap = readReportReadySnapshotFromPayload(payload);
  if (readySnap?.observations_ready) {
    sections = markSection(sections, "block.executive_summary", true);
  }
  if (readySnap?.photos_ready) {
    sections = markSection(sections, "block.annex", true);
  }

  const entries = parseStructuredEntriesFromPayload(payload.entries);
  if (entries.length > 0) {
    sections = markSection(sections, "block.priority_findings", true);
    sections = markSection(sections, "block.sections", true);
    for (const code of STEVE_SECTION_ORDER.slice(0, 5)) {
      sections = markSection(sections, `section.${code}`, true);
    }
  }

  if (payload[INSPECTION_WEATHER_PAYLOAD_KEY]) {
    sections = markSection(sections, "block.info", true);
  }

  if (html && html.trim()) {
    const lower = html.toLowerCase();
    for (const block of STEVE_PAGE_BLOCK_ORDER) {
      const markers = [`data-block="${block}"`, `id="${block}"`, `class="${block}"`, block];
      const found = markers.some((m) => lower.includes(m.toLowerCase()));
      const existing = sections.find((s) => s.code === `block.${block}`)?.present === true;
      sections = markSection(sections, `block.${block}`, found || existing);
    }
    if (lower.includes("signature") || snapshot?.signature) {
      sections = markSection(sections, "block.signature", true);
    }
    sections = markSection(sections, "block.limitations", true);
    sections = markSection(sections, "block.legal_clauses", true);
  } else {
    sections = markSection(sections, "block.cover", cover != null);
    sections = markSection(sections, "block.signature", Boolean(snapshot?.signature));
  }

  const { score, missing } = scoreSections(sections);
  return { score, sections, missing };
}

export function meetsSteveFormatThreshold(result: FormatMatchResult): boolean {
  return result.score >= STEVE_FORMAT_MATCH_THRESHOLD;
}
