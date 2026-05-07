import type { LimitationChecklistId } from "@/lib/limitations";

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
  /** Signature scan / image (data URL), optionnel — PDF premium */
  signature_data_url?: string | null;
};

export const INSPECTOR_PROFILE_STORAGE_KEY = "inspectflow:inspector_profile_v1";

export type CoverDescriptionMode = "manuel" | "photos_ia";

/** Province ou territoire — clause de conformité par défaut pour la page couverture. */
export const COMPLIANCE_JURISDICTIONS = [
  "ca_qc",
  "ca_on",
  "ca_bc",
  "ca_ab",
  "ca_mb",
  "ca_sk",
  "ca_ns",
  "ca_nb",
  "ca_pe",
  "ca_nl",
  "ca_nt",
  "ca_yt",
  "ca_nu",
  "ca_general",
] as const;

export type ComplianceJurisdiction = (typeof COMPLIANCE_JURISDICTIONS)[number];

/** Libellés UI province / territoire (PDF, formulaires, résumé). */
export const COMPLIANCE_LABELS: Record<ComplianceJurisdiction, string> = {
  ca_qc: "Québec (norme de pratique, échéance 2027)",
  ca_on: "Ontario",
  ca_bc: "Colombie-Britannique",
  ca_ab: "Alberta",
  ca_mb: "Manitoba",
  ca_sk: "Saskatchewan",
  ca_ns: "Nouvelle-Écosse",
  ca_nb: "Nouveau-Brunswick",
  ca_pe: "Île-du-Prince-Édouard",
  ca_nl: "Terre-Neuve-et-Labrador",
  ca_nt: "Territoires du Nord-Ouest",
  ca_yt: "Yukon",
  ca_nu: "Nunavut",
  ca_general: "Canada (général / hors liste)",
};

const COMPLIANCE_SET = new Set<string>(COMPLIANCE_JURISDICTIONS);

/** Version sémantique des textes de conformité (évolution réglementaire, etc.). */
export const COMPLIANCE_TEMPLATE_VERSION = "2026.1";

/** Bloc audit : clause modèle vs texte affiché (traçabilité). */
export type ComplianceBlockV1 = {
  schema_version: 1;
  template_version: string;
  jurisdiction: ComplianceJurisdiction;
  /** Texte de référence généré pour cette juridiction au moment du choix / migration. */
  default_note: string;
  /** Texte réellement exposé (PDF / formulaire) — en général `notes_conformite`. */
  user_note: string;
  is_user_modified: boolean;
};

/** Mode d'export / grille de validation (traçabilité — distinct de la province affichée). */
export type ComplianceExportMode = "QC_2027" | "CA_STANDARD";

export type ComplianceProfileV1 = {
  schema_version: 1;
  mode: ComplianceExportMode;
  /** Référence pack clauses (PDF + readiness). */
  clauses_pack_version: string;
};

export type ReadinessAckV1 = {
  schema_version: 1;
  /** Horodatage ISO — l'inspecteur confirme avoir relu / accepté l'état courant. */
  acknowledged_at: string;
  /** Score readiness (avertissements non « acceptés » dans le calcul) au moment de l'accusé. */
  score_at_ack?: number;
  /** Codes d'avertissement présents à l'accusé (ordre libre ; comparaison triée côté app). */
  warning_codes_at_ack?: string[];
};

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
  /** Texte unique « résumé » pour la description (prioritaire sur l'assemblage des sous-champs). */
  generated_description_text?: string | null;
  orientation_facade: FacadeOrientation;
  /** Pistes pour futures intégrations IA (non bloquant) */
  ia_hints?: {
    dv_photo_imported?: boolean;
    photos_description_imported?: boolean;
    photos_condition_imported?: boolean;
    notes_voice_imported?: boolean;
    orientation_auto?: boolean;
  };
  conformite_juridiction: ComplianceJurisdiction;
  notes_conformite: string;
  /** Métadonnées conformité (audit / rollback futurs) — optionnel pour anciens exports. */
  compliance_block_v1?: ComplianceBlockV1;
  /** Accusé de lecture (go 8 — export PDF avec avertissements seulement si non bloquant). */
  readiness_ack_v1?: ReadinessAckV1;
  /** Codes d'avertissement traités lors du dernier accusé (analytics / affinage futur du score). */
  last_reviewed_fields?: string[];
  /** Limitations d'inspection (obligatoires QC — voir readiness `limitations`). */
  limitations_free_text: string;
  limitations_checklist: Partial<Record<LimitationChecklistId, boolean>>;
  /** Profil compliance explicite (audit / produit). */
  compliance_profile_v1?: ComplianceProfileV1;
};

export function getComplianceExportMode(cover: InspectionCoverPayloadV1): ComplianceExportMode {
  const p = cover.compliance_profile_v1;
  if (p?.schema_version === 1 && (p.mode === "QC_2027" || p.mode === "CA_STANDARD")) {
    return p.mode;
  }
  return cover.conformite_juridiction === "ca_qc" ? "QC_2027" : "CA_STANDARD";
}

