import type { SupabaseClient } from "@supabase/supabase-js";

import {
  COVER_PAYLOAD_KEY,
  INSPECTOR_PROFILE_PAYLOAD_KEY,
  type InspectorProfileV1,
} from "@/lib/inspectionCoverPayload";
import {
  normalizeAvailableReportLanguages,
  normalizeAvailableReportLocales,
  REPORT_LANGUAGE_PAYLOAD_KEY,
} from "@/lib/reportLanguage";
import {
  localeFromProvince,
  normalizeReportLocale,
  toWriterLanguage,
  type ReportLocale,
} from "@/lib/reportLocale";
import type { LegalSectionsV1 } from "@/lib/report_legal_sections_engine";
import {
  buildLegalSectionsSnapshotV1,
  LEGAL_SECTIONS_V1_KEY,
  parseLegalSectionsV1,
} from "@/lib/report_legal_sections_engine";
import { buildInspectionKnowledgeBaseV1 } from "@/lib/inspectionStandardClauses";
import { INSPECTION_KNOWLEDGE_BASE_KEY } from "@/lib/inspectionStandardClauses/types";
import {
  buildReportComplianceV1,
  readReportComplianceFromPayload,
  REPORT_COMPLIANCE_V1_KEY,
} from "@/lib/legalClauses/qc/version";
import type { ReportLanguage } from "@/lib/reportNarrative";
import { normalizeInspectorWorkflowMode } from "@/lib/inspectorWorkflow";
import { normalizeInspectorCreationMethod } from "@/lib/inspectorCreationMethod";
import {
  INSPECTOR_REPORT_STYLE_V1_KEY,
  INSPECTOR_STYLE_PROFILE_V1_KEY,
  normalizeInspectorReportStyleV1,
  normalizeInspectorStyleProfileV1,
  reportStyleFromProfile,
  STEVE_REPORT_STYLE_DEFAULTS,
  type InspectorReportStyleV1,
  type InspectorStyleProfileV1,
} from "@/lib/inspectorReportStyle";

/** Snapshot immuable sur le rapport — historique légal (Phase 8I / 8J). */
export const REPORT_PROFESSIONAL_SNAPSHOT_KEY = "report_professional_snapshot_v1" as const;

/** Defaults injectés à la création d'inspection (Phase 8J). */
export const INSPECTION_DEFAULTS_V1_KEY = "inspection_defaults_v1" as const;

export type CertificationEntry = {
  association?: string;
  associationName?: string;
  number?: string;
  memberNumber?: string;
  license?: string;
  logoUrl?: string;
};

export type DefaultReportPreferences = {
  template?: string;
  province?: string;
  available_languages?: string[];
  preferred_creation_method?: string;
};

export type InspectorProfileRow = {
  user_id: string;
  organization_id: string | null;
  company_name: string | null;
  logo_url: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  title: string | null;
  professional_title: string | null;
  association: string | null;
  certification_number: string | null;
  license_number: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  certifications: CertificationEntry[] | null;
  insurance_provider: string | null;
  policy_number: string | null;
  expiry_date: string | null;
  signature_image_url: string | null;
  default_language: string | null;
  preferred_ui_language: string | null;
  default_client_report_language: string | null;
  default_province: string | null;
  default_report_template: string | null;
  default_report_preferences: DefaultReportPreferences | null;
  available_report_languages: string[] | null;
  include_weather_default: boolean;
  preferred_workflow: string | null;
  inspector_report_style_v1: InspectorReportStyleV1 | null;
  inspector_style_profile_v1: InspectorStyleProfileV1 | null;
  created_at: string;
  updated_at: string;
};

/** Champs éditables via API / formulaire paramètres. */
export type InspectorProfileInput = Omit<
  InspectorProfileRow,
  "user_id" | "created_at" | "updated_at"
>;

export function profileCompanyLogoUrl(p: InspectorProfileInput): string | null {
  return str(p.logo_url);
}

export function profileBusinessPhone(p: InspectorProfileInput): string | null {
  return str(p.phone);
}

