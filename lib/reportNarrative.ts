export type Severity = "low" | "medium" | "high";
export type ReportLanguage = "fr" | "en";
export type JurisdictionProfile = "ca_general" | "ca_qc";

export type IssueCode =
  | "water_infiltration"
  | "crack_wall"
  | "electrical_risk"
  | "humidity_mold"
  | "ventilation_issue"
  | "roof_wear"
  | "window_seal_failure"
  | "structure_movement";

export type ZoneCode =
  | "toiture"
  | "facade"
  | "salon"
  | "cuisine"
  | "salle_de_bain"
  | "sous_sol"
  | "installation_electrique"
  | "fondation";

export type ReportEntryInput = {
  zone: ZoneCode;
  issue: IssueCode;
  severity: Severity;
  note?: string;
};

export type ComplianceCheckStatus = "to_verify" | "non_compliant" | "compliant";

export type ComplianceCheckItem = {
  id: string;
  issue: IssueCode;
  title: string;
  requirement: string;
  status: ComplianceCheckStatus;
  reference_candidates: string[];
};

type IssueTemplate = {
  label: string;
  observation: string;
  analysis: string;
  recommendation: Record<Severity, string>;
};

type ZoneTemplate = {
  label: string;
};

export const ZONES: Array<{ value: ZoneCode; label: string }> = [
  { value: "toiture", label: "Toiture" },
  { value: "facade", label: "Facade" },
  { value: "salon", label: "Salon" },
  { value: "cuisine", label: "Cuisine" },
  { value: "salle_de_bain", label: "Salle de bain" },
  { value: "sous_sol", label: "Sous-sol" },
  { value: "installation_electrique", label: "Installation electrique" },
  { value: "fondation", label: "Fondation" },
];

export const ISSUES: Array<{ value: IssueCode; label: string }> = [
  { value: "water_infiltration", label: "Infiltration d'eau" },
  { value: "crack_wall", label: "Fissuration murale" },
  { value: "electrical_risk", label: "Risque electrique" },
  { value: "humidity_mold", label: "Humidite / moisissure" },
  { value: "ventilation_issue", label: "Ventilation insuffisante" },
  { value: "roof_wear", label: "Usure de toiture" },
  { value: "window_seal_failure", label: "Defaut d'etancheite fenetres" },
  { value: "structure_movement", label: "Mouvement structurel suspect" },
];

export const SEVERITIES: Array<{ value: Severity; label: string }> = [
  { value: "low", label: "Faible" },
  { value: "medium", label: "Moyenne" },
  { value: "high", label: "Elevee" },
];

const ZONE_MAP: Record<ZoneCode, ZoneTemplate> = Object.fromEntries(
  ZONES.map((z) => [z.value, { label: z.label }]),
) as Record<ZoneCode, ZoneTemplate>;

