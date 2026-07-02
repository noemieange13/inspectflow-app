import type { ObservationSeverityClass } from "@/lib/observation_ai_engine/types";
import type { BuildingProfileV1 } from "@/lib/buildingProfile";
import type { SellerDisclosureV1 } from "@/lib/document-intelligence";
import type { CertificationEntry } from "@/lib/inspectorProfile";
import type { ReportPropertySnapshotV1 } from "@/lib/reportPropertySnapshot";
import type { ReportLocale } from "@/lib/reportLocale";
import type { ZoneCode } from "@/lib/reportNarrative";

export type ProfessionalSectionCode =
  | "terrain"
  | "exterieur"
  | "toiture"
  | "structure"
  | "plomberie"
  | "electricite"
  | "chauffage"
  | "climatisation"
  | "interieur"
  | "isolation_ventilation";

export type CoverData = {
  title: string;
  companyName: string;
  logoUrl: string | null;
  facadePhotoUrl: string | null;
  address: string;
  clientName: string;
  inspectionDate: string;
  inspectorName: string;
  certification: string;
  signatureUrl: string | null;
  weatherSummary: string | null;
};

export type ExecutiveSummaryBucket = {
  class: ObservationSeverityClass;
  emoji: string;
  label: string;
  count: number;
};

export type ExecutiveSummary = {
  buckets: ExecutiveSummaryBucket[];
  totalFindings: number;
};

export type PriorityFinding = {
  observationId: string;
  title: string;
  summary: string;
  primaryPhotoUrl: string | null;
  pageRef: string;
  severityClass: ObservationSeverityClass;
};

export type SectionFinding = {
  observationId: string;
  title: string;
  observation: string;
  analysis: string;
  recommendation: string;
  severityLabel: string;
  photoUrls: string[];
};

export type SectionBlock = {
  code: ProfessionalSectionCode;
  title: string;
  findings: SectionFinding[];
};

export type PhotoAnnexGroup = {
  label: string;
  photoUrls: string[];
};

export type PhotoLayout = {
  primaryByObservationId: Record<string, string>;
  secondaryByObservationId: Record<string, string[]>;
  annexGroups: PhotoAnnexGroup[];
  includeFullPhotoBank: boolean;
};

export type ProfessionalBranding = {
  companyName: string;
  logoUrl: string | null;
  inspectorName: string;
  inspectorTitle?: string | null;
  certification: string;
  certificationAssociation?: string | null;
  certificationEntries?: CertificationEntry[];
  signatureUrl: string | null;
  phone: string;
  email: string;
  website: string | null;
};

export type { CertificationEntry };

export type CarbonMonoxideContextV1 = {
  fireplace_present?: boolean;
  garage_attached?: boolean;
  gas_appliance_present?: boolean;
  recommendation_text?: string;
  source?: string;
};

export type ProfessionalReportTemplate = {
  locale: ReportLocale;
  branding: ProfessionalBranding;
  cover: CoverData;
  executiveSummary: ExecutiveSummary;
  priorityFindings: PriorityFinding[];
  sections: SectionBlock[];
  photoLayout: PhotoLayout;
  limitationsHtml: string;
  legalClausesHtml: string;
  /** Page 2 — informations importées (Phase 8U). */
  propertySnapshot: ReportPropertySnapshotV1 | null;
  /** Page 2 — profil bâtiment Steve (Phase 8U+). */
  buildingProfile: BuildingProfileV1 | null;
  /** Section DV legacy Steve (Phase 8U-FIX). */
  sellerDisclosure: SellerDisclosureV1 | null;
  /** Orientation façade (profil bâtiment / couverture). */
  facadeDirection: string | null;
  /** Contexte CO optionnel — texte Steve fixe par défaut (Phase 8U-FIX-2). */
  carbonMonoxideContext: CarbonMonoxideContextV1 | null;
  /** Sections légales verrouillées avant constats (Phase 8U-FIX-4). */
  legalFrontMatterHtml: string;
  /** Constats Steve ordonnés (Phase 8V). */
  steveFindingsHtml: string;
  /** Avis au lecteur verrouillé (Phase 8V.4). */
  readerNoticeHtml: string;
  /** Conclusion professionnelle (Phase 8V.4 — IA autorisée ici seulement). */
  conclusionHtml: string;
  /** Attestation + signature (Phase 8V.4). */
  attestationHtml: string;
  signatureHtml: string;
};

export type BuildProfessionalTemplateOptions = {
  locale?: ReportLocale;
  /** Explicit override; default auto when snapshot present. */
  useProfessionalTemplate?: boolean;
};

export type SectionRowInput = {
  id?: unknown;
  title?: unknown;
  observation?: unknown;
  analysis?: unknown;
  recommendation?: unknown;
  severity?: unknown;
  zone?: unknown;
};

export type EntryRowInput = {
  id?: string;
  zone?: ZoneCode;
  issue?: string;
  severity?: string;
  note?: string;
};