export function profileBusinessEmail(p: InspectorProfileInput): string | null {
  return str(p.email);
}

export function profileSignatureUrl(p: InspectorProfileInput): string | null {
  return str(p.signature_image_url);
}

export function profileInterfaceLanguage(p: InspectorProfileInput): ReportLocale {
  return normalizeReportLocale(p.preferred_ui_language ?? p.default_language);
}

export function profileDefaultReportLanguage(p: InspectorProfileInput): ReportLocale {
  return normalizeReportLocale(p.default_client_report_language ?? p.default_language);
}

export function profileInsuranceCompany(p: InspectorProfileInput): string | null {
  return str(p.insurance_provider);
}

export function profileProfessionalTitle(p: InspectorProfileInput): string | null {
  return str(p.professional_title) ?? str(p.title);
}

export type LanguagePreferencesV1 = {
  ui: ReportLocale;
  default_report: ReportLocale;
  available: ReportLocale[];
};

/** @deprecated Utiliser LanguagePreferencesV1 — conservé pour snapshots legacy. */
export type LegacyLanguagePreferencesV1 = {
  default: string;
  report: string;
};

export type ReportProfessionalSnapshotStored8J = {
  version: "8J";
  created_at: string;
  company: {
    name: string;
    logo: string | null;
    address: string;
    phone: string;
    email: string;
    website?: string;
    city?: string;
    province?: string;
    postal_code?: string;
  };
  inspector: {
    name: string;
    title?: string;
    certifications: string;
    certification_entries?: CertificationEntry[];
    signature: string | null;
    license_number?: string;
  };
  insurance: {
    company?: string;
    policy?: string;
    expiry?: string;
  };
  languages: {
    report: ReportLocale;
    ui: ReportLocale;
    available?: ReportLocale[];
  };
  default_province?: string;
  default_report_template?: string;
  /** Clauses légales verrouillées au moment de la capture (Phase 8U-FIX-4). */
  legal_sections_v1?: LegalSectionsV1;
};

export type ReportProfessionalSnapshotLegacy8I = {
  schema_version: 1;
  captured_at: string;
  company: string;
  company_address?: string;
  website?: string;
  inspector: string;
  title?: string;
  certification: string;
  association?: string;
  license_number?: string;
  insurance_provider?: string;
  policy_number?: string;
  insurance_expiry?: string;
  logo: string | null;
  signature: string | null;
  phone: string;
  email: string;
  default_language?: string;
  default_province?: string;
  default_report_template?: string;
  language_preferences?: LanguagePreferencesV1 | LegacyLanguagePreferencesV1;
};

export type ReportProfessionalSnapshotStored =
  | ReportProfessionalSnapshotStored8J
  | ReportProfessionalSnapshotLegacy8I;

export type ReportProfessionalSnapshotV1 = {
  schema_version: 1;
  captured_at: string;
  company: string;
  company_address?: string;
  website?: string;
  inspector: string;
  title?: string;
  certification: string;
  association?: string;
  license_number?: string;
  insurance_provider?: string;
  policy_number?: string;
  insurance_expiry?: string;
  logo: string | null;
  signature: string | null;
  phone: string;
  email: string;
  default_language?: string;
  default_province?: string;
  default_report_template?: string;
  language_preferences?: LanguagePreferencesV1 | LegacyLanguagePreferencesV1;
  source_version?: "8I" | "8J";
};

export type InspectionDefaultsV1 = {
  version: "1";
  organization_id?: string;
  report_language: ReportLocale;
  include_weather: boolean;
  report_template?: string;
  province?: string;
};

export type CoverInspectorFields = {
  inspecteur_nom: string;
  inspecteur_numero_certification: string;
  compagnie: string;
};

export type DeliveryProfileGateState =
  | { blocked: false }
  | {
      blocked: true;
      reason: "no_profile" | "no_snapshot";
      canAttachSnapshot: boolean;
    };