const ISSUE_MAP: Record<IssueCode, IssueTemplate> = {
  water_infiltration: {
    label: "Infiltration d'eau",
    observation:
      "Des indices d'infiltration d'eau sont visibles (traces, decoloration ou gonflement des materiaux).",
    analysis:
      "Cette condition suggere une perte d'etancheite active ou recurrente qui peut accelerer la degradation des composantes.",
    recommendation: {
      low: "Inspecter les joints et points singuliers dans un delai de 30 jours et corriger les faiblesses mineures.",
      medium:
        "Faire verifier l'origine de l'infiltration par un professionnel et corriger l'etancheite dans un delai court.",
      high: "Intervenir rapidement pour stopper l'entree d'eau et evaluer les dommages caches avant aggravation.",
    },
  },
  crack_wall: {
    label: "Fissuration murale",
    observation:
      "Des fissures sont observees sur les surfaces murales ou les joints de finition.",
    analysis:
      "Le patron de fissuration peut etre lie a des mouvements structuraux, au retrait des materiaux ou a des contraintes differencielles.",
    recommendation: {
      low: "Documenter l'evolution des fissures et reprendre les finitions non structurelles si la situation demeure stable.",
      medium:
        "Faire une evaluation technique pour distinguer les fissures esthetiques des fissures pouvant affecter la performance.",
      high: "Mandater rapidement un ingenieur en structure pour diagnostic et plan de correction.",
    },
  },
  electrical_risk: {
    label: "Risque electrique",
    observation:
      "Des anomalies electriques visibles ont ete constatees (composants inadequats, protection absente ou cablage apparent).",
    analysis:
      "La condition peut augmenter le risque de surchauffe, de panne ou d'evenement securitaire pour les occupants.",
    recommendation: {
      low: "Planifier une correction preventive avec un electricien qualifie.",
      medium:
        "Faire corriger les non-conformites par un electricien licence dans les meilleurs delais.",
      high: "Mettre en securite immediatement la zone concernee et faire intervenir un electricien en urgence.",
    },
  },
  humidity_mold: {
    label: "Humidite / moisissure",
    observation:
      "Des signes d'humidite persistante ou de croissance fongique sont visibles dans la zone inspectee.",
    analysis:
      "La presence d'humidite chronique favorise la deterioration des materiaux et peut affecter la qualite de l'air interieur.",
    recommendation: {
      low: "Ameliorer la ventilation locale et surveiller l'evolution de l'humidite.",
      medium:
        "Identifier la source d'humidite et traiter les surfaces atteintes selon les bonnes pratiques de remediation.",
      high: "Isoler la zone si necessaire et engager rapidement une remediation specialisee.",
    },
  },
  ventilation_issue: {
    label: "Ventilation insuffisante",
    observation:
      "Le renouvellement d'air semble insuffisant au regard des traces d'humidite ou d'odeurs persistantes.",
    analysis:
      "Une ventilation inadequate peut aggraver la condensation et reduire le confort ainsi que la durabilite des composantes.",
    recommendation: {
      low: "Optimiser l'utilisation des dispositifs de ventilation existants.",
      medium:
        "Verifier le debit et l'etat des systemes de ventilation, puis ajuster ou corriger.",
      high: "Revoir rapidement la strategie de ventilation avec un specialiste pour limiter les dommages acceleres.",
    },
  },
  roof_wear: {
    label: "Usure de toiture",
    observation:
      "Des indices d'usure des composantes de toiture sont visibles (revetement, solins ou elements d'etancheite).",
    analysis:
      "L'etat observe suggere une baisse de performance qui peut mener a des infiltrations en conditions severes.",
    recommendation: {
      low: "Prevoir un entretien correctif ponctuel a court terme.",
      medium:
        "Planifier une reparation cibler ou un remplacement partiel selon l'etendue.",
      high: "Programmer une intervention prioritaire sur l'enveloppe de toiture.",
    },
  },
  window_seal_failure: {
    label: "Defaut d'etancheite fenetres",
    observation:
      "Des defauts d'etancheite sont notes autour des ouvertures (joints fatigues, infiltration d'air ou d'eau).",
    analysis:
      "Cette condition peut entrainer des pertes energetiques, de la condensation et une degradation locale des finis.",
    recommendation: {
      low: "Entretenir ou reprendre les joints de calfeutrage deficients.",
      medium:
        "Faire corriger l'etancheite des ouvertures et verifier l'etat des cadrages.",
      high: "Intervenir rapidement pour retablir l'etancheite complete et limiter les dommages secondaires.",
    },
  },
  structure_movement: {
    label: "Mouvement structurel suspect",
    observation:
      "Des signes compatibles avec un mouvement structurel ont ete releves (deformation, desalignement ou fissures actives).",
    analysis:
      "La condition peut indiquer une contrainte structurale evolutive necessitant une verification specialisee.",
    recommendation: {
      low: "Surveiller avec releves periodiques et documenter toute progression visible.",
      medium:
        "Obtenir une evaluation technique ciblee pour statuer sur la stabilite locale.",
      high: "Demander une expertise structurale immediate et appliquer les mesures de mitigation recommandees.",
    },
  },
};

const SEVERITY_LABELS: Record<ReportLanguage, Record<Severity, string>> = {
  fr: { low: "Faible", medium: "Moyenne", high: "Elevee" },
  en: { low: "Low", medium: "Medium", high: "High" },
};

