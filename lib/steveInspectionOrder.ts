/**
 * Phase 8V — Ordre fixe d'inspection Steve (tournée terrain + structure rapport).
 */

export type SteveInspectionPhase =
  | "admin"
  | "legal"
  | "structure"
  | "exterieur"
  | "toiture"
  | "plomberie"
  | "electricite"
  | "chauffage"
  | "interieur"
  | "final";

export type SteveAdminBlock =
  | "informations_inspection"
  | "propriete_inspectee"
  | "description_batiment"
  | "condition_generale"
  | "orientation_facade";

export type SteveLegalBlock =
  | "declaration_proprietaire"
  | "lecture_orientation"
  | "notes_securite"
  | "clauses_standards";

export type SteveFinalBlock = "conclusion" | "attestation_inspecteur" | "avis_lecteur";

export type SteveInspectionComponent = {
  id: string;
  order: number;
  phase: Exclude<SteveInspectionPhase, "admin" | "legal" | "final">;
  section: string;
  component: string;
};

export const STEVE_ADMIN_BLOCKS: readonly { id: SteveAdminBlock; label: string }[] = [
  { id: "informations_inspection", label: "Informations inspection" },
  { id: "propriete_inspectee", label: "Propriété inspectée" },
  { id: "description_batiment", label: "Description bâtiment" },
  { id: "condition_generale", label: "Condition générale" },
  { id: "orientation_facade", label: "Orientation façade" },
] as const;

export const STEVE_LEGAL_BLOCKS: readonly { id: SteveLegalBlock; label: string }[] = [
  { id: "declaration_proprietaire", label: "Déclaration propriétaire" },
  { id: "lecture_orientation", label: "Lecture orientation rapport" },
  { id: "notes_securite", label: "Notes sécurité" },
  { id: "clauses_standards", label: "Clauses standards" },
] as const;

export const STEVE_FINAL_BLOCKS: readonly { id: SteveFinalBlock; label: string }[] = [
  { id: "conclusion", label: "Conclusion" },
  { id: "attestation_inspecteur", label: "Attestation inspecteur" },
  { id: "avis_lecteur", label: "Avis lecteur" },
] as const;

