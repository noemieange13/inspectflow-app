/**
 * Données de couverture / en-tête pour rapports d'inspection (modèle type Word QC).
 * Stockées dans `reports.payload.cover_v1` (JSON).
 */
export const COVER_PAYLOAD_KEY = "cover_v1" as const;

/** Snapshot inspecteur + logo stocké dans `reports.payload.inspector_profile_v1` (PDF / couverture). */
export const INSPECTOR_PROFILE_PAYLOAD_KEY = "inspector_profile_v1" as const;

export type FacadeOrientation = "nord" | "sud" | "est" | "ouest" | "";

export type InspectorProfileV1 = {
  nom: string;
  numero_certification: string;
  compagnie: string;
  /** Data URL image (léger de préférence) */
  logo_data_url: string | null;
};

export const INSPECTOR_PROFILE_STORAGE_KEY = "inspectflow:inspector_profile_v1";

export type CoverDescriptionMode = "manuel" | "photos_ia";

export type InspectionCoverPayloadV1 = {
  schema_version: 1;
  /** Requérant(s) — obligatoire */
  requerants: string;
  conditions_meteo: string;
  /** Affichage + ISO optionnel */
  date_heure_affichage: string;
  date_heure_iso: string | null;
  duree_inspection: string;
  inspecteur_nom: string;
  inspecteur_numero_certification: string;
  compagnie: string;
  intervenants_sur_place: string;
  propriete: {
    adresse: string;
    type_propriete: string;
    annee_construction: string;
    client_nom: string;
    client_telephone: string;
    client_courriel: string;
  };
  description_sommaire: {
    mode: CoverDescriptionMode;
    type_maison: string;
    construit_en: string;
    facade: string;
    cotes: string;
    arriere: string;
    toiture: string;
    type_fondation: string;
    type_structure: string;
    chauffage: string;
  };
  condition_generale: string;
  orientation_facade: FacadeOrientation;
  /** Pistes pour futures intégrations IA (non bloquant) */
  ia_hints?: {
    dv_photo_imported?: boolean;
    photos_description_imported?: boolean;
    photos_condition_imported?: boolean;
    orientation_auto?: boolean;
  };
  conformite_juridiction: "ca_qc" | "ca_general";
  notes_conformite: string;
};

export function defaultCoverPayloadV1(): InspectionCoverPayloadV1 {
  const now = new Date();
  return {
    schema_version: 1,
    requerants: "",
    conditions_meteo: "",
    date_heure_affichage: formatFrDateTime(now),
    date_heure_iso: now.toISOString(),
    duree_inspection: "",
    inspecteur_nom: "",
    inspecteur_numero_certification: "",
    compagnie: "",
    intervenants_sur_place: "",
    propriete: {
      adresse: "",
      type_propriete: "",
      annee_construction: "",
      client_nom: "",
      client_telephone: "",
      client_courriel: "",
    },
    description_sommaire: {
      mode: "manuel",
      type_maison: "",
      construit_en: "",
      facade: "",
      cotes: "",
      arriere: "",
      toiture: "",
      type_fondation: "",
      type_structure: "",
      chauffage: "",
    },
    condition_generale: "",
    orientation_facade: "",
    conformite_juridiction: "ca_qc",
    notes_conformite: defaultComplianceNote("ca_qc"),
  };
}

export function defaultComplianceNote(j: "ca_qc" | "ca_general"): string {
  if (j === "ca_qc") {
    return (
      "Document d'inspection visuelle — non juridique. Au Québec, les inspecteurs doivent se conformer aux exigences " +
      "de la norme de pratique en vigueur (échéance réglementaire 2027 pour la conformité à la nouvelle norme). " +
      "Valider toute obligation légale, réglementaire ou contractuelle sur place."
    );
  }
  return (
    "Document d'inspection visuelle — non juridique. Références aux codes du bâtiment (CNB, provincial, CSA) " +
    "à valider sur le terrain selon la province et la juridiction applicables."
  );
}

export function formatFrDateTime(d: Date): string {
  return d.toLocaleString("fr-CA", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

export function loadInspectorProfile(): InspectorProfileV1 | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(INSPECTOR_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<InspectorProfileV1>;
    if (typeof p.nom !== "string") return null;
    return {
      nom: p.nom,
      numero_certification: typeof p.numero_certification === "string" ? p.numero_certification : "",
      compagnie: typeof p.compagnie === "string" ? p.compagnie : "",
      logo_data_url: typeof p.logo_data_url === "string" ? p.logo_data_url : null,
    };
  } catch {
    return null;
  }
}

export function saveInspectorProfile(p: InspectorProfileV1): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(INSPECTOR_PROFILE_STORAGE_KEY, JSON.stringify(p));
}

function normalizeFacadeOrientation(v: unknown): FacadeOrientation {
  return v === "nord" || v === "sud" || v === "est" || v === "ouest" || v === "" ? v : "";
}

/**
 * Valide et normalise un objet `cover_v1` venant de la base ou d’un export JSON.
 */
export function parseCoverV1FromUnknown(raw: unknown): InspectionCoverPayloadV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== 1) return null;
  const base = defaultCoverPayloadV1();
  const merged = {
    ...base,
    ...o,
    propriete: {
      ...base.propriete,
      ...(typeof o.propriete === "object" && o.propriete !== null
        ? (o.propriete as Partial<InspectionCoverPayloadV1["propriete"]>)
        : {}),
    },
    description_sommaire: {
      ...base.description_sommaire,
      ...(typeof o.description_sommaire === "object" && o.description_sommaire !== null
        ? (o.description_sommaire as Partial<InspectionCoverPayloadV1["description_sommaire"]>)
        : {}),
    },
  } as InspectionCoverPayloadV1;
  merged.schema_version = 1;
  merged.orientation_facade = normalizeFacadeOrientation(o.orientation_facade);
  merged.conformite_juridiction =
    o.conformite_juridiction === "ca_general" ? "ca_general" : "ca_qc";
  const mode = merged.description_sommaire.mode;
  merged.description_sommaire.mode = mode === "photos_ia" ? "photos_ia" : "manuel";
  if (typeof merged.notes_conformite !== "string" || !merged.notes_conformite.trim()) {
    merged.notes_conformite = defaultComplianceNote(merged.conformite_juridiction);
  }
  return merged;
}

export function parseInspectorProfileFromUnknown(raw: unknown): InspectorProfileV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    nom: typeof o.nom === "string" ? o.nom : "",
    numero_certification:
      typeof o.numero_certification === "string" ? o.numero_certification : "",
    compagnie: typeof o.compagnie === "string" ? o.compagnie : "",
    logo_data_url: typeof o.logo_data_url === "string" ? o.logo_data_url : null,
  };
}
