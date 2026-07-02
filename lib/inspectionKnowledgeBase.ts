/**
 * Phase 8V — Professional Inspector Report Knowledge Base (Steve Model).
 * Canonical source: systems, component types, inventory fields, standard clauses.
 */

export type ComponentType = "technical" | "inventory" | "defect_based";

export type InventoryField = {
  id: string;
  label: string;
  defaultMaterial?: string;
};

export type InspectionSubcomponent = {
  id: string;
  title: string;
};

export type InspectionComponentKnowledge = {
  id: string;
  title: string;
  componentType: ComponentType;
  steve_component_id?: string;
  subcomponents?: InspectionSubcomponent[];
  standardLimitations: string[];
  standardCharacteristics?: string[];
  standardObservations: string[];
  standardComments: string[];
  maintenanceAdvice: string[];
  inventoryFields?: InventoryField[];
  photosRequired: boolean;
};

export type InspectionSystemKnowledge = {
  id: string;
  title: string;
  order: number;
  components: InspectionComponentKnowledge[];
};

export const INSPECTION_KNOWLEDGE_BASE_KEY = "inspection_knowledge_base_v1" as const;

export type InspectionKnowledgeBaseV1 = {
  schema_version: 1;
  locale: "fr-CA" | "en-CA";
  systems: InspectionSystemKnowledge[];
};

export const NO_ANOMALY_OBSERVATION_FR =
  "Aucune anomalie apparente n'a été constatée au moment de l'inspection.";

const NO_ANOMALY_OBS = NO_ANOMALY_OBSERVATION_FR;

const PANEL_LIMITATIONS = [
  "Un dégagement libre est requis devant le panneau électrique en tout temps.",
  "Les panneaux installés dans des endroits inadéquats (placard, salle de bain, etc.) ne sont pas conformes aux pratiques courantes.",
  "L'inspection demeure visuelle; l'intérieur des boîtiers non ouverts n'a pas été examiné.",
];

const CABLES_LIMITATIONS = [
  "Il est impossible lors d'une inspection visuelle d'identifier les circuits qui pourraient être surchargés.",
  "Le remplacement régulier d'un fusible ou d'un disjoncteur qui saute fréquemment est anormal et indique généralement qu'un circuit est surchargé.",
  "Les appareils nécessitant beaucoup d'énergie devraient être branchés sur des circuits indépendants.",
  "Les connexions cachées dans les murs, plafonds ou boîtiers non ouverts n'ont pas été vérifiées.",
];

function tech(
  partial: Omit<InspectionComponentKnowledge, "componentType"> & { componentType?: ComponentType },
): InspectionComponentKnowledge {
  return { componentType: "technical", ...partial };
}

function inventory(
  partial: Omit<InspectionComponentKnowledge, "componentType"> & {
    inventoryFields: InventoryField[];
  },
): InspectionComponentKnowledge {
  return { componentType: "inventory", ...partial };
}