export const STEVE_INSPECTION_COMPONENTS: readonly SteveInspectionComponent[] = [
  { id: "structure_fondation", order: 1, phase: "structure", section: "Structure", component: "Fondation" },
  { id: "structure_dalle_beton", order: 2, phase: "structure", section: "Structure", component: "Dalle béton" },
  { id: "structure_drain_sol", order: 3, phase: "structure", section: "Structure", component: "Drain de sol / regards" },
  { id: "structure_planchers", order: 4, phase: "structure", section: "Structure", component: "Planchers" },
  { id: "structure_poutres_colonnes", order: 5, phase: "structure", section: "Structure", component: "Poutres et colonnes" },
  { id: "structure_toit", order: 6, phase: "structure", section: "Structure", component: "Structure de toit" },
  { id: "structure_infiltration", order: 7, phase: "structure", section: "Structure", component: "Infiltration / condensation" },
  { id: "exterieur_revetements", order: 8, phase: "exterieur", section: "Extérieur", component: "Revêtements extérieurs" },
  { id: "exterieur_solins", order: 9, phase: "exterieur", section: "Extérieur", component: "Solins et scellements" },
  { id: "exterieur_portes_fenetres", order: 10, phase: "exterieur", section: "Extérieur", component: "Portes et fenêtres" },
  { id: "exterieur_portes_entree", order: 11, phase: "exterieur", section: "Extérieur", component: "Portes entrée" },
  { id: "exterieur_terrasses", order: 12, phase: "exterieur", section: "Extérieur", component: "Terrasses balcons perrons" },
  { id: "exterieur_avant_toits", order: 13, phase: "exterieur", section: "Extérieur", component: "Avant-toits fascias soffites" },
  { id: "exterieur_terrain", order: 14, phase: "exterieur", section: "Extérieur", component: "Terrain drainage" },
  { id: "toiture_revetement", order: 15, phase: "toiture", section: "Toiture", component: "Revêtement toiture" },
  { id: "toiture_gouttieres", order: 16, phase: "toiture", section: "Toiture", component: "Gouttières" },
  { id: "plomberie_alimentation", order: 17, phase: "plomberie", section: "Plomberie", component: "Alimentation eau" },
  { id: "plomberie_chauffe_eau", order: 18, phase: "plomberie", section: "Plomberie", component: "Chauffe-eau" },
  { id: "plomberie_evacuation", order: 19, phase: "plomberie", section: "Plomberie", component: "Évacuation évents" },
  { id: "plomberie_appareils", order: 20, phase: "plomberie", section: "Plomberie", component: "Appareils plomberie" },
  { id: "electricite_entree", order: 21, phase: "electricite", section: "Électricité", component: "Entrée électrique" },
  { id: "electricite_capacite", order: 22, phase: "electricite", section: "Électricité", component: "Capacité service" },
  { id: "electricite_panneau", order: 23, phase: "electricite", section: "Électricité", component: "Panneau distribution" },
  { id: "electricite_cables", order: 24, phase: "electricite", section: "Électricité", component: "Câbles circuits" },
  { id: "electricite_mise_terre", order: 25, phase: "electricite", section: "Électricité", component: "Mise à terre" },
  { id: "electricite_prises_gfi", order: 26, phase: "electricite", section: "Électricité", component: "Prises interrupteurs GFI" },
  { id: "electricite_detecteurs_fumee", order: 27, phase: "electricite", section: "Électricité", component: "Détecteurs fumée" },
  { id: "chauffage_systeme", order: 28, phase: "chauffage", section: "Chauffage", component: "Système chauffage" },
  { id: "chauffage_thermostats", order: 29, phase: "chauffage", section: "Chauffage", component: "Commandes thermostats" },
  { id: "interieur_planchers", order: 30, phase: "interieur", section: "Intérieur", component: "Planchers" },
  { id: "interieur_murs_plafonds", order: 31, phase: "interieur", section: "Intérieur", component: "Murs plafonds" },
  { id: "interieur_escaliers", order: 32, phase: "interieur", section: "Intérieur", component: "Escaliers rampes" },
  { id: "interieur_armoires", order: 33, phase: "interieur", section: "Intérieur", component: "Armoires comptoirs" },
  { id: "interieur_ventilation_sdb", order: 34, phase: "interieur", section: "Intérieur", component: "Ventilation salles bain" },
  { id: "interieur_isolation", order: 35, phase: "interieur", section: "Intérieur", component: "Isolation" },
  { id: "interieur_ventilation_batiment", order: 36, phase: "interieur", section: "Intérieur", component: "Ventilation bâtiment" },
  { id: "interieur_hotte", order: 37, phase: "interieur", section: "Intérieur", component: "Hotte cuisine" },
  { id: "interieur_calfeutrage", order: 38, phase: "interieur", section: "Intérieur", component: "Calfeutrage intérieur" },
  { id: "interieur_garage", order: 39, phase: "interieur", section: "Intérieur", component: "Garage" },
  { id: "interieur_climatisation", order: 40, phase: "interieur", section: "Intérieur", component: "Climatisation" },
  { id: "interieur_toilettes", order: 41, phase: "interieur", section: "Intérieur", component: "Toilettes" },
  { id: "interieur_grilles", order: 42, phase: "interieur", section: "Intérieur", component: "Grilles ventilation" },
] as const;

export const STEVE_COMPONENT_COUNT = STEVE_INSPECTION_COMPONENTS.length;

export const STEVE_INSPECTION_ORDER = STEVE_INSPECTION_COMPONENTS.map((c) => c.id);

export function getSteveComponentById(id: string): SteveInspectionComponent | undefined {
  return STEVE_INSPECTION_COMPONENTS.find((c) => c.id === id);
}

export function getSteveComponentByOrder(order: number): SteveInspectionComponent | undefined {
  return STEVE_INSPECTION_COMPONENTS.find((c) => c.order === order);
}

export function compareSteveComponentOrder(aId: string, bId: string): number {
  const a = getSteveComponentById(aId)?.order ?? 999;
  const b = getSteveComponentById(bId)?.order ?? 999;
  return a - b;
}

export function steveReportDocumentOrder(): string[] {
  return [
    ...STEVE_ADMIN_BLOCKS.map((b) => b.id),
    ...STEVE_LEGAL_BLOCKS.map((b) => b.id),
    ...STEVE_INSPECTION_ORDER,
    ...STEVE_FINAL_BLOCKS.map((b) => b.id),
  ];
}