export function buildComplianceBlockV1(
  jurisdiction: ComplianceJurisdiction,
  userNote: string,
): ComplianceBlockV1 {
  const defs = defaultComplianceNote(jurisdiction);
  const un = userNote.trim() || defs;
  return {
    schema_version: 1,
    template_version: COMPLIANCE_TEMPLATE_VERSION,
    jurisdiction,
    default_note: defs,
    user_note: un,
    is_user_modified: un.trim() !== defs.trim(),
  };
}

/** Texte de conformité affiché (préfère le bloc audit si présent). */
export function effectiveComplianceNote(cover: InspectionCoverPayloadV1): string {
  const fromBlock = cover.compliance_block_v1?.user_note?.trim();
  if (fromBlock) return fromBlock;
  return cover.notes_conformite.trim();
}

export function defaultCoverPayloadV1(): InspectionCoverPayloadV1 {
  const now = new Date();
  const qcNote = defaultComplianceNote("ca_qc");
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
    notes_conformite: qcNote,
    compliance_block_v1: buildComplianceBlockV1("ca_qc", qcNote),
    limitations_free_text: "",
    limitations_checklist: {},
    compliance_profile_v1: {
      schema_version: 1,
      mode: "QC_2027",
      clauses_pack_version: "QC_2027_v1",
    },
  };
}

/**
 * État initial du formulaire couverture côté Next (composant client SSR).
 * `defaultCoverPayloadV1()` fixe date/heure avec `new Date()` : le HTML serveur et le premier
 * rendu client diffèrent → erreur d'hydratation React (ex. #418). Les champs date restent
 * vides jusqu'au `useEffect` qui applique soit le rapport, soit l'horodatage auto.
 */
export function hydrationSafeInitialCoverPayloadV1(): InspectionCoverPayloadV1 {
  const base = defaultCoverPayloadV1();
  return {
    ...base,
    date_heure_affichage: "",
    date_heure_iso: "",
  };
}

export function defaultComplianceNote(j: ComplianceJurisdiction): string {
  const base =
    "Document d'inspection visuelle — non juridique. Ce rapport ne remplace pas les avis de professionnels désignés ni les exigences des autorités compétentes. ";

  switch (j) {
    case "ca_qc":
      return (
        base +
        "Au Québec, les inspecteurs en bâtiment doivent respecter la norme de pratique applicable (échéance réglementaire 2027 pour la conformité à la nouvelle norme). " +
        "Vérifier lois, règlements municipaux et obligations contractuelles sur place."
      );
    case "ca_on":
      return (
        base +
        "En Ontario, croiser avec le Code du bâtiment de l'Ontario, les règlements locaux et les normes CSA applicables."
      );
    case "ca_bc":
      return (
        base +
        "En Colombie-Britannique, valider avec le BC Building Code, les exigences locales (y compris séismiques/zonage) et les référentiels professionnels pertinents."
      );
    case "ca_ab":
      return (
        base +
        "En Alberta, référencer le National Building Code — Alberta Edition et les exigences municipales."
      );
    case "ca_mb":
      return (
        base +
        "Au Manitoba, croiser avec le Manitoba Building Code et les règlements de la juridiction."
      );
    case "ca_sk":
      return (
        base +
        "En Saskatchewan, valider avec le National Building Code — Saskatchewan et les autorités locales."
      );
    case "ca_ns":
    case "ca_nb":
    case "ca_pe":
    case "ca_nl":
      return (
        base +
        "Dans les provinces atlantiques, appliquer le Code national du bâtiment (adaptations provinciales) et les règlements locaux."
      );
    case "ca_nt":
    case "ca_yt":
    case "ca_nu":
      return (
        base +
        "Dans les territoires, le Code national du bâtiment et les lois territoriales prévalent ; confirmer les exigences locales et climatiques."
      );
    case "ca_general":
      return (
        base +
        "Références aux codes du bâtiment (CNB, adaptations provinciales/territoriales, CSA) à valider selon la juridiction réelle du bien."
      );
  }
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

/** Retourne `false` si le navigateur refuse l'écriture (quota, mode privé, etc.). */
export function saveInspectorProfile(p: InspectorProfileV1): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(INSPECTOR_PROFILE_STORAGE_KEY, JSON.stringify(p));
    return true;
  } catch {
    return false;
  }
}

function normalizeFacadeOrientation(v: unknown): FacadeOrientation {
  return v === "nord" || v === "sud" || v === "est" || v === "ouest" || v === "" ? v : "";
}

function normalizeComplianceJurisdiction(v: unknown): ComplianceJurisdiction {
  if (typeof v === "string" && COMPLIANCE_SET.has(v)) {
    return v as ComplianceJurisdiction;
  }
  /* Ancien schéma à deux valeurs */
  if (v === "ca_general") {
    return "ca_general";
  }
  return "ca_qc";
}

