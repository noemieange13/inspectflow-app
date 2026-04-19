/**
 * Vue « inspection-grade » pour IA / orchestrateurs — alignée sur le rendu PDF QC 2027.
 */

import type { QcLegalClauseRow } from "@/lib/qcLegalClauses";
import { groupClausesBySection } from "@/lib/qcLegalClauses";

export type PremiumSystemRow = {
  name: string;
  description: string;
  severity_label: string;
  severity_class: "severity-high" | "severity-medium" | "severity-low";
  photos: { url: string }[];
};

export type PremiumReportViewModel = {
  major_issues: string[];
  medium_issues: string[];
  systems: PremiumSystemRow[];
  global_condition: string;
  clauses: string[];
  clauses_by_section: Record<string, string[]>;
};

type SectionRow = {
  title?: unknown;
  observation?: unknown;
  analysis?: unknown;
  recommendation?: unknown;
  severity?: unknown;
};

type EntryRow = { zone: string; severity: string };

function parseEntriesFromPayload(payload: Record<string, unknown>): EntryRow[] {
  const raw = payload.entries;
  if (!Array.isArray(raw)) return [];
  const out: EntryRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const zone = typeof o.zone === "string" ? o.zone : "";
    const severity = typeof o.severity === "string" ? o.severity : "low";
    if (zone) out.push({ zone, severity });
  }
  return out;
}

function severityToClass(
  sev: string,
): "severity-high" | "severity-medium" | "severity-low" {
  const s = sev.toLowerCase();
  if (/élev|high|haut|majeur|crit|important/i.test(s)) return "severity-high";
  if (/moyen|medium|modér/i.test(s)) return "severity-medium";
  return "severity-low";
}

function lineForSection(sec: SectionRow | undefined): string {
  if (!sec) return "";
  const title = sec.title != null ? String(sec.title).trim() : "";
  const obs =
    typeof sec.observation === "string" ? sec.observation.trim() : "";
  if (title && obs) return `${title} — ${obs}`;
  return title || obs;
}

/**
 * Construit le mapping attendu par les pipelines IA → PDF (résumé + systèmes + clauses).
 */
export function buildPremiumViewModelFromPayload(
  payload: Record<string, unknown>,
  sectionsRaw: unknown[],
  legalRows: QcLegalClauseRow[] | null | undefined,
): PremiumReportViewModel {
  const sections = sectionsRaw.filter((x) => x && typeof x === "object") as SectionRow[];
  const entries = parseEntriesFromPayload(payload);

  const major_issues: string[] = [];
  const medium_issues: string[] = [];

  entries.forEach((e, i) => {
    const line = lineForSection(sections[i]);
    if (!line) return;
    if (e.severity === "high") major_issues.push(line);
    else medium_issues.push(line);
  });

  const global_condition =
    (() => {
      const cv = payload.cover_v1;
      if (cv && typeof cv === "object") {
        const c = cv as Record<string, unknown>;
        const cg = c.condition_generale;
        if (typeof cg === "string" && cg.trim()) return cg.trim();
      }
      const g = payload.global_condition;
      return typeof g === "string" ? g.trim() : "";
    })();

  const systems: PremiumSystemRow[] = sections.map((sec, idx) => {
    const e = entries[idx];
    const sevRaw =
      typeof sec.severity === "string"
        ? sec.severity.trim()
        : (e?.severity ?? "low");
    const title = sec.title != null ? String(sec.title) : "Section";
    const parts = [
      typeof sec.observation === "string" ? sec.observation.trim() : "",
      typeof sec.analysis === "string" ? sec.analysis.trim() : "",
      typeof sec.recommendation === "string" ? sec.recommendation.trim() : "",
    ].filter((x) => x.length > 0);
    const description = parts.join("\n\n");
    const ext = sec as Record<string, unknown>;
    const photosRaw = ext.photos ?? ext.images;
    const photos: { url: string }[] = [];
    if (Array.isArray(photosRaw)) {
      for (const p of photosRaw) {
        if (typeof p === "string" && /^https?:\/\//i.test(p)) {
          photos.push({ url: p.trim() });
        } else if (p && typeof p === "object") {
          const u = (p as { url?: unknown }).url;
          if (typeof u === "string" && /^https?:\/\//i.test(u)) {
            photos.push({ url: u.trim() });
          }
        }
      }
    }
    return {
      name: title,
      description,
      severity_label: sevRaw,
      severity_class: severityToClass(sevRaw),
      photos,
    };
  });

  const rows = legalRows ?? [];
  const clauses = rows.map((r) => r.clause);
  const clauses_by_section = groupClausesBySection(rows);

  return {
    major_issues,
    medium_issues,
    systems,
    global_condition,
    clauses,
    clauses_by_section,
  };
}