export const ELECTRICITE_SYSTEM: InspectionSystemKnowledge = {
  id: "electricite",
  title: "ÉLECTRICITÉ",
  order: 5,
  components: [
    tech({
      id: "electricite_entree",
      title: "Entrée électrique",
      steve_component_id: "electricite_entree",
      subcomponents: [
        { id: "electricite_entree_branchement", title: "Branchement aérien" },
        { id: "electricite_entree_branchement_souterrain", title: "Branchement souterrain" },
        { id: "electricite_entree_mat", title: "Mât" },
        { id: "electricite_entree_compteur", title: "Compteur" },
      ],
      standardLimitations: [],
      standardObservations: [
        "Branchement et compteur repérés et accessibles pour observation visuelle.",
      ],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "electricite_panneau_principal",
      title: "Panneau principal",
      steve_component_id: "electricite_panneau",
      subcomponents: [
        { id: "electricite_panneau_marque", title: "Marque" },
        { id: "electricite_panneau_amperage", title: "Ampérage" },
        { id: "electricite_panneau_protection", title: "Fusibles / disjoncteurs" },
        { id: "electricite_panneau_conducteur", title: "Cuivre / aluminium" },
      ],
      standardLimitations: PANEL_LIMITATIONS,
      standardCharacteristics: [
        "Marque et ampérage du panneau principal relevés lors de l'inspection.",
        "Protection par fusibles ou disjoncteurs; type de conducteur (cuivre/aluminium) noté si visible.",
      ],
      standardObservations: ["Panneau principal localisé et accessible."],
      standardComments: [],
      maintenanceAdvice: [
        "Conserver un dégagement libre devant le panneau électrique en tout temps.",
      ],
      photosRequired: true,
    }),
    tech({
      id: "electricite_panneaux_distribution",
      title: "Panneaux distribution",
      steve_component_id: "electricite_panneau",
      standardLimitations: [],
      standardObservations: [
        "1 panneau de distribution à disjoncteurs dessert l'ensemble du bâtiment.",
        NO_ANOMALY_OBS,
      ],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "electricite_cables_circuits",
      title: "Câbles et circuits de dérivation",
      steve_component_id: "electricite_cables",
      standardLimitations: CABLES_LIMITATIONS,
      standardObservations: ["Câbles en cuivre identifiés."],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "electricite_mise_terre",
      title: "Mise à la terre",
      steve_component_id: "electricite_mise_terre",
      standardLimitations: [],
      standardObservations: ["La mise à la terre (Ground) a été vérifiée."],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: true,
    }),
    tech({
      id: "electricite_ddfi",
      title: "DDFT",
      steve_component_id: "electricite_prises_gfi",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [
        "Tester périodiquement les dispositifs DDFT selon les indications du fabricant.",
      ],
      photosRequired: false,
    }),
    tech({
      id: "electricite_detecteurs",
      title: "Détecteurs",
      steve_component_id: "electricite_detecteurs_fumee",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [
        "Remplacer les piles ou l'appareil selon la date indiquée par le fabricant.",
      ],
      photosRequired: false,
    }),
  ],
};

export const PLOMBERIE_SYSTEM: InspectionSystemKnowledge = {
  id: "plomberie",
  title: "PLOMBERIE",
  order: 4,
  components: [
    tech({
      id: "plomberie_entree_eau",
      title: "Entrée d'eau",
      steve_component_id: "plomberie_alimentation",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "plomberie_distribution",
      title: "Distribution",
      steve_component_id: "plomberie_alimentation",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "plomberie_evacuation",
      title: "Évacuation",
      steve_component_id: "plomberie_evacuation",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "plomberie_ventilation",
      title: "Ventilation plomberie",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "plomberie_chauffe_eau",
      title: "Chauffe-eau",
      steve_component_id: "plomberie_chauffe_eau",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: ["Vidanger le chauffe-eau selon les recommandations du fabricant."],
      photosRequired: true,
    }),
    tech({
      id: "plomberie_pompes",
      title: "Pompes",
      steve_component_id: "plomberie_appareils",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "plomberie_robinets_exterieurs",
      title: "Robinets extérieurs",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: ["Fermer et purger les robinets extérieurs avant l'hiver."],
      photosRequired: false,
    }),
  ],
};

