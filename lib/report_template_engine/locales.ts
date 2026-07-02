import type { ReportLocale } from "@/lib/reportLocale";
import { toWriterLanguage } from "@/lib/reportLocale";
import type { ReportLanguage } from "@/lib/reportNarrative";

type LocaleStrings = {
  reportTitle: string;
  coverAddress: string;
  coverClient: string;
  coverDate: string;
  coverInspector: string;
  coverCertification: string;
  coverWeather: string;
  infoTitle: string;
  executiveTitle: string;
  bucketMaintenance: string;
  bucketAttention: string;
  bucketPriority: string;
  priorityTitle: string;
  pageRef: string;
  annexTitle: string;
  limitationsTitle: string;
  legalTitle: string;
  signatureTitle: string;
  observation: string;
  analysis: string;
  recommendation: string;
  severity: string;
  sectionTitles: Record<string, string>;
};

const FR: LocaleStrings = {
  reportTitle: "RAPPORT D'INSPECTION RÉSIDENTIELLE",
  coverAddress: "Adresse",
  coverClient: "Client",
  coverDate: "Date d'inspection",
  coverInspector: "Inspecteur",
  coverCertification: "Certification",
  coverWeather: "Conditions météo",
  infoTitle: "Informations générales",
  executiveTitle: "Sommaire exécutif",
  bucketMaintenance: "Entretien",
  bucketAttention: "Attention",
  bucketPriority: "Prioritaire",
  priorityTitle: "Constats prioritaires",
  pageRef: "Réf. page",
  annexTitle: "Annexe photographique",
  limitationsTitle: "Limitations de l'inspection",
  legalTitle: "Clauses légales et avis",
  signatureTitle: "Signature",
  observation: "Observation",
  analysis: "Analyse",
  recommendation: "Recommandation",
  severity: "Gravité",
  sectionTitles: {
    terrain: "Terrain",
    exterieur: "Extérieur",
    toiture: "Toiture",
    structure: "Structure",
    plomberie: "Plomberie",
    electricite: "Électricité",
    chauffage: "Chauffage",
    climatisation: "Climatisation",
    interieur: "Intérieur",
    isolation_ventilation: "Isolation / ventilation",
  },
};

const EN: LocaleStrings = {
  reportTitle: "RESIDENTIAL INSPECTION REPORT",
  coverAddress: "Address",
  coverClient: "Client",
  coverDate: "Inspection date",
  coverInspector: "Inspector",
  coverCertification: "Certification",
  coverWeather: "Weather conditions",
  infoTitle: "General information",
  executiveTitle: "Executive summary",
  bucketMaintenance: "Maintenance",
  bucketAttention: "Attention",
  bucketPriority: "Priority",
  priorityTitle: "Priority findings",
  pageRef: "Page ref.",
  annexTitle: "Photo annex",
  limitationsTitle: "Inspection limitations",
  legalTitle: "Legal clauses and notices",
  signatureTitle: "Signature",
  observation: "Observation",
  analysis: "Analysis",
  recommendation: "Recommendation",
  severity: "Severity",
  sectionTitles: {
    terrain: "Site",
    exterieur: "Exterior",
    toiture: "Roof",
    structure: "Structure",
    plomberie: "Plumbing",
    electricite: "Electrical",
    chauffage: "Heating",
    climatisation: "Air conditioning",
    interieur: "Interior",
    isolation_ventilation: "Insulation / ventilation",
  },
};

export function professionalTemplateLocale(
  locale: ReportLocale,
): LocaleStrings {
  return toWriterLanguage(locale) === "en" ? EN : FR;
}

export function professionalSectionTitle(
  code: string,
  locale: ReportLocale,
): string {
  const L = professionalTemplateLocale(locale);
  return L.sectionTitles[code] ?? code;
}

export function writerLanguageFromLocale(locale: ReportLocale): ReportLanguage {
  return toWriterLanguage(locale);
}