const EMPTY_INPUT: InspectorProfileInput = {
  organization_id: null,
  company_name: null,
  logo_url: null,
  address: null,
  phone: null,
  email: null,
  website: null,
  first_name: null,
  last_name: null,
  display_name: null,
  title: null,
  professional_title: null,
  association: null,
  certification_number: null,
  license_number: null,
  city: null,
  province: null,
  postal_code: null,
  certifications: [],
  insurance_provider: null,
  policy_number: null,
  expiry_date: null,
  signature_image_url: null,
  default_language: "fr",
  preferred_ui_language: "fr-CA",
  default_client_report_language: "fr-CA",
  default_province: "ca_qc",
  default_report_template: "QC_2027",
  default_report_preferences: {},
  available_report_languages: ["fr", "en"],
  include_weather_default: true,
  preferred_workflow: "field_assistant",
  inspector_report_style_v1: { ...STEVE_REPORT_STYLE_DEFAULTS },
  inspector_style_profile_v1: null,
};

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function parseCertifications(raw: unknown): CertificationEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: CertificationEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const entry: CertificationEntry = {
      association:
        str(o.association) ?? str(o.associationName) ?? undefined,
      associationName: str(o.associationName) ?? str(o.association) ?? undefined,
      number: str(o.number) ?? str(o.memberNumber) ?? undefined,
      memberNumber: str(o.memberNumber) ?? str(o.number) ?? undefined,
      license: str(o.license) ?? undefined,
      logoUrl: str(o.logoUrl) ?? undefined,
    };
    if (entry.association || entry.number || entry.license || entry.logoUrl) out.push(entry);
  }
  return out;
}

function parseDefaultReportPreferences(raw: unknown): DefaultReportPreferences {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const prefs: DefaultReportPreferences = {};
  const template = str(o.template);
  const province = str(o.province);
  if (template) prefs.template = template;
  if (province) prefs.province = province;
  if (Array.isArray(o.available_languages)) {
    prefs.available_languages = normalizeAvailableReportLanguages(o.available_languages);
  }
  const creationMethod = str(o.preferred_creation_method);
  if (creationMethod) {
    prefs.preferred_creation_method = normalizeInspectorCreationMethod(creationMethod);
  }
  return prefs;
}

export function resolveProfileDisplayName(
  profile: Pick<InspectorProfileInput, "display_name" | "first_name" | "last_name">,
): string {
  const explicit = str(profile.display_name);
  if (explicit) return explicit;
  return formatInspectorFullName(profile);
}

export function resolveProfileUiLocale(profile: InspectorProfileInput): ReportLocale {
  return profileInterfaceLanguage(profile);
}

export function resolveProfileDefaultReportLocale(profile: InspectorProfileInput): ReportLocale {
  return profileDefaultReportLanguage(profile);
}

export function buildLanguagePreferencesV1(profile: InspectorProfileInput): LanguagePreferencesV1 {
  const province = profile.default_province ?? "ca_qc";
  const ui = resolveProfileUiLocale(profile);
  const defaultReport =
    profile.default_client_report_language != null
      ? normalizeReportLocale(profile.default_client_report_language)
      : localeFromProvince(province, profile.default_language);
  return {
    ui,
    default_report: defaultReport,
    available: normalizeAvailableReportLocales(profile.available_report_languages),
  };
}

export function parseLanguagePreferencesV1(raw: unknown): LanguagePreferencesV1 | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if ("ui" in o || "default_report" in o) {
    return {
      ui: normalizeReportLocale(o.ui),
      default_report: normalizeReportLocale(o.default_report),
      available: normalizeAvailableReportLocales(o.available),
    };
  }
  if ("default" in o || "report" in o) {
    return {
      ui: normalizeReportLocale(o.default),
      default_report: normalizeReportLocale(o.report),
      available: ["fr-CA", "en-CA"],
    };
  }
  return undefined;
}