export const TOITURE_SYSTEM: InspectionSystemKnowledge = {
  id: "toiture",
  title: "TOITURE",
  order: 3,
  components: [
    tech({
      id: "toiture_revetement",
      title: "Revêtement toiture",
      steve_component_id: "toiture_revetement",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: true,
    }),
    tech({
      id: "toiture_solins",
      title: "Solins",
      steve_component_id: "toiture_revetement",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "toiture_cheminee",
      title: "Cheminée",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "toiture_gouttieres",
      title: "Gouttières",
      steve_component_id: "toiture_gouttieres",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: ["Nettoyer les gouttières au printemps et à l'automne."],
      photosRequired: false,
    }),
    tech({
      id: "toiture_ventilation",
      title: "Ventilation",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "toiture_structure_grenier",
      title: "Structure grenier",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
  ],
};

export const STRUCTURE_SYSTEM: InspectionSystemKnowledge = {
  id: "structure",
  title: "STRUCTURE",
  order: 1,
  components: [
    tech({
      id: "structure_fondation",
      title: "Fondation",
      steve_component_id: "structure_fondation",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: true,
    }),
    tech({
      id: "structure_dalle",
      title: "Dalle",
      steve_component_id: "structure_dalle_beton",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "structure_poutres",
      title: "Poutres",
      steve_component_id: "structure_poutres_colonnes",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "structure_colonnes",
      title: "Colonnes",
      steve_component_id: "structure_poutres_colonnes",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "structure_solives",
      title: "Solives",
      steve_component_id: "structure_planchers",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "structure_charpente",
      title: "Charpente",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
  ],
};

const EXTERIEUR_REVETEMENT_FIELDS: InventoryField[] = [
  { id: "facade_avant", label: "Façade avant", defaultMaterial: "à documenter" },
  { id: "facade_droit", label: "Côté droit", defaultMaterial: "à documenter" },
  { id: "facade_gauche", label: "Côté gauche", defaultMaterial: "à documenter" },
  { id: "facade_arriere", label: "Arrière", defaultMaterial: "à documenter" },
];

export const EXTERIEUR_SYSTEM: InspectionSystemKnowledge = {
  id: "exterieur",
  title: "EXTÉRIEUR",
  order: 2,
  components: [
    inventory({
      id: "exterieur_revetement",
      title: "Revêtements",
      steve_component_id: "exterieur_revetements",
      inventoryFields: EXTERIEUR_REVETEMENT_FIELDS,
      standardLimitations: [],
      standardObservations: [],
      standardComments: ["Les revêtements extérieurs étaient en bon état général au moment de l'inspection."],
      maintenanceAdvice: [],
      photosRequired: true,
    }),
    inventory({
      id: "exterieur_fenetres",
      title: "Fenêtres",
      steve_component_id: "exterieur_portes_fenetres",
      inventoryFields: [{ id: "materiau", label: "Matériau", defaultMaterial: "PVC / aluminium" }],
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    inventory({
      id: "exterieur_portes",
      title: "Portes",
      steve_component_id: "exterieur_portes_entree",
      inventoryFields: [{ id: "materiau", label: "Matériau", defaultMaterial: "bois / acier" }],
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "exterieur_balcons",
      title: "Balcons",
      steve_component_id: "exterieur_terrasses",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "exterieur_perrons",
      title: "Perrons",
      steve_component_id: "exterieur_terrasses",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "exterieur_terrain",
      title: "Terrain",
      steve_component_id: "exterieur_terrain",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "exterieur_drainage",
      title: "Drainage",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
  ],
};

const PLANCHERS_FIELDS: InventoryField[] = [
  { id: "entree", label: "Entrée", defaultMaterial: "céramique" },
  { id: "salon", label: "Salon", defaultMaterial: "bois franc" },
  { id: "cuisine", label: "Cuisine", defaultMaterial: "céramique" },
  { id: "salle_bain", label: "Salle de bain", defaultMaterial: "tuiles" },
  { id: "chambres", label: "Chambres", defaultMaterial: "bois stratifié" },
  { id: "passage", label: "Passage étage", defaultMaterial: "bois stratifié" },
  { id: "salle_eau", label: "Salle d'eau", defaultMaterial: "céramique" },
  { id: "sous_sol", label: "Sous-sol", defaultMaterial: "céramique et bois stratifié" },
  { id: "escalier", label: "Escalier", defaultMaterial: "marches en bois" },
];

export const INTERIEUR_SYSTEM: InspectionSystemKnowledge = {
  id: "interieur",
  title: "INTÉRIEUR",
  order: 7,
  components: [
    inventory({
      id: "interieur_planchers",
      title: "Planchers",
      steve_component_id: "interieur_planchers",
      inventoryFields: PLANCHERS_FIELDS,
      standardLimitations: [],
      standardObservations: [],
      standardComments: [
        "L'ensemble des revêtements de planchers étaient en bon état général.",
      ],
      maintenanceAdvice: [],
      photosRequired: true,
    }),
    inventory({
      id: "interieur_murs",
      title: "Murs",
      steve_component_id: "interieur_murs_plafonds",
      inventoryFields: [
        { id: "principaux", label: "Revêtement principal", defaultMaterial: "plâtre peint" },
      ],
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    inventory({
      id: "interieur_plafonds",
      title: "Plafonds",
      steve_component_id: "interieur_murs_plafonds",
      inventoryFields: [
        { id: "principaux", label: "Revêtement principal", defaultMaterial: "plâtre peint" },
      ],
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    inventory({
      id: "interieur_portes",
      title: "Portes intérieures",
      inventoryFields: [{ id: "type", label: "Type", defaultMaterial: "hollow core / bois" }],
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    inventory({
      id: "interieur_escaliers",
      title: "Escaliers",
      steve_component_id: "interieur_escaliers",
      inventoryFields: [{ id: "marches", label: "Marches", defaultMaterial: "bois" }],
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    inventory({
      id: "interieur_armoires_cuisine",
      title: "Armoires cuisine",
      inventoryFields: [{ id: "materiau", label: "Matériau", defaultMaterial: "stratifié / bois" }],
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    inventory({
      id: "interieur_comptoirs",
      title: "Comptoirs",
      inventoryFields: [{ id: "materiau", label: "Matériau", defaultMaterial: "stratifié / quartz" }],
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
  ],
};

export const CHAUFFAGE_CLIM_SYSTEM: InspectionSystemKnowledge = {
  id: "chauffage_climatisation",
  title: "CHAUFFAGE / CLIMATISATION",
  order: 6,
  components: [
    tech({
      id: "chauffage_appareil",
      title: "Système principal",
      steve_component_id: "chauffage_systeme",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: ["Entretenir l'appareil selon les recommandations du fabricant."],
      photosRequired: true,
    }),
    tech({
      id: "chauffage_distribution",
      title: "Distribution",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "chauffage_thermostat",
      title: "Thermostat",
      steve_component_id: "chauffage_thermostats",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "chauffage_climatisation",
      title: "Climatisation",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: [],
      photosRequired: false,
    }),
    tech({
      id: "chauffage_echangeur",
      title: "Échangeur d'air",
      steve_component_id: "interieur_ventilation_batiment",
      standardLimitations: [],
      standardObservations: [NO_ANOMALY_OBS],
      standardComments: [],
      maintenanceAdvice: ["Nettoyer ou remplacer les filtres selon la fréquence recommandée."],
      photosRequired: false,
    }),
  ],
};

export const INSPECTION_KNOWLEDGE_SYSTEMS: InspectionSystemKnowledge[] = [
  STRUCTURE_SYSTEM,
  EXTERIEUR_SYSTEM,
  TOITURE_SYSTEM,
  PLOMBERIE_SYSTEM,
  ELECTRICITE_SYSTEM,
  CHAUFFAGE_CLIM_SYSTEM,
  INTERIEUR_SYSTEM,
];

export function buildInspectionKnowledgeBaseV1(
  locale: "fr-CA" | "en-CA" = "fr-CA",
): InspectionKnowledgeBaseV1 {
  return {
    schema_version: 1,
    locale,
    systems: INSPECTION_KNOWLEDGE_SYSTEMS.map((s) => ({
      ...s,
      components: s.components.map((c) => ({ ...c })),
    })),
  };
}

export function getInspectionSystemById(id: string): InspectionSystemKnowledge | undefined {
  return INSPECTION_KNOWLEDGE_SYSTEMS.find((s) => s.id === id);
}

export function getInspectionComponentById(
  componentId: string,
): { system: InspectionSystemKnowledge; component: InspectionComponentKnowledge } | undefined {
  for (const system of INSPECTION_KNOWLEDGE_SYSTEMS) {
    const component = system.components.find((c) => c.id === componentId);
    if (component) return { system, component };
  }
  return undefined;
}

export function listComponentsForSystem(systemId: string): InspectionComponentKnowledge[] {
  return getInspectionSystemById(systemId)?.components ?? [];
}

export function orderedInspectionSystems(): InspectionSystemKnowledge[] {
  return [...INSPECTION_KNOWLEDGE_SYSTEMS].sort((a, b) => a.order - b.order);
}

export function readInspectionKnowledgeBaseFromPayload(
  payload: Record<string, unknown>,
): InspectionKnowledgeBaseV1 {
  const raw = payload[INSPECTION_KNOWLEDGE_BASE_KEY];
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if (o.schema_version === 1 && Array.isArray(o.systems)) {
      return o as InspectionKnowledgeBaseV1;
    }
  }
  return buildInspectionKnowledgeBaseV1("fr-CA");
}

export function resolveComponentInventoryItems(
  component: InspectionComponentKnowledge,
  values?: Record<string, string>,
): Array<{ label: string; value: string }> {
  if (!component.inventoryFields?.length) return [];
  return component.inventoryFields.map((field) => ({
    label: field.label,
    value: values?.[field.id]?.trim() || field.defaultMaterial || "—",
  }));
}

export function isDefectFinding(
  finding: { severity?: string; status?: string } | null | undefined,
): boolean {
  if (!finding) return false;
  if (finding.status === "conforme" || finding.status === "na") return false;
  return finding.severity !== "none" && finding.severity !== undefined;
}
