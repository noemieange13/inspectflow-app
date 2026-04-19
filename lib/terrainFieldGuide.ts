/**
 * Agent guide terrain — proactif pendant l’inspection (photos & constats QC).
 */

import type { ZoneCode } from "@/lib/reportNarrative";
import {
  type QcSystemCode,
  QC_SYSTEM_ZONE_GROUPS,
  QC_MIN_PHOTOS_BY_SYSTEM,
  findInsufficientQcPhotoCoverage,
  findMissingQcSystemSections,
  type ReportEntryLike,
  aggregatePhotosForQcSystem,
} from "@/lib/qcSystemSections";

/** Priorité sécurité → conformité (aligné spec « panneau électrique d’abord »). */
export const TERRAIN_GUIDE_SYSTEM_PRIORITY: QcSystemCode[] = [
  "electricite",
  "toiture",
  "structure",
  "plomberie",
  "chauffage",
  "isolation",
  "ventilation",
];

export type TerrainGuideKind = "photo" | "finding";

export type TerrainGuideStep = {
  kind: TerrainGuideKind;
  qc_system: QcSystemCode;
  /** Zone à lier aux prochaines photos (première zone du groupe QC). */
  suggested_zone: ZoneCode;
  title_fr: string;
  title_en: string;
  detail_fr: string;
  detail_en: string;
  min_photos: number;
  current_photos: number;
};

const PHOTO_COPY: Record<
  QcSystemCode,
  { fr: { t: string; d: string }; en: { t: string; d: string } }
> = {
  electricite: {
    fr: {
      t: "Photographier le panneau électrique",
      d: "Vue d’ensemble du tableau + disjoncteurs principaux (2 clichés minimum pour la grille QC).",
    },
    en: {
      t: "Photograph the electrical panel",
      d: "Overall view of the service panel + main breakers (2 photos minimum for QC grid).",
    },
  },
  toiture: {
    fr: {
      t: "Photographier la toiture",
      d: "Surface, solins et sorties (cheminée / ventilation) — preuves terrain.",
    },
    en: {
      t: "Photograph the roof",
      d: "Field surface, flashings, and penetrations — site evidence.",
    },
  },
  structure: {
    fr: {
      t: "Photographier la structure apparente",
      d: "Fondation / façade / extérieur : au moins une preuve par axe utile au QC.",
    },
    en: {
      t: "Photograph visible structure",
      d: "Foundation / facade / exterior — at least one useful QC proof.",
    },
  },
  plomberie: {
    fr: {
      t: "Photographier la plomberie",
      d: "Équipements principaux, fuites visibles, drain — 2 photos minimum.",
    },
    en: {
      t: "Photograph plumbing",
      d: "Main fixtures, visible leaks, drain — 2 photos minimum.",
    },
  },
  chauffage: {
    fr: {
      t: "Photographier le chauffage",
      d: "Appareil principal et distribution visible (zone salon, sous-sol ou grenier selon le cas).",
    },
    en: {
      t: "Photograph heating",
      d: "Main appliance and visible distribution.",
    },
  },
  isolation: {
    fr: {
      t: "Photographier l’isolation",
      d: "Grenier / sous-sol / enveloppe : preuve d’épaisseur ou de lacunes.",
    },
    en: {
      t: "Photograph insulation",
      d: "Attic / basement / envelope — thickness or gaps.",
    },
  },
  ventilation: {
    fr: {
      t: "Photographier la ventilation",
      d: "Sorties, salle de bain, cuisine ou grenier — circulation d’air.",
    },
    en: {
      t: "Photograph ventilation",
      d: "Exhausts, bathroom, kitchen, or attic paths.",
    },
  },
};

const FINDING_COPY_FR: Record<QcSystemCode, string> = {
  electricite: "Ajouter un constat (note) pour l’électricité — zone tableau ou symptômes observés.",
  toiture: "Documenter la toiture : au moins une note dans une zone toiture.",
  structure: "Documenter structure / fondation / façade : note dans une zone du groupe.",
  plomberie: "Ajouter un constat plomberie avec note.",
  chauffage: "Ajouter un constat lié au chauffage (note dans salon, sous-sol, etc.).",
  isolation: "Ajouter un constat isolation / enveloppe (grenier, façade, sous-sol).",
  ventilation: "Ajouter un constat ventilation (SDB, cuisine, grenier…).",
};