export function formatInspectorFullName(
  profile: Pick<InspectorProfileInput, "first_name" | "last_name">,
): string {
  return [profile.first_name, profile.last_name]
    .map((x) => str(x) ?? "")
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function formatCertificationLabel(
  profile: Pick<InspectorProfileInput, "association" | "certification_number">,
): string {
  const assoc = str(profile.association);
  const num = str(profile.certification_number);
  if (assoc && num) return `${assoc} #${num}`;
  if (num) return num;
  if (assoc) return assoc;
  return "";
}

export function resolveCertificationEntries(profile: InspectorProfileInput): CertificationEntry[] {
  const fromJson = profile.certifications ?? [];
  if (fromJson.length > 0) return fromJson;
  const legacy: CertificationEntry = {
    association: str(profile.association) ?? undefined,
    number: str(profile.certification_number) ?? undefined,
    license: str(profile.license_number) ?? undefined,
  };
  if (legacy.association || legacy.number || legacy.license) return [legacy];
  return [];
}

export function formatCertificationFromEntries(entries: CertificationEntry[]): string {
  const primary = entries[0];
  if (!primary) return "";
  const assoc = str(primary.association);
  const num = str(primary.number);
  if (assoc && num) return `${assoc} #${num}`;
  if (num) return num;
  if (assoc) return assoc;
  return "";
}

export function formatCompanyAddress(profile: InspectorProfileInput): string {
  const parts = [
    str(profile.address),
    str(profile.city),
    str(profile.province),
    str(profile.postal_code),
  ].filter(Boolean);
  return parts.join(", ");
}

export function isInspectorProfileConfigured(
  profile: InspectorProfileInput | null | undefined,
): boolean {
  if (!profile) return false;
  const name = resolveProfileDisplayName(profile);
  const cert =
    formatCertificationLabel(profile) ||
    formatCertificationFromEntries(resolveCertificationEntries(profile));
  return name.length > 0 && cert.length > 0;
}

export function normalizeInspectorProfileInput(raw: unknown): InspectorProfileInput {
  if (!raw || typeof raw !== "object") return { ...EMPTY_INPUT };
  const o = raw as Record<string, unknown>;
  const includeWeather =
    typeof o.include_weather_default === "boolean" ? o.include_weather_default : true;
  const certs = parseCertifications(o.certifications);
  const prefs = parseDefaultReportPreferences(o.default_report_preferences);
  const input: InspectorProfileInput = {
    organization_id: str(o.organization_id),
    company_name: str(o.company_name),
    logo_url: str(o.logo_url) ?? str(o.company_logo_url),
    address: str(o.address),
    phone: str(o.phone) ?? str(o.business_phone),
    email: str(o.email) ?? str(o.business_email),
    website: str(o.website),
    first_name: str(o.first_name),
    last_name: str(o.last_name),
    display_name: str(o.display_name),
    title: str(o.title),
    professional_title: str(o.professional_title) ?? str(o.title),
    association: str(o.association),
    certification_number: str(o.certification_number),
    license_number: str(o.license_number),
    city: str(o.city),
    province: str(o.province),
    postal_code: str(o.postal_code),
    certifications: certs,
    insurance_provider: str(o.insurance_provider) ?? str(o.insurance_company),
    policy_number: str(o.policy_number),
    expiry_date: str(o.expiry_date),
    signature_image_url: str(o.signature_image_url) ?? str(o.signature_url),
    default_language: str(o.default_language) ?? "fr",
    preferred_ui_language:
      str(o.preferred_ui_language) ??
      str(o.interface_language) ??
      normalizeReportLocale(o.default_language ?? "fr-CA"),
    default_client_report_language:
      str(o.default_client_report_language) ??
      str(o.default_report_language) ??
      normalizeReportLocale(o.default_language ?? "fr-CA"),
    default_province: str(o.default_province) ?? "ca_qc",
    default_report_template: str(o.default_report_template) ?? "QC_2027",
    default_report_preferences: prefs,
    available_report_languages: normalizeAvailableReportLanguages(o.available_report_languages),
    include_weather_default: includeWeather,
    preferred_workflow: normalizeInspectorWorkflowMode(
      o.preferred_workflow ?? "field_assistant",
    ),
    inspector_report_style_v1: normalizeInspectorReportStyleV1(
      o.inspector_report_style_v1 ?? STEVE_REPORT_STYLE_DEFAULTS,
    ),
    inspector_style_profile_v1: normalizeInspectorStyleProfileV1(
      o.inspector_style_profile_v1,
    ),
  };
  if (!input.display_name) {
    const computed = formatInspectorFullName(input);
    if (computed) input.display_name = computed;
  }
  if (certs.length === 0 && (input.association || input.certification_number)) {
    input.certifications = resolveCertificationEntries(input);
  }
  return input;
}

export function normalizeInspectorProfileRow(
  raw: unknown,
  userId: string,
): InspectorProfileRow | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const input = normalizeInspectorProfileInput(o);
  const created = str(o.created_at) ?? new Date().toISOString();
  const updated = str(o.updated_at) ?? created;
  return {
    user_id: userId,
    ...input,
    created_at: created,
    updated_at: updated,
  };
}

