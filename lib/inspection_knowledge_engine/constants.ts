import type { NormBody, SectionId } from "@/lib/compliance/inspection-norms";
import { PROVINCES } from "@/lib/compliance/inspection-norms";

export const INSPECTION_KNOWLEDGE_BASE_VERSION = "2027.1";

export type CatalogReference = {
  id: string;
  norm_body: NormBody;
  section_id: SectionId;
  label_fr: string;
  label_en: string;
  source_url: string;
};

/** Whitelist — aucune référence hors catalogue. */
export const KNOWN_REFERENCE_CATALOG: CatalogReference[] = [
  {
    id: "aibq:sop:general",
    norm_body: "AIBQ",
    section_id: "limitations",
    label_fr: "Norme de pratique AIBQ — inspection pré-achat",
    label_en: "AIBQ Standard of Practice — pre-purchase inspection",
    source_url: PROVINCES.QC.normUrl,
  },
  {
    id: "aibq:sop:electrical",
    norm_body: "AIBQ",
    section_id: "electrical",
    label_fr: "Norme AIBQ — système électrique",
    label_en: "AIBQ Standard — electrical system",
    source_url: PROVINCES.QC.normUrl,
  },
  {
    id: "aibq:sop:structure",
    norm_body: "AIBQ",
    section_id: "structural",
    label_fr: "Norme AIBQ — structure",
    label_en: "AIBQ Standard — structural components",
    source_url: PROVINCES.QC.normUrl,
  },
  {
    id: "oahi:sop:general",
    norm_body: "OAHI",
    section_id: "limitations",
    label_fr: "Normes de pratique OAHI",
    label_en: "OAHI Standards of Practice",
    source_url: PROVINCES.ON.normUrl,
  },
  {
    id: "oahi:sop:electrical",
    norm_body: "OAHI",
    section_id: "electrical",
    label_fr: "OAHI — installation électrique",
    label_en: "OAHI — electrical installation",
    source_url: PROVINCES.ON.normUrl,
  },
  {
    id: "cahpi:sop:general",
    norm_body: "CAHPI",
    section_id: "limitations",
    label_fr: "Normes nationales CAHPI",
    label_en: "CAHPI National Standards of Practice",
    source_url: PROVINCES.BC.normUrl,
  },
  {
    id: "cahpi:sop:electrical",
    norm_body: "CAHPI",
    section_id: "electrical",
    label_fr: "CAHPI — système électrique",
    label_en: "CAHPI — electrical system",
    source_url: "https://www.cahpi.ca/en/home-inspectors/inspector-standards",
  },
  {
    id: "ca:general:visual",
    norm_body: "CAHPI",
    section_id: "limitations",
    label_fr: "Inspection visuelle non invasive — pratique générale Canada",
    label_en: "Non-invasive visual inspection — general Canada practice",
    source_url: "https://www.cahpi.ca/en/home-inspectors/inspector-standards",
  },
];

export const KNOWN_REFERENCE_IDS = new Set(KNOWN_REFERENCE_CATALOG.map((r) => r.id));