const ZONE_LABELS_EN: Record<ZoneCode, string> = {
  toiture: "Roof",
  facade: "Facade",
  salon: "Living room",
  cuisine: "Kitchen",
  salle_de_bain: "Bathroom",
  sous_sol: "Basement",
  installation_electrique: "Electrical installation",
  fondation: "Foundation",
};

const ISSUE_MAP_EN: Record<IssueCode, IssueTemplate> = {
  water_infiltration: {
    label: "Water infiltration",
    observation:
      "Signs of water infiltration are visible (stains, discoloration, or material swelling).",
    analysis:
      "This condition suggests active or recurring waterproofing failure that can accelerate component deterioration.",
    recommendation: {
      low: "Inspect joints and critical points within 30 days and correct minor weaknesses.",
      medium:
        "Have the infiltration source verified by a qualified professional and restore waterproofing quickly.",
      high:
        "Intervene immediately to stop water ingress and assess hidden damage before escalation.",
    },
  },
  crack_wall: {
    label: "Wall cracking",
    observation:
      "Cracks are visible on wall surfaces or finishing joints.",
    analysis:
      "The cracking pattern may be related to structural movement, material shrinkage, or differential stress.",
    recommendation: {
      low:
        "Track crack evolution and repair non-structural finishes if the situation remains stable.",
      medium:
        "Request a technical assessment to distinguish cosmetic cracks from performance-impacting cracks.",
      high:
        "Engage a structural engineer promptly for diagnosis and corrective plan.",
    },
  },
  electrical_risk: {
    label: "Electrical risk",
    observation:
      "Visible electrical anomalies were identified (inadequate components, missing protection, or exposed wiring).",
    analysis:
      "This condition may increase the risk of overheating, failure, or safety incidents for occupants.",
    recommendation: {
      low: "Plan preventive correction with a qualified electrician.",
      medium:
        "Have non-compliant items corrected by a licensed electrician as soon as possible.",
      high:
        "Secure the affected area immediately and call an electrician urgently.",
    },
  },
  humidity_mold: {
    label: "Humidity / mold",
    observation:
      "Signs of persistent moisture or fungal growth are visible in the inspected area.",
    analysis:
      "Chronic moisture can degrade materials and may affect indoor air quality.",
    recommendation: {
      low: "Improve local ventilation and monitor moisture progression.",
      medium:
        "Identify the moisture source and treat affected surfaces using proper remediation practices.",
      high:
        "Isolate the area if needed and engage specialized remediation promptly.",
    },
  },
  ventilation_issue: {
    label: "Insufficient ventilation",
    observation:
      "Air renewal appears insufficient based on moisture traces or persistent odors.",
    analysis:
      "Inadequate ventilation can worsen condensation and reduce comfort and component durability.",
    recommendation: {
      low: "Optimize use of existing ventilation devices.",
      medium:
        "Verify airflow rates and system condition, then adjust or correct as needed.",
      high:
        "Review ventilation strategy quickly with a specialist to limit accelerated damage.",
    },
  },
  roof_wear: {
    label: "Roof wear",
    observation:
      "Signs of wear are visible on roofing components (covering, flashing, or sealing elements).",
    analysis:
      "Observed condition suggests reduced performance that can lead to infiltration in severe weather.",
    recommendation: {
      low: "Schedule targeted corrective maintenance in the short term.",
      medium:
        "Plan targeted repairs or partial replacement based on extent.",
      high: "Prioritize intervention on the roofing envelope.",
    },
  },
  window_seal_failure: {
    label: "Window seal failure",
    observation:
      "Sealing defects are noted around openings (aged joints, air or water leakage).",
    analysis:
      "This condition can cause energy loss, condensation, and local finish deterioration.",
    recommendation: {
      low: "Maintain or renew deficient caulking joints.",
      medium:
        "Correct opening airtightness/watertightness and verify frame condition.",
      high:
        "Intervene rapidly to restore full sealing and limit secondary damage.",
    },
  },
  structure_movement: {
    label: "Suspected structural movement",
    observation:
      "Signs consistent with structural movement were observed (deformation, misalignment, or active cracking).",
    analysis:
      "This condition may indicate evolving structural stress requiring specialized verification.",
    recommendation: {
      low:
        "Monitor with periodic records and document any visible progression.",
      medium:
        "Request a targeted technical assessment to determine local stability.",
      high:
        "Request immediate structural expertise and apply recommended mitigation measures.",
    },
  },
};