function flattenLegacy8I(o: ReportProfessionalSnapshotLegacy8I): ReportProfessionalSnapshotV1 {
  return { ...o, source_version: "8I" };
}

function flattenStored8J(o: ReportProfessionalSnapshotStored8J): ReportProfessionalSnapshotV1 {
  const prefs: LanguagePreferencesV1 = {
    ui: normalizeReportLocale(o.languages.ui),
    default_report: normalizeReportLocale(o.languages.report),
    available: o.languages.available?.length
      ? normalizeAvailableReportLocales(o.languages.available)
      : ["fr-CA", "en-CA"],
  };
  const entries = o.inspector.certification_entries ?? [];
  return {
    schema_version: 1,
    captured_at: o.created_at,
    company: o.company.name,
    company_address: o.company.address || undefined,
    website: o.company.website,
    inspector: o.inspector.name,
    title: o.inspector.title,
    certification: o.inspector.certifications,
    association: entries[0]?.association,
    license_number: o.inspector.license_number,
    insurance_provider: o.insurance.company,
    policy_number: o.insurance.policy,
    insurance_expiry: o.insurance.expiry,
    logo: o.company.logo,
    signature: o.inspector.signature,
    phone: o.company.phone,
    email: o.company.email,
    default_language: toWriterLanguage(prefs.ui),
    default_province: o.default_province,
    default_report_template: o.default_report_template,
    language_preferences: prefs,
    source_version: "8J",
  };
}

export function isSnapshotStored8J(raw: unknown): raw is ReportProfessionalSnapshotStored8J {
  return !!raw && typeof raw === "object" && (raw as Record<string, unknown>).version === "8J";
}

export function flattenReportProfessionalSnapshot(
  stored: ReportProfessionalSnapshotStored,
): ReportProfessionalSnapshotV1 {
  if (isSnapshotStored8J(stored)) return flattenStored8J(stored);
  return flattenLegacy8I(stored as ReportProfessionalSnapshotLegacy8I);
}