const FINDING_COPY_EN: Record<QcSystemCode, string> = {
  electricite: "Add a finding (note) for electrical — panel zone or observed symptoms.",
  toiture: "Document the roof: at least one note in a roof-related zone.",
  structure: "Document structure: note in foundation, facade, or exterior zone.",
  plomberie: "Add a plumbing finding with a note.",
  chauffage: "Add a heating-related finding (note in basement, living area, etc.).",
  isolation: "Add an insulation / envelope finding (attic, facade, basement).",
  ventilation: "Add a ventilation finding (bath, kitchen, attic…).",
};

export type TerrainGuidePreferences = {
  strict_on_roof?: boolean;
};

/** Ordre dynamique (ex. toiture priorisée si l’utilisateur est strict sur la toiture). */
export function terrainSystemOrder(prefs?: TerrainGuidePreferences): QcSystemCode[] {
  const base = [...TERRAIN_GUIDE_SYSTEM_PRIORITY];
  if (prefs?.strict_on_roof) {
    return ["toiture", ...base.filter((c) => c !== "toiture")];
  }
  return base;
}

function pickFirstGap(
  byZone: Partial<Record<string, number>>,
  order: QcSystemCode[],
): QcSystemCode | null {
  const insufficient = findInsufficientQcPhotoCoverage(byZone);
  if (insufficient.length === 0) return null;
  for (const code of order) {
    if (insufficient.includes(code)) return code;
  }
  return insufficient[0] ?? null;
}

/**
 * Prochaine action terrain : photo manquante (QC), puis constat sans note.
 */
export function computeTerrainGuideStep(input: {
  entries: ReportEntryLike[];
  photosCoverageByZone: Partial<Record<string, number>>;
  /** Nombre de photos valides (url OK), pour le cas sans agrégation par zone. */
  validPhotoCount: number;
  preferences?: TerrainGuidePreferences;
}): TerrainGuideStep | null {
  const { entries, photosCoverageByZone, validPhotoCount, preferences } = input;
  const order = terrainSystemOrder(preferences);
  if (
    validPhotoCount === 0 &&
    Object.keys(photosCoverageByZone).length === 0
  ) {
    const code: QcSystemCode = preferences?.strict_on_roof ? "toiture" : "electricite";
    const z = QC_SYSTEM_ZONE_GROUPS[code][0]!;
    const c = PHOTO_COPY[code];
    return {
      kind: "photo",
      qc_system: code,
      suggested_zone: z,
      title_fr: c.fr.t,
      title_en: c.en.t,
      detail_fr: c.fr.d,
      detail_en: c.en.d,
      min_photos: QC_MIN_PHOTOS_BY_SYSTEM[code],
      current_photos: 0,
    };
  }

  const gap = pickFirstGap(photosCoverageByZone, order);
  if (gap) {
    const z = QC_SYSTEM_ZONE_GROUPS[gap][0]!;
    const c = PHOTO_COPY[gap];
    const min = QC_MIN_PHOTOS_BY_SYSTEM[gap];
    const cur = aggregatePhotosForQcSystem(photosCoverageByZone, gap);
    return {
      kind: "photo",
      qc_system: gap,
      suggested_zone: z,
      title_fr: c.fr.t,
      title_en: c.en.t,
      detail_fr: c.fr.d,
      detail_en: c.en.d,
      min_photos: min,
      current_photos: cur,
    };
  }

  const missingFinding = findMissingQcSystemSections(entries);
  if (missingFinding.length > 0) {
    let code: QcSystemCode = missingFinding[0]!;
    for (const c of order) {
      if (missingFinding.includes(c)) {
        code = c;
        break;
      }
    }
    const z = QC_SYSTEM_ZONE_GROUPS[code][0]!;
    return {
      kind: "finding",
      qc_system: code,
      suggested_zone: z,
      title_fr: "Compléter un constat",
      title_en: "Complete a finding",
      detail_fr: FINDING_COPY_FR[code],
      detail_en: FINDING_COPY_EN[code],
      min_photos: 0,
      current_photos: 0,
    };
  }

  return null;
}