export function normalizeReportLanguage(value: unknown): ReportLanguage {
  return value === "en" ? "en" : "fr";
}

export function normalizeJurisdictionProfile(value: unknown): JurisdictionProfile {
  if (value === "ca_qc") return "ca_qc";
  return "ca_general";
}

function baseReferencesForIssue(issue: IssueCode): string[] {
  switch (issue) {
    case "electrical_risk":
      return [
        "CSA C22.1 - Canadian Electrical Code, Part I",
        "Local/provincial electrical safety authority requirements",
      ];
    case "water_infiltration":
    case "roof_wear":
    case "window_seal_failure":
      return [
        "National Building Code of Canada (NBC), Part 5/9 (envelope and moisture control)",
        "Manufacturer installation instructions and maintenance requirements",
      ];
    case "humidity_mold":
    case "ventilation_issue":
      return [
        "NBC Part 6/9 (HVAC and ventilation requirements)",
        "Health authority guidance for indoor air quality and mold remediation",
      ];
    case "crack_wall":
    case "structure_movement":
      return [
        "NBC Part 4/9 (structural safety requirements)",
        "Engineer assessment requirements where structural risk is suspected",
      ];
    default:
      return ["Applicable Canadian building and safety regulations"];
  }
}

function jurisdictionTag(jurisdiction: JurisdictionProfile): string {
  return jurisdiction === "ca_qc"
    ? "Quebec adaptations (CCQ/RBQ requirements to validate)"
    : "Provincial/territorial requirements to validate";
}

function complianceTexts(
  issue: IssueCode,
  language: ReportLanguage,
): { title: string; requirement: string } {
  const mapFr: Record<IssueCode, { title: string; requirement: string }> = {
    water_infiltration: {
      title: "Etancheite et infiltration d'eau",
      requirement:
        "Verifier la conformite de l'enveloppe (toiture, joints, ouvertures) et documenter les correctifs requis.",
    },
    crack_wall: {
      title: "Fissures et stabilite des parois",
      requirement:
        "Evaluer si les fissures sont esthetiques ou structurelles et exiger une verification technique si doute.",
    },
    electrical_risk: {
      title: "Securite electrique",
      requirement:
        "Confirmer la conformite des installations electriques par un maitre electricien/licencie selon juridiction.",
    },
    humidity_mold: {
      title: "Humidite, moisissures et salubrite",
      requirement:
        "Identifier la source d'humidite, verifier ventilation/extraction et definir les travaux de remediation.",
    },
    ventilation_issue: {
      title: "Ventilation et qualite de l'air",
      requirement:
        "Verifier debit et fonctionnement de la ventilation selon usage du local et exigences applicables.",
    },
    roof_wear: {
      title: "Integrite de la toiture",
      requirement:
        "Verifier l'etat des composantes de toiture et planifier reparation/remplacement conforme.",
    },
    window_seal_failure: {
      title: "Etancheite des ouvertures",
      requirement:
        "Valider les performances d'etancheite a l'air/eau des fenetres et corriger les defauts observes.",
    },
    structure_movement: {
      title: "Mouvement structurel",
      requirement:
        "Obtenir une evaluation d'ingenierie si signes de mouvement actif ou risque pour la securite.",
    },
  };

  const mapEn: Record<IssueCode, { title: string; requirement: string }> = {
    water_infiltration: {
      title: "Waterproofing and infiltration",
      requirement:
        "Verify envelope compliance (roof, joints, openings) and document required corrective work.",
    },
    crack_wall: {
      title: "Cracks and wall stability",
      requirement:
        "Assess whether cracks are cosmetic or structural and require technical review when uncertain.",
    },
    electrical_risk: {
      title: "Electrical safety",
      requirement:
        "Confirm electrical compliance through a licensed electrician according to local jurisdiction.",
    },
    humidity_mold: {
      title: "Moisture, mold, and habitability",
      requirement:
        "Identify moisture source, verify ventilation/extraction, and define remediation scope.",
    },
    ventilation_issue: {
      title: "Ventilation and indoor air quality",
      requirement:
        "Verify ventilation rate and operation for the occupancy and applicable requirements.",
    },
    roof_wear: {
      title: "Roof integrity",
      requirement:
        "Validate roofing component condition and plan compliant repair/replacement.",
    },
    window_seal_failure: {
      title: "Window opening airtightness/watertightness",
      requirement:
        "Validate airtightness/watertightness performance and correct observed defects.",
    },
    structure_movement: {
      title: "Structural movement",
      requirement:
        "Obtain engineering review when active movement or safety risk indicators are present.",
    },
  };

  return language === "en" ? mapEn[issue] : mapFr[issue];
}