export function buildReportProfessionalSnapshotV1(
  profile: InspectorProfileInput,
  capturedAt = new Date().toISOString(),
  reportLocale?: ReportLocale,
): ReportProfessionalSnapshotStored8J {
  const inspectorName = resolveProfileDisplayName(profile);
  const certEntries = resolveCertificationEntries(profile);
  const certification =
    formatCertificationFromEntries(certEntries) || formatCertificationLabel(profile);
  const prefs = buildLanguagePreferencesV1(profile);
  const resolvedReport = reportLocale ?? prefs.default_report;
  const companyAddress = formatCompanyAddress(profile) || str(profile.address) || "";
  const legalSections = buildLegalSectionsSnapshotV1(resolvedReport, capturedAt);

  return {
    version: "8J",
    created_at: capturedAt,
    company: {
      name: str(profile.company_name) ?? "",
      logo: profileCompanyLogoUrl(profile),
      address: companyAddress,
      phone: profileBusinessPhone(profile) ?? "",
      email: profileBusinessEmail(profile) ?? "",
      website: str(profile.website) ?? undefined,
      city: str(profile.city) ?? undefined,
      province: str(profile.province) ?? undefined,
      postal_code: str(profile.postal_code) ?? undefined,
    },
    inspector: {
      name: inspectorName,
      title: profileProfessionalTitle(profile) ?? undefined,
      certifications: certification,
      certification_entries: certEntries.length > 0 ? certEntries : undefined,
      signature: profileSignatureUrl(profile),
      license_number: str(profile.license_number) ?? undefined,
    },
    insurance: {
      company: profileInsuranceCompany(profile) ?? undefined,
      policy: str(profile.policy_number) ?? undefined,
      expiry: str(profile.expiry_date) ?? undefined,
    },
    languages: {
      report: resolvedReport,
      ui: prefs.ui,
      available: prefs.available,
    },
    default_province: str(profile.default_province) ?? undefined,
    default_report_template: str(profile.default_report_template) ?? undefined,
    legal_sections_v1: legalSections,
  };
}

export function parseReportProfessionalSnapshotV1(
  raw: unknown,
): ReportProfessionalSnapshotV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  if (o.version === "8J") {
    const nested = raw as ReportProfessionalSnapshotStored8J;
    if (!str(nested.inspector?.name)) return null;
    return flattenStored8J(nested);
  }

  if (o.schema_version !== 1) return null;
  const inspector = str(o.inspector);
  if (!inspector) return null;
  return {
    schema_version: 1,
    captured_at: str(o.captured_at) ?? new Date().toISOString(),
    company: str(o.company) ?? "",
    company_address: str(o.company_address) ?? undefined,
    website: str(o.website) ?? undefined,
    inspector,
    title: str(o.title) ?? undefined,
    certification: str(o.certification) ?? "",
    association: str(o.association) ?? undefined,
    license_number: str(o.license_number) ?? undefined,
    insurance_provider: str(o.insurance_provider) ?? undefined,
    policy_number: str(o.policy_number) ?? undefined,
    insurance_expiry: str(o.insurance_expiry) ?? undefined,
    logo: str(o.logo),
    signature: str(o.signature),
    phone: str(o.phone) ?? "",
    email: str(o.email) ?? "",
    default_language: str(o.default_language) ?? undefined,
    default_province: str(o.default_province) ?? undefined,
    default_report_template: str(o.default_report_template) ?? undefined,
    language_preferences: parseLanguagePreferencesV1(o.language_preferences),
    source_version: "8I",
  };
}

export function readReportProfessionalSnapshotFromPayload(
  payload: Record<string, unknown> | null | undefined,
): ReportProfessionalSnapshotV1 | null {
  if (!payload) return null;
  return parseReportProfessionalSnapshotV1(payload[REPORT_PROFESSIONAL_SNAPSHOT_KEY]);
}

export function hasReportProfessionalSnapshot(
  payload: Record<string, unknown> | null | undefined,
): boolean {
  return readReportProfessionalSnapshotFromPayload(payload) != null;
}

export function buildInspectionDefaultsV1(
  profile: InspectorProfileInput,
  organizationId?: string | null,
): InspectionDefaultsV1 {
  const reportLang = resolveProfileDefaultReportLocale(profile);
  const prefs = profile.default_report_preferences ?? {};
  return {
    version: "1",
    organization_id: organizationId?.trim() || profile.organization_id?.trim() || undefined,
    report_language: reportLang,
    include_weather: profile.include_weather_default !== false,
    report_template: str(prefs.template) ?? str(profile.default_report_template) ?? undefined,
    province: str(prefs.province) ?? str(profile.default_province) ?? undefined,
  };
}

export function readInspectionDefaultsFromPayload(
  payload: Record<string, unknown> | null | undefined,
): InspectionDefaultsV1 | null {
  if (!payload) return null;
  const raw = payload[INSPECTION_DEFAULTS_V1_KEY];
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== "1") return null;
  return {
    version: "1",
    organization_id: str(o.organization_id) ?? undefined,
    report_language: normalizeReportLocale(o.report_language),
    include_weather: o.include_weather !== false,
    report_template: str(o.report_template) ?? undefined,
    province: str(o.province) ?? undefined,
  };
}

