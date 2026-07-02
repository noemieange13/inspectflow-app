export type {
  ComponentType,
  InspectionComponentKnowledge,
  InspectionKnowledgeBaseV1,
  InspectionSubcomponent,
  InspectionSystemKnowledge,
  InventoryField,
} from "@/lib/inspectionKnowledgeBase";

export {
  buildInspectionKnowledgeBaseV1,
  CHAUFFAGE_CLIM_SYSTEM,
  ELECTRICITE_SYSTEM,
  EXTERIEUR_SYSTEM,
  getInspectionComponentById,
  getInspectionSystemById,
  INTERIEUR_SYSTEM,
  INSPECTION_KNOWLEDGE_BASE_KEY,
  INSPECTION_KNOWLEDGE_SYSTEMS,
  listComponentsForSystem,
  NO_ANOMALY_OBSERVATION_FR,
  orderedInspectionSystems,
  PLOMBERIE_SYSTEM,
  readInspectionKnowledgeBaseFromPayload,
  resolveComponentInventoryItems,
  STRUCTURE_SYSTEM,
  TOITURE_SYSTEM,
  isDefectFinding,
} from "@/lib/inspectionKnowledgeBase";