/**
 * Valide et normalise un objet `cover_v1` venant de la base ou d'un export JSON.
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
  merged.conformite_juridiction = normalizeComplianceJurisdiction(
    o.conformite_juridiction,
  );
  const mode = merged.description_sommaire.mode;
  merged.description_sommaire.mode = mode === "photos_ia" ? "photos_ia" : "manuel";
  if (typeof merged.notes_conformite !== "string" || !merged.notes_conformite.trim()) {
    merged.notes_conformite = defaultComplianceNote(merged.conformite_juridiction);
  }

  merged.compliance_block_v1 = normalizeComplianceBlockV1(
    o.compliance_block_v1,
    merged.conformite_juridiction,
    merged.notes_conformite,
  );
  merged.notes_conformite = merged.compliance_block_v1.user_note;

  if (typeof o.generated_description_text === "string") {
    merged.generated_description_text = o.generated_description_text;
  }

  const ra = o.readiness_ack_v1;
  if (
    ra &&
    typeof ra === "object" &&
    (ra as ReadinessAckV1).schema_version === 1 &&
    typeof (ra as ReadinessAckV1).acknowledged_at === "string"
  ) {
    const rawAck = ra as ReadinessAckV1 & { score_at_ack?: unknown; warning_codes_at_ack?: unknown };
    merged.readiness_ack_v1 = {
      schema_version: 1,
      acknowledged_at: rawAck.acknowledged_at.trim(),
    };
    if (typeof rawAck.score_at_ack === "number" && Number.isFinite(rawAck.score_at_ack)) {
      merged.readiness_ack_v1.score_at_ack = Math.round(rawAck.score_at_ack);
    }
    if (Array.isArray(rawAck.warning_codes_at_ack)) {
      const codes = rawAck.warning_codes_at_ack
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 64);
      if (codes.length > 0) merged.readiness_ack_v1.warning_codes_at_ack = codes;
    }
  }

  if (Array.isArray(o.last_reviewed_fields)) {
    merged.last_reviewed_fields = o.last_reviewed_fields
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 64);
  }

  if (typeof o.limitations_free_text === "string") {
    merged.limitations_free_text = o.limitations_free_text;
  }
  if (o.limitations_checklist && typeof o.limitations_checklist === "object") {
    const lc = o.limitations_checklist as Record<string, unknown>;
    const next: Partial<Record<LimitationChecklistId, boolean>> = {
      ...merged.limitations_checklist,
    };
    for (const k of Object.keys(lc)) {
      if (lc[k] === true) {
        (next as Record<string, boolean>)[k] = true;
      }
    }
    merged.limitations_checklist = next;
  }

  const cpRaw = o.compliance_profile_v1;
  if (cpRaw && typeof cpRaw === "object") {
    const cpr = cpRaw as Record<string, unknown>;
    if (cpr.schema_version === 1) {
      const mode =
        cpr.mode === "CA_STANDARD" ? "CA_STANDARD" : "QC_2027";
      const clauses_pack_version =
        typeof cpr.clauses_pack_version === "string"
          ? cpr.clauses_pack_version
          : "QC_2027_v1";
      merged.compliance_profile_v1 = {
        schema_version: 1,
        mode,
        clauses_pack_version,
      };
    }
  }
  if (!merged.compliance_profile_v1) {
    merged.compliance_profile_v1 = {
      schema_version: 1,
      mode: merged.conformite_juridiction === "ca_qc" ? "QC_2027" : "CA_STANDARD",
      clauses_pack_version: "QC_2027_v1",
    };
  }

  return merged;
}

function normalizeComplianceBlockV1(
  raw: unknown,
  jurisdiction: ComplianceJurisdiction,
  notesFallback: string,
): ComplianceBlockV1 {
  const defs = defaultComplianceNote(jurisdiction);
  if (raw && typeof raw === "object") {
    const b = raw as Record<string, unknown>;
    if (b.schema_version === 1) {
      const userNote = typeof b.user_note === "string" ? b.user_note : notesFallback;
      const defaultNote =
        typeof b.default_note === "string" ? b.default_note : defs;
      const ju = normalizeComplianceJurisdiction(b.jurisdiction ?? jurisdiction);
      const un = userNote.trim() || defs;
      return {
        schema_version: 1,
        template_version:
          typeof b.template_version === "string"
            ? b.template_version
            : COMPLIANCE_TEMPLATE_VERSION,
        jurisdiction: ju,
        default_note: defaultNote,
        user_note: un,
        is_user_modified:
          Boolean(b.is_user_modified) || un.trim() !== defaultNote.trim(),
      };
    }
  }
  return buildComplianceBlockV1(jurisdiction, notesFallback);
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
    signature_data_url: typeof o.signature_data_url === "string"
      ? o.signature_data_url
      : null,
  };
}