export function shouldAutoFetchWeather(
  payload: Record<string, unknown> | null | undefined,
): boolean {
  const defaults = readInspectionDefaultsFromPayload(payload);
  if (defaults) return defaults.include_weather;
  return true;
}

export function toInspectorProfileV1FromSnapshot(
  snapshot: ReportProfessionalSnapshotV1,
): InspectorProfileV1 {
  return {
    nom: snapshot.inspector,
    numero_certification: snapshot.certification,
    compagnie: snapshot.company,
    logo_data_url: snapshot.logo,
    signature_data_url: snapshot.signature,
  };
}

export function toCoverInspectorFieldsFromSnapshot(
  snapshot: ReportProfessionalSnapshotV1,
): CoverInspectorFields {
  return {
    inspecteur_nom: snapshot.inspector,
    inspecteur_numero_certification: snapshot.certification,
    compagnie: snapshot.company,
  };
}

export function applyProfessionalSnapshotToReportPayload(
  payload: Record<string, unknown>,
  profile: InspectorProfileInput,
  capturedAt?: string,
  organizationId?: string | null,
): Record<string, unknown> {
  const reportLocale = resolveProfileDefaultReportLocale(profile);
  const storedSnapshot = buildReportProfessionalSnapshotV1(profile, capturedAt, reportLocale);
  const flatSnapshot = flattenReportProfessionalSnapshot(storedSnapshot);
  const legacyProfile = toInspectorProfileV1FromSnapshot(flatSnapshot);
  const coverFields = toCoverInspectorFieldsFromSnapshot(flatSnapshot);
  const writerLang = toWriterLanguage(reportLocale);
  const defaults = buildInspectionDefaultsV1(profile, organizationId);
  const reportStyle = reportStyleFromProfile(
    profile.inspector_report_style_v1,
    profile.inspector_style_profile_v1,
  );
  const existingLegalSections = payload[LEGAL_SECTIONS_V1_KEY];
  const legalSections =
    parseLegalSectionsV1(existingLegalSections) ??
    storedSnapshot.legal_sections_v1 ??
    buildLegalSectionsSnapshotV1(reportLocale, capturedAt);
  const knowledgeBase = buildInspectionKnowledgeBaseV1(
    reportLocale.startsWith("en") ? "en-CA" : "fr-CA",
  );

  const next: Record<string, unknown> = {
    ...payload,
    [REPORT_PROFESSIONAL_SNAPSHOT_KEY]: isSnapshotStored8J(payload[REPORT_PROFESSIONAL_SNAPSHOT_KEY])
      ? payload[REPORT_PROFESSIONAL_SNAPSHOT_KEY]
      : storedSnapshot,
    [LEGAL_SECTIONS_V1_KEY]: legalSections,
    [INSPECTION_KNOWLEDGE_BASE_KEY]:
      payload[INSPECTION_KNOWLEDGE_BASE_KEY] ?? knowledgeBase,
    [INSPECTION_DEFAULTS_V1_KEY]: defaults,
    [INSPECTOR_PROFILE_PAYLOAD_KEY]: legacyProfile,
    [REPORT_LANGUAGE_PAYLOAD_KEY]: reportLocale,
    [INSPECTOR_REPORT_STYLE_V1_KEY]: reportStyle,
    language: writerLang,
  };

  if (profile.inspector_style_profile_v1) {
    next[INSPECTOR_STYLE_PROFILE_V1_KEY] = profile.inspector_style_profile_v1;
  }

  if (!readReportComplianceFromPayload(payload)) {
    next[REPORT_COMPLIANCE_V1_KEY] = buildReportComplianceV1(capturedAt);
  } else {
    next[REPORT_COMPLIANCE_V1_KEY] = payload[REPORT_COMPLIANCE_V1_KEY];
  }

  const coverRaw = payload[COVER_PAYLOAD_KEY];
  if (coverRaw && typeof coverRaw === "object") {
    next[COVER_PAYLOAD_KEY] = {
      ...(coverRaw as Record<string, unknown>),
      ...coverFields,
      language: writerLang,
    };
  }

  return next;
}

