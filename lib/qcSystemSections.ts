import type { ZoneCode } from "@/lib/reportNarrative";

/** Systèmes visés par la grille QC (7 pôles) — à couvrir par des constats structurés. */
export const QC_SYSTEM_CODES = [
  "toiture",
  "structure",
  "electricite",
  "plomberie",
  "chauffage",
  "isolation",
  "ventilation",
] as const;

export type QcSystemCode = (typeof QC_SYSTEM_CODES)[number];

/**
 * Groupes de zones métier (OR) suffisants pour « couvrir » un système.
 * Aligné sur les `ZoneCode` du compositeur Zero Draft.
 */
export const QC_SYSTEM_ZONE_GROUPS: Record<QcSystemCode, ZoneCode[]> = {
  toiture: ["toiture"],
  structure: ["fondation", "facade", "exterieur"],
  electricite: ["installation_electrique"],
  plomberie: ["plomberie"],
  chauffage: ["sous_sol", "grenier", "salon", "cuisine"],
  isolation: ["grenier", "facade", "sous_sol"],
  ventilation: ["salon", "salle_de_bain", "grenier", "sous_sol", "cuisine"],
};

/** Minimum de photos par système (agrégé sur les zones du groupe) — exigence terrain / preuve. */
export const QC_MIN_PHOTOS_BY_SYSTEM: Record<QcSystemCode, number> = {
  toiture: 2,
  structure: 1,
  electricite: 2,
  plomberie: 2,
  chauffage: 1,
  isolation: 1,
  ventilation: 1,
};

export type ReportEntryLike = {
  zone: string;
  note?: string;
};

export function parsePayloadEntries(raw: unknown): ReportEntryLike[] {
  if (!Array.isArray(raw)) return [];
  const out: ReportEntryLike[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const zone = typeof o.zone === "string" ? o.zone : "";
    const note = typeof o.note === "string" ? o.note : "";
    out.push({ zone, note });
  }
  return out;
}

/** Au moins un constat avec note significative dans une des zones du groupe système. */
export function findMissingQcSystemSections(entries: ReportEntryLike[]): QcSystemCode[] {
  const zonesWithFinding = new Set<string>();
  for (const e of entries) {
    const z = e.zone.trim();
    const n = (e.note ?? "").trim();
    if (z && n.length >= 1) zonesWithFinding.add(z);
  }
  const missing: QcSystemCode[] = [];
  for (const code of QC_SYSTEM_CODES) {
    const group = QC_SYSTEM_ZONE_GROUPS[code];
    const ok = group.some((zc) => zonesWithFinding.has(zc));
    if (!ok) missing.push(code);
  }
  return missing;
}

/** Compte les photos par zone (côté client ou `photos_coverage_v1.by_zone`). */
export function aggregatePhotosForQcSystem(
  byZone: Partial<Record<string, number>> | null | undefined,
  code: QcSystemCode,
): number {
  const zones = QC_SYSTEM_ZONE_GROUPS[code];
  let sum = 0;
  for (const z of zones) {
    const n = byZone?.[z];
    if (typeof n === "number" && n >= 0) sum += n;
  }
  return sum;
}

export function findInsufficientQcPhotoCoverage(
  byZone: Partial<Record<string, number>> | null | undefined,
): QcSystemCode[] {
  if (!byZone || Object.keys(byZone).length === 0) return [];
  const bad: QcSystemCode[] = [];
  for (const code of QC_SYSTEM_CODES) {
    const min = QC_MIN_PHOTOS_BY_SYSTEM[code];
    const got = aggregatePhotosForQcSystem(byZone, code);
    if (got < min) bad.push(code);
  }
  return bad;
}
