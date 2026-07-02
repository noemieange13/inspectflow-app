/**
 * Pilot #0.18 / #0.31 — Steve numbered checklist field mapping.
 */
import type { SteveFieldKind } from "@/lib/steveHandwritingNormalizer";

export type SteveChecklistTarget =
  | "inspection.date"
  | "property.address"
  | "property.building_type"
  | "property.construction_year"
  | "roof.covering"
  | "roof.year"
  | "property.facade_orientation"
  | "exterior.material"
  | "inspection.weather.temperature"
  | "plumbing.water_heater"
  | "heating.system"
  | "hvac.cooling"
  | "structure.foundation"
  | "exterior.windows"
  | "interior.kitchen"
  | "seller_disclosure.status"
  | "broker.name"
  | "client.email"
  | "inspection.notes"
  | "electrical.panel"
  | "systems.roof"
  | "systems.water_heater"
  | "systems.heating"
  | "contacts.broker_name"
  | "systems.electrical_panel";

export type SteveChecklistFieldDef = {
  fieldNumber: number;
  labelPatterns: RegExp[];
  target: SteveChecklistTarget;
  steveFieldKind: SteveFieldKind;
};

export const STEVE_CHECKLIST_FIELD_MAP: SteveChecklistFieldDef[] = [
  {
    fieldNumber: 1,
    labelPatterns: [/^1\.?\s*date\b/i, /^date\s*:/i],
    target: "inspection.date",
    steveFieldKind: "inspection_date",
  },
  {
    fieldNumber: 2,
    labelPatterns: [/^2\.?\s*adresse/i, /^adresse\s*:/i],
    target: "property.address",
    steveFieldKind: "address",
  },
  {
    fieldNumber: 3,
    labelPatterns: [/^3\.?\s*type de b[aâ]timent/i, /^type de b[aâ]timent\s*:/i, /^type de propri/i],
    target: "property.building_type",
    steveFieldKind: "building_type",
  },
  {
    fieldNumber: 4,
    labelPatterns: [/^4\.?\s*ann[eé]e de construction/i, /^ann[eé]e de construction\s*:/i],
    target: "property.construction_year",
    steveFieldKind: "construction_year",
  },
  {
    fieldNumber: 5,
    labelPatterns: [/^5\.?\s*toiture/i, /^toiture\s*:/i],
    target: "roof.covering",
    steveFieldKind: "roof",
  },
  {
    fieldNumber: 6,
    labelPatterns: [/^6\.?\s*orientation de la fa[cç]ade/i, /^orientation de la fa[cç]ade\s*:/i],
    target: "property.facade_orientation",
    steveFieldKind: "facade_orientation",
  },
  {
    fieldNumber: 7,
    labelPatterns: [/^7\.?\s*rev[eê]tement ext[eé]rieur/i, /^rev[eê]tement ext[eé]rieur/i],
    target: "exterior.material",
    steveFieldKind: "generic",
  },
  {
    fieldNumber: 8,
    labelPatterns: [/^8\.?\s*temp[eé]rature/i, /^temp[eé]rature\s*:/i, /^m[eé]t[eé]o/i],
    target: "inspection.weather.temperature",
    steveFieldKind: "generic",
  },
  {
    fieldNumber: 9,
    labelPatterns: [/^9\.?\s*r[eé]servoir eau chaude/i, /^r[eé]servoir eau chaude/i, /^chauffe[- ]?eau/i],
    target: "plumbing.water_heater",
    steveFieldKind: "water_heater",
  },
  {
    fieldNumber: 10,
    labelPatterns: [/^10\.?\s*type de chauffage/i, /^type de chauffage/i, /^chauffage\s*:/i],
    target: "heating.system",
    steveFieldKind: "heating",
  },
  {
    fieldNumber: 11,
    labelPatterns: [/^11\.?\s*air climatisation/i, /^air climatisation/i, /^climatisation/i],
    target: "hvac.cooling",
    steveFieldKind: "generic",
  },
  {
    fieldNumber: 12,
    labelPatterns: [/^12\.?\s*fondation/i, /^fondation\s*:/i],
    target: "structure.foundation",
    steveFieldKind: "generic",
  },
  {
    fieldNumber: 13,
    labelPatterns: [/^13\.?\s*fen[eê]tres/i, /^fen[eê]tres\s*:/i],
    target: "exterior.windows",
    steveFieldKind: "generic",
  },
  {
    fieldNumber: 14,
    labelPatterns: [/^14\.?\s*armoires cuisine/i, /^armoires cuisine/i],
    target: "interior.kitchen",
    steveFieldKind: "generic",
  },
  {
    fieldNumber: 15,
    labelPatterns: [/^15\.?\s*d[eé]claration vendeur/i, /^d[eé]claration vendeur/i],
    target: "seller_disclosure.status",
    steveFieldKind: "generic",
  },
  {
    fieldNumber: 16,
    labelPatterns: [/^16\.?\s*courtier immobilier/i, /^courtier immobilier/i],
    target: "broker.name",
    steveFieldKind: "broker_name",
  },
  {
    fieldNumber: 17,
    labelPatterns: [/^17\.?\s*email client/i, /^email acheteur/i, /^email.*client/i],
    target: "client.email",
    steveFieldKind: "email",
  },
  {
    fieldNumber: 18,
    labelPatterns: [/^18\.?\s*informations suppl[eé]mentaires/i, /^informations suppl[eé]mentaires/i],
    target: "inspection.notes",
    steveFieldKind: "generic",
  },
  {
    fieldNumber: 19,
    labelPatterns: [/^19\.?\s*panneau [eé]lectrique/i, /^panneau [eé]lectrique/i],
    target: "electrical.panel",
    steveFieldKind: "electrical_panel",
  },
];

export function matchSteveChecklistField(text: string): SteveChecklistFieldDef | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  for (const def of STEVE_CHECKLIST_FIELD_MAP) {
    if (def.labelPatterns.some((pattern) => pattern.test(normalized))) return def;
  }
  return null;
}

export function getSteveChecklistFieldByNumber(fieldNumber: number): SteveChecklistFieldDef | null {
  return STEVE_CHECKLIST_FIELD_MAP.find((def) => def.fieldNumber === fieldNumber) ?? null;
}