export function buildComplianceChecklist(
  entries: ReportEntryInput[],
  language: ReportLanguage,
  jurisdiction: JurisdictionProfile,
): ComplianceCheckItem[] {
  const seen = new Set<IssueCode>();
  const result: ComplianceCheckItem[] = [];
  for (const entry of entries) {
    if (seen.has(entry.issue)) continue;
    seen.add(entry.issue);
    const text = complianceTexts(entry.issue, language);
    result.push({
      id: `check_${entry.issue}`,
      issue: entry.issue,
      title: text.title,
      requirement: text.requirement,
      status: "to_verify",
      reference_candidates: [
        ...baseReferencesForIssue(entry.issue),
        jurisdictionTag(jurisdiction),
      ],
    });
  }
  return result;
}

function severityLabel(severity: Severity, language: ReportLanguage): string {
  return SEVERITY_LABELS[language][severity];
}

export function getRiskLevel(entries: ReportEntryInput[]): Severity {
  if (entries.some((e) => e.severity === "high")) return "high";
  if (entries.some((e) => e.severity === "medium")) return "medium";
  return "low";
}

export function buildStructuredReport(
  entries: ReportEntryInput[],
  language: ReportLanguage = "fr",
  jurisdiction: JurisdictionProfile = "ca_general",
) {
  const issueMap = language === "en" ? ISSUE_MAP_EN : ISSUE_MAP;
  const sections = entries.map((entry, idx) => {
    const zone = ZONE_MAP[entry.zone];
    const issue = issueMap[entry.issue];
    const zoneLabel = language === "en"
      ? ZONE_LABELS_EN[entry.zone]
      : zone.label;
    const note = entry.note?.trim();
    const suffix = note
      ? (language === "en" ? ` Field note: ${note}.` : ` Note terrain: ${note}.`)
      : "";
    return {
      title: `${zoneLabel} - ${issue.label}`,
      observation: issue.observation + suffix,
      analysis: issue.analysis,
      recommendation: issue.recommendation[entry.severity],
      severity: severityLabel(entry.severity, language),
      order: idx + 1,
    };
  });

  const risk = getRiskLevel(entries);
  const summary =
    entries.length === 0
      ? (language === "en"
        ? "No structured observation has been added."
        : "Aucune observation structuree n'a ete ajoutee.")
      : (language === "en"
        ? `${entries.length} structured observation(s) were generated automatically. Overall risk level: ${
          severityLabel(
            risk,
            language,
          ).toLowerCase()
        }.`
        : `${entries.length} observation(s) structuree(s) ont ete generees automatiquement. Niveau de risque global: ${
          severityLabel(
            risk,
            language,
          ).toLowerCase()
        }.`);

  return {
    sections,
    summary,
    risk_level: risk,
    compliance: {
      jurisdiction,
      legal_notice: language === "en"
        ? "This automated content is a decision-support draft and does not constitute legal certification. Final compliance validation must be performed by a qualified professional according to applicable laws and regulations."
        : "Ce contenu automatise est un brouillon d'aide a la decision et ne constitue pas une certification legale. La validation finale de conformite doit etre faite par un professionnel qualifie selon les lois et reglements applicables.",
      checklist: buildComplianceChecklist(entries, language, jurisdiction),
    },
  };
}
