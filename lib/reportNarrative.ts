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
  | "structure_movement"
  | "plumbing_issue"
  | "insulation_deficiency"
  | "fire_safety"
  | "exterior_damage"
  | "other";

export type ZoneCode =
  | "toiture"
  | "facade"
  | "salon"
  | "cuisine"
  | "salle_de_bain"
  | "sous_sol"
  | "installation_electrique"
  | "fondation"
  | "garage"
  | "exterieur"
  | "plomberie"
  | "grenier"
  | "autre";

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
  { value: "facade", label: "Façade" },
  { value: "salon", label: "Salon" },
  { value: "cuisine", label: "Cuisine" },
  { value: "salle_de_bain", label: "Salle de bain" },
  { value: "sous_sol", label: "Sous-sol" },
  { value: "installation_electrique", label: "Installation électrique" },
  { value: "fondation", label: "Fondation" },
  { value: "garage", label: "Garage" },
  { value: "exterieur", label: "Extérieur / terrain" },
  { value: "plomberie", label: "Plomberie" },
  { value: "grenier", label: "Grenier / combles" },
  { value: "autre", label: "Autre" },
];

export const ISSUES: Array<{ value: IssueCode; label: string }> = [
  { value: "water_infiltration", label: "Infiltration d'eau" },
  { value: "crack_wall", label: "Fissuration murale" },
  { value: "electrical_risk", label: "Risque électrique" },
  { value: "humidity_mold", label: "Humidité / moisissure" },
  { value: "ventilation_issue", label: "Ventilation insuffisante" },
  { value: "roof_wear", label: "Usure de toiture" },
  { value: "window_seal_failure", label: "Défaut d'étanchéité fenêtres" },
  { value: "structure_movement", label: "Mouvement structurel suspect" },
  { value: "plumbing_issue", label: "Problème de plomberie" },
  { value: "insulation_deficiency", label: "Déficience d'isolation" },
  { value: "fire_safety", label: "Sécurité incendie" },
  { value: "exterior_damage", label: "Dommage extérieur" },
  { value: "other", label: "Autre constat" },
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
  plumbing_issue: {
    label: "Probleme de plomberie",
    observation:
      "Des anomalies de plomberie ont ete constatees (fuites, corrosion, raccords non conformes ou drainage insuffisant).",
    analysis:
      "Les defauts de plomberie peuvent entrainer des dommages par l'eau, une perte de pression ou un risque sanitaire.",
    recommendation: {
      low: "Planifier une verification par un plombier qualifie dans les 30 jours.",
      medium: "Faire corriger les anomalies par un plombier licencie dans un delai court.",
      high: "Couper l'alimentation si necessaire et faire intervenir un plombier en urgence.",
    },
  },
  insulation_deficiency: {
    label: "Deficience d'isolation",
    observation:
      "L'isolation thermique semble insuffisante ou degradee dans la zone inspectee (ponts thermiques, materiaux absents ou affaisses).",
    analysis:
      "Une isolation deficiente augmente les pertes energetiques et peut favoriser la condensation et les moisissures.",
    recommendation: {
      low: "Evaluer la performance thermique et planifier une amelioration lors de travaux futurs.",
      medium: "Faire verifier et completer l'isolation par un professionnel qualifie.",
      high: "Corriger rapidement les zones non isolees pour prevenir des dommages structurels ou sanitaires.",
    },
  },
  fire_safety: {
    label: "Securite incendie",
    observation:
      "Des lacunes en matiere de securite incendie ont ete relevees (detecteurs absents, issues obstruees, materiaux non conformes).",
    analysis:
      "Ces conditions peuvent compromettre l'evacuation et augmenter le risque en cas d'incendie.",
    recommendation: {
      low: "Verifier et mettre a jour les detecteurs de fumee et le plan d'evacuation.",
      medium: "Faire corriger les non-conformites par un professionnel en securite incendie.",
      high: "Intervenir immediatement pour retablir les conditions minimales de securite incendie.",
    },
  },
  exterior_damage: {
    label: "Dommage exterieur",
    observation:
      "Des dommages sont visibles sur les composantes exterieures (revetement, balcon, escalier, terrain ou drainage).",
    analysis:
      "L'etat observe peut affecter l'integrite de l'enveloppe du batiment et la securite des occupants.",
    recommendation: {
      low: "Planifier un entretien correctif saisonnier.",
      medium: "Faire evaluer et reparer par un entrepreneur qualifie.",
      high: "Securiser la zone et programmer une reparation prioritaire.",
    },
  },
  other: {
    label: "Autre constat",
    observation:
      "Un constat ne correspondant pas aux categories predefinies a ete releve lors de l'inspection.",
    analysis:
      "Ce constat merite une attention particuliere et pourrait necessiter une evaluation specialisee.",
    recommendation: {
      low: "Documenter et surveiller l'evolution.",
      medium: "Consulter un professionnel pour evaluation approfondie.",
      high: "Faire evaluer en priorite par un specialiste du domaine concerne.",
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
  garage: "Garage",
  exterieur: "Exterior / grounds",
  plomberie: "Plumbing",
  grenier: "Attic",
  autre: "Other",
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
      low: "Monitor with periodic records and document any visible progression.",
      medium: "Request a targeted technical assessment to determine local stability.",
      high: "Request immediate structural expertise and apply recommended mitigation measures.",
    },
  },
  plumbing_issue: {
    label: "Plumbing issue",
    observation: "Plumbing anomalies were identified (leaks, corrosion, non-compliant connections, or insufficient drainage).",
    analysis: "Plumbing defects can lead to water damage, pressure loss, or sanitary risk.",
    recommendation: {
      low: "Schedule a plumber inspection within 30 days.",
      medium: "Have anomalies corrected by a licensed plumber promptly.",
      high: "Shut off water supply if needed and call a plumber urgently.",
    },
  },
  insulation_deficiency: {
    label: "Insulation deficiency",
    observation: "Thermal insulation appears insufficient or degraded in the inspected area (thermal bridges, missing or sagging material).",
    analysis: "Deficient insulation increases energy loss and can promote condensation and mold growth.",
    recommendation: {
      low: "Assess thermal performance and plan improvement during future work.",
      medium: "Have insulation verified and supplemented by a qualified professional.",
      high: "Correct uninsulated areas promptly to prevent structural or health damage.",
    },
  },
  fire_safety: {
    label: "Fire safety",
    observation: "Fire safety gaps were identified (missing detectors, obstructed exits, non-compliant materials).",
    analysis: "These conditions can compromise evacuation and increase risk in case of fire.",
    recommendation: {
      low: "Verify and update smoke detectors and evacuation plan.",
      medium: "Have non-compliance items corrected by a fire safety professional.",
      high: "Act immediately to restore minimum fire safety conditions.",
    },
  },
  exterior_damage: {
    label: "Exterior damage",
    observation: "Damage is visible on exterior components (siding, balcony, stairs, grounds, or drainage).",
    analysis: "The observed condition may affect envelope integrity and occupant safety.",
    recommendation: {
      low: "Plan seasonal corrective maintenance.",
      medium: "Have a qualified contractor evaluate and repair.",
      high: "Secure the area and schedule priority repair.",
    },
  },
  other: {
    label: "Other finding",
    observation: "A finding that does not match predefined categories was noted during inspection.",
    analysis: "This finding deserves attention and may require specialized evaluation.",
    recommendation: {
      low: "Document and monitor progression.",
      medium: "Consult a professional for in-depth evaluation.",
      high: "Have the relevant specialist evaluate as a priority.",
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
    case "plumbing_issue":
      return [
        "National Plumbing Code of Canada (NPC)",
        "Provincial/territorial plumbing regulations",
      ];
    case "insulation_deficiency":
      return [
        "NBC Part 9 (insulation and energy efficiency)",
        "National Energy Code of Canada for Buildings (NECB) where applicable",
      ];
    case "fire_safety":
      return [
        "National Fire Code of Canada (NFC)",
        "Provincial/territorial fire safety regulations",
        "CSA standards for fire detection and alarm systems",
      ];
    case "exterior_damage":
      return [
        "NBC Part 5/9 (envelope performance)",
        "Municipal property maintenance standards where applicable",
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

/** Avis bilingue FR/EN : cadre inspection bâtiment au Canada (non juridique, à valider sur site). */
export function getCanadianInspectionBilingualNotice(
  jurisdiction: JurisdictionProfile,
): { fr: string[]; en: string[] } {
  const qcFr =
    jurisdiction === "ca_qc"
      ? [
        "Au Québec, valider toute exigence applicable avec le Code du bâtiment du Québec, la réglementation municipale, la RBQ et les normes CSA citées en référence.",
      ]
      : [];
  const qcEn =
    jurisdiction === "ca_qc"
      ? [
        "In Quebec, validate applicable requirements against the Quebec Construction Code, municipal regulations, RBQ rules, and referenced CSA standards.",
      ]
      : [];

  return {
    fr: [
      "Le présent rapport décrit des constats visuels à la date d’inspection. Il ne constitue pas une certification de conformité ni un avis juridique.",
      "La conformité aux exigences canadiennes (Code national du bâtiment — CNB, codes provinciaux ou territoriaux adoptés localement, sécurité incendie, santé et sécurité au travail, normes CSA notamment pour l’électricité, etc.) doit être confirmée par des professionnels habilités selon l’usage du bâtiment et la juridiction.",
      "Les pratiques d’inspection recommandées (documentation photographique, limitation aux éléments accessibles, suivi des anomalies) s’alignent sur les attentes usuelles du secteur au Canada sans se substituer à une expertise de conception.",
      ...qcFr,
    ],
    en: [
      "This report documents visual findings at the time of inspection. It is not a compliance certificate or legal opinion.",
      "Compliance with Canadian requirements (National Building Code of Canada — NBC, locally adopted provincial/territorial codes, fire safety, occupational health and safety, CSA standards including electrical safety, etc.) must be confirmed by qualified professionals according to building use and jurisdiction.",
      "Recommended inspection practices (photo documentation, accessible components only, follow-up on deficiencies) reflect common Canadian industry expectations and do not replace design-level engineering.",
      ...qcEn,
    ],
  };
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
    plumbing_issue: {
      title: "Plomberie",
      requirement: "Verifier la conformite des installations de plomberie selon le Code national de plomberie du Canada.",
    },
    insulation_deficiency: {
      title: "Isolation thermique",
      requirement: "Evaluer la performance isolante et corriger les deficiences selon les exigences du CNB et CNEB.",
    },
    fire_safety: {
      title: "Securite incendie",
      requirement: "Verifier la conformite aux exigences du Code national de prevention des incendies et reglements provinciaux.",
    },
    exterior_damage: {
      title: "Composantes exterieures",
      requirement: "Evaluer l'integrite de l'enveloppe et des composantes exterieures selon les normes applicables.",
    },
    other: {
      title: "Autre constat",
      requirement: "Evaluer le constat selon les normes et reglements applicables a la juridiction.",
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
    plumbing_issue: {
      title: "Plumbing",
      requirement: "Verify plumbing compliance according to the National Plumbing Code of Canada.",
    },
    insulation_deficiency: {
      title: "Thermal insulation",
      requirement: "Assess insulation performance and correct deficiencies per NBC and NECB requirements.",
    },
    fire_safety: {
      title: "Fire safety",
      requirement: "Verify compliance with the National Fire Code and provincial/territorial fire regulations.",
    },
    exterior_damage: {
      title: "Exterior components",
      requirement: "Assess envelope and exterior component integrity per applicable standards.",
    },
    other: {
      title: "Other finding",
      requirement: "Evaluate finding per applicable codes and regulations for the jurisdiction.",
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
      bilingual_notice: getCanadianInspectionBilingualNotice(jurisdiction),
      checklist: buildComplianceChecklist(entries, language, jurisdiction),
    },
  };
}

/**
 * Compte rendu « client » : langage accessible (propriétaire / acheteur), distinct du volet technique.
 * Réduit le temps de rédaction en fournissant un premier jet structuré à ajuster.
 */
export function buildClientFacingSection(
  entries: ReportEntryInput[],
  language: ReportLanguage,
  jurisdiction: JurisdictionProfile,
  inspectorNote?: string,
): string {
  const issueMap = language === "en" ? ISSUE_MAP_EN : ISSUE_MAP;
  const intro =
    language === "en"
      ? "This plain-language summary is for the property owner or buyer. It highlights themes from the visit and does not replace the detailed technical sections below."
      : "Ce résumé en langage clair s'adresse au propriétaire ou à l'acheteur. Il met en évidence les thèmes de la visite et ne remplace pas les sections techniques détaillées ci-dessous.";

  const lines: string[] = [intro];

  if (inspectorNote?.trim()) {
    const label =
      language === "en"
        ? "Inspector context"
        : "Contexte inspecteur";
    lines.push("", `${label}: ${inspectorNote.trim()}`);
  }

  if (entries.length === 0) {
    lines.push(
      "",
      language === "en"
        ? "No structured finding was recorded."
        : "Aucun constat structuré n'a été enregistré.",
    );
    return lines.join("\n\n");
  }

  const themesTitle =
    language === "en" ? "Main themes from this visit" : "Principaux thèmes de la visite";
  lines.push("", `${themesTitle}:`);

  for (const entry of entries) {
    const zoneLabel =
      language === "en"
        ? ZONE_LABELS_EN[entry.zone]
        : ZONE_MAP[entry.zone].label;
    const issue = issueMap[entry.issue];
    const sev = SEVERITY_LABELS[language][entry.severity];
    const note = entry.note?.trim();
    const tail = note
      ? language === "en"
        ? ` Field note: ${note}.`
        : ` Note terrain : ${note}.`
      : "";
    const bullet =
      language === "en"
        ? `• ${zoneLabel} — ${issue.label} (priority: ${sev.toLowerCase()}).${tail}`
        : `• ${zoneLabel} — ${issue.label} (priorité : ${sev.toLowerCase()}).${tail}`;
    lines.push(bullet);
  }

  const outro =
    language === "en"
      ? jurisdiction === "ca_qc"
        ? "For repairs or compliance decisions, consult qualified professionals familiar with Quebec and Canadian requirements."
        : "For repairs or compliance decisions, consult qualified professionals familiar with applicable Canadian codes and standards."
      : jurisdiction === "ca_qc"
        ? "Pour les réparations ou les décisions de conformité, s'appuyer sur des professionnels qualifiés, au fait des exigences du Québec et du Canada."
        : "Pour les réparations ou les décisions de conformité, s'appuyer sur des professionnels qualifiés, au fait des codes et normes applicables au Canada.";

  lines.push("", outro);
  return lines.join("\n\n");
}
