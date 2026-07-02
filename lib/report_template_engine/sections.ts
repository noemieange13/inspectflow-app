import {
  inferObservationSeverityClass,
  humanSeverityLabel,
  parseStructuredNoteFromEntryNote,
} from "@/lib/findingsReview";
import {
  PROFESSIONAL_MAX_PRIORITY_FINDINGS,
  PROFESSIONAL_SECTION_ORDER,
  resolveProfessionalSectionForEntry,
} from "@/lib/report_template_engine/constants";
import { professionalSectionTitle } from "@/lib/report_template_engine/locales";
import type {
  ExecutiveSummary,
  PriorityFinding,
  SectionBlock,
  SectionFinding,
  SectionRowInput,
} from "@/lib/report_template_engine/types";
import type { ReportLocale } from "@/lib/reportLocale";
import { toWriterLanguage } from "@/lib/reportLocale";
import {
  parseStructuredEntriesFromPayload,
  type ReportEntryInput,
  type ZoneCode,
} from "@/lib/reportNarrative";

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function sectionFindingFromPair(
  sec: SectionRowInput,
  entry: ReportEntryInput | null,
  photoUrls: string[],
  locale: ReportLocale,
): SectionFinding | null {
  const lang = toWriterLanguage(locale);
  const obsId = str(sec.id) || entry?.id || "";
  const title = str(sec.title) || (entry ? `${entry.zone} — ${entry.issue}` : "");
  const parsed = entry?.note ? parseStructuredNoteFromEntryNote(entry.note) : null;
  const observation =
    str(sec.observation) || parsed?.observation?.trim() || entry?.note?.trim() || "";
  const analysis = str(sec.analysis) || parsed?.consequence?.trim() || "";
  const recommendation =
    str(sec.recommendation) || parsed?.recommendation?.trim() || "";
  const severityLabel = entry
    ? humanSeverityLabel(entry, lang)
    : str(sec.severity);

  if (!title && !observation && !analysis && !recommendation) return null;

  return {
    observationId: obsId,
    title: title || observation.slice(0, 80) || "—",
    observation,
    analysis,
    recommendation,
    severityLabel,
    photoUrls,
  };
}

export function buildExecutiveSummary(
  entries: ReportEntryInput[],
  locale: ReportLocale,
): ExecutiveSummary {
  const lang = toWriterLanguage(locale);
  let maintenance = 0;
  let attention = 0;
  let priority = 0;

  for (const entry of entries) {
    const cls = inferObservationSeverityClass(entry);
    if (cls === "maintenance") maintenance += 1;
    else if (cls === "attention") attention += 1;
    else priority += 1;
  }

  const L =
    lang === "en"
      ? { m: "Maintenance", a: "Attention", p: "Priority" }
      : { m: "Entretien", a: "Attention", p: "Prioritaire" };

  return {
    totalFindings: entries.length,
    buckets: [
      { class: "maintenance", emoji: "🟢", label: L.m, count: maintenance },
      { class: "attention", emoji: "🟡", label: L.a, count: attention },
      {
        class: "major",
        emoji: "🔴",
        label: L.p,
        count: priority,
      },
    ],
  };
}

export function isPriorityEntry(entry: ReportEntryInput): boolean {
  const cls = inferObservationSeverityClass(entry);
  if (cls === "safety" || cls === "major") return true;
  if (cls === "attention" && entry.severity === "high") return true;
  return false;
}

export function buildPriorityFindings(
  sections: SectionRowInput[],
  entries: ReportEntryInput[],
  primaryByObservationId: Record<string, string>,
  locale: ReportLocale,
): PriorityFinding[] {
  const lang = toWriterLanguage(locale);
  const out: PriorityFinding[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!isPriorityEntry(entry)) continue;
    const sec = sections[i];
    const obsId = str(sec?.id) || entry.id?.trim() || `idx-${i}`;
    const parsed = entry.note ? parseStructuredNoteFromEntryNote(entry.note) : null;
    const title =
      str(sec?.title) ||
      parsed?.observation?.slice(0, 80) ||
      `${entry.zone} — ${entry.issue}`;
    const summary =
      str(sec?.observation) ||
      parsed?.observation?.trim() ||
      str(sec?.analysis) ||
      parsed?.consequence?.trim() ||
      entry.note?.trim() ||
      "";
    out.push({
      observationId: obsId,
      title,
      summary: summary.slice(0, 400),
      primaryPhotoUrl: primaryByObservationId[obsId] ?? null,
      pageRef: lang === "en" ? "See section" : "Voir section",
      severityClass: inferObservationSeverityClass(entry),
    });
  }

  return out.slice(0, PROFESSIONAL_MAX_PRIORITY_FINDINGS);
}

export function buildSectionBlocks(
  sections: SectionRowInput[],
  entries: ReportEntryInput[],
  photoUrlsByObservationId: Record<string, string[]>,
  locale: ReportLocale,
): SectionBlock[] {
  const byCode = new Map<string, SectionFinding[]>();

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const entry = entries[i] ?? null;
    const obsId = str(sec?.id) || entry?.id?.trim() || "";
    const urls = obsId ? (photoUrlsByObservationId[obsId] ?? []) : [];
    const finding = sectionFindingFromPair(sec, entry, urls, locale);
    if (!finding) continue;

    const zone = entry?.zone ?? str(sec.zone);
    const issue = entry?.issue;
    const code = resolveProfessionalSectionForEntry(zone, issue);
    const list = byCode.get(code) ?? [];
    list.push(finding);
    byCode.set(code, list);
  }

  return PROFESSIONAL_SECTION_ORDER.filter((code) => (byCode.get(code)?.length ?? 0) > 0).map(
    (code) => ({
      code,
      title: professionalSectionTitle(code, locale),
      findings: byCode.get(code) ?? [],
    }),
  );
}

export function parseEntriesAlignedWithSections(
  payload: Record<string, unknown>,
  sections: SectionRowInput[],
): ReportEntryInput[] {
  const fromPayload = parseStructuredEntriesFromPayload(payload.entries);
  if (fromPayload.length >= sections.length && fromPayload.length > 0) {
    return fromPayload.slice(0, sections.length);
  }

  const out: ReportEntryInput[] = [];
  for (let i = 0; i < sections.length; i++) {
    if (fromPayload[i]) {
      out.push(fromPayload[i]);
      continue;
    }
    const sec = sections[i];
    const id = str(sec.id);
    const zone = (str(sec.zone) || "autre") as ZoneCode;
    out.push({
      id: id || undefined,
      zone,
      issue: "other",
      severity: /high|élev|maj/i.test(str(sec.severity)) ? "high" : "medium",
      note: str(sec.observation) || undefined,
    });
  }
  return out;
}
