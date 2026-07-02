import type { LegalClauseDefinition } from "@/lib/report_legal_sections_engine/types";

export const OWNER_DISCLOSURE_DEFAULT_INTRO_EN =
  "We ensured that the seller completed a « Seller Property Disclosure » document concerning conditions of the residence that only their knowledge of the property and past experience could reveal.";

export const SPECIALIST_NB_BODY_EN =
  "Certain building elements may require evaluation by one or more specialists, including: electrical systems, plumbing, major structures, heating and air conditioning systems, foundations, and environmental elements (asbestos, mould, radon). The building inspector is not an engineer, electrician, plumber, or environmental expert. Any anomaly or limitation noted in this report should be evaluated by the relevant specialist before finalizing the transaction.\n\nThis report is prepared exclusively for the signed client. It may not be used for other purposes without the inspector's written consent.";

export const EN_LEGAL_CLAUSE_DEFINITIONS: LegalClauseDefinition[] = [
  {
    code: "inspection_scope",
    title: "SCOPE AND LIMITS OF THE INSPECTION",
    body:
      "This inspection consists of a visual inspection of readily accessible building components at the time of inspection. It aims to identify visible indications that may reveal deficiencies or conditions requiring particular attention.\n\nThe inspection does not constitute a guarantee against hidden defects and cannot predict the future appearance of problems not visible at the time of inspection.",
  },
  {
    code: "accessibility_limitations",
    title: "ACCESS AND CONDITION LIMITATIONS",
    body:
      "Certain components may not have been inspected due to conditions present at the time of inspection, including snow, ice, furniture, personal belongings, coverings, finishes, or any other obstacle limiting access or visibility.",
  },
  {
    code: "owner_disclosure",
    title: "SELLER DISCLOSURE",
    body: OWNER_DISCLOSURE_DEFAULT_INTRO_EN,
  },
  {
    code: "orientation_notice",
    title: "READING THE REPORT RELATIVE TO ORIENTATIONS",
    body:
      "For orientations mentioned in this report, consider that you are in the street, facing the building or room concerned. This façade is the FRONT; the opposite walls enclosing the building or room form the REAR. When viewing the façade from outside, the RIGHT SIDE is on your RIGHT and the left side is on your LEFT. If you are inside the building or room, your right side is to your right when your BACK is to the façade.",
  },
  {
    code: "carbon_monoxide_note",
    title: "Note",
    body:
      "Carbon monoxide detectors are required near fireplaces operating on wood, gas, coal, fuel oil, propane... When a garage is attached to the house, a carbon monoxide detector should be placed near the door leading from the garage to the interior of the residence. The recommended height for placing your carbon monoxide detector is 1 foot from the floor.\n\nComments:\nNo gas- or wood-fired component forming an integral part of the building was observed; therefore carbon monoxide detectors on each floor would not be mandatory. A wood fireplace was present in the living room but would not be used.",
  },
  {
    code: "specialist_nb",
    title: "N.B.",
    body: SPECIALIST_NB_BODY_EN,
  },
  {
    code: "component_life_expectancy",
    title: "COMPONENT SERVICE LIFE",
    body:
      "Any mention of age, condition, or remaining service life of a component is an estimate based on visible observations at the time of inspection and does not represent any guarantee.",
  },
  {
    code: "photos_notice",
    title: "PHOTOGRAPHS",
    body:
      "Photographs included in the report illustrate certain observations. They do not necessarily represent all conditions observed during the inspection.",
  },
  {
    code: "report_usage",
    title: "REPORT USE",
    body:
      "This report is prepared exclusively for the client identified in the report and according to the conditions agreed in the inspection contract.",
  },
];

export function getEnClauseDefinition(code: LegalClauseDefinition["code"]): LegalClauseDefinition {
  const row = EN_LEGAL_CLAUSE_DEFINITIONS.find((c) => c.code === code);
  if (!row) throw new Error(`Missing EN legal clause: ${code}`);
  return row;
}