export function ensureLegacyInspectorPayloadFromSnapshot(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const snapshot = readReportProfessionalSnapshotFromPayload(payload);
  if (!snapshot) return payload;

  const next: Record<string, unknown> = { ...payload };
  const existingProfile = payload[INSPECTOR_PROFILE_PAYLOAD_KEY];
  const profileMissing =
    !existingProfile ||
    (typeof existingProfile === "object" &&
      !(existingProfile as Record<string, unknown>).nom);

  if (profileMissing) {
    next[INSPECTOR_PROFILE_PAYLOAD_KEY] = toInspectorProfileV1FromSnapshot(snapshot);
  }

  const coverRaw = payload[COVER_PAYLOAD_KEY];
  if (coverRaw && typeof coverRaw === "object") {
    const cover = coverRaw as Record<string, unknown>;
    if (cover.schema_version === 1) {
      const fields = toCoverInspectorFieldsFromSnapshot(snapshot);
      const needsCoverMerge =
        !str(cover.inspecteur_nom) ||
        !str(cover.inspecteur_numero_certification) ||
        !str(cover.compagnie);
      if (needsCoverMerge) {
        next[COVER_PAYLOAD_KEY] = { ...cover, ...fields };
      }
    }
  }

  return next;
}

export function resolveDeliveryProfileGate(
  payload: Record<string, unknown> | null | undefined,
  opts: { userHasProfile: boolean },
): DeliveryProfileGateState {
  if (hasReportProfessionalSnapshot(payload)) {
    return { blocked: false };
  }
  if (!opts.userHasProfile) {
    return { blocked: true, reason: "no_profile", canAttachSnapshot: false };
  }
  return { blocked: true, reason: "no_snapshot", canAttachSnapshot: true };
}

export async function loadInspectorProfileByUserId(
  supabase: SupabaseClient,
  userId: string,
): Promise<InspectorProfileRow | null> {
  const { data, error } = await supabase
    .from("inspector_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return normalizeInspectorProfileRow(data, userId);
}

export function inspectorProfileRowToInput(row: InspectorProfileRow): InspectorProfileInput {
  const { user_id: _uid, created_at: _c, updated_at: _u, ...input } = row;
  return input;
}

export function buildProfessionalSnapshotSaveBody(
  reportId: string,
  accessToken: string,
  profile: InspectorProfileInput,
): Record<string, unknown> {
  return {
    report_id: reportId,
    access_token: accessToken,
    [REPORT_PROFESSIONAL_SNAPSHOT_KEY]: buildReportProfessionalSnapshotV1(profile),
  };
}

export function snapshotsAreLegallyDistinct(
  a: ReportProfessionalSnapshotV1,
  b: ReportProfessionalSnapshotV1,
): boolean {
  return (
    a.captured_at !== b.captured_at ||
    a.inspector !== b.inspector ||
    a.certification !== b.certification
  );
}

export function storedSnapshotsAreLegallyDistinct(
  a: ReportProfessionalSnapshotStored,
  b: ReportProfessionalSnapshotStored,
): boolean {
  return snapshotsAreLegallyDistinct(
    flattenReportProfessionalSnapshot(a),
    flattenReportProfessionalSnapshot(b),
  );
}

export function protectedNamesFromSnapshot(
  snapshot: ReportProfessionalSnapshotV1 | null,
): string[] {
  if (!snapshot) return [];
  return [snapshot.inspector, snapshot.company].filter((n) => n.trim().length >= 2);
}

export function profileWriterLanguage(profile: InspectorProfileInput): ReportLanguage {
  return toWriterLanguage(resolveProfileDefaultReportLocale(profile));
}
