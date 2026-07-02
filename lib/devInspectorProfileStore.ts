import {
  DEV_INSPECTOR,
  devInspectorFullName,
  isDevAuthBypass,
} from "@/lib/devInspectorMode";
import {
  isInspectorProfileConfigured,
  normalizeInspectorProfileInput,
  type InspectorProfileInput,
} from "@/lib/inspectorProfile";

let localOverrides: Partial<InspectorProfileInput> = {};

export function resetDevInspectorProfileOverrides(): void {
  localOverrides = {};
}

export function mergeDevInspectorProfilePatch(
  patch: InspectorProfileInput,
): InspectorProfileInput {
  localOverrides = { ...localOverrides, ...patch };
  return buildDevInspectorProfileInput();
}

/** Profil Steve par défaut + surcharges locales (dev uniquement). */
export function buildDevInspectorProfileInput(): InspectorProfileInput {
  return normalizeInspectorProfileInput({
    first_name: DEV_INSPECTOR.first_name,
    last_name: DEV_INSPECTOR.last_name,
    display_name: devInspectorFullName(),
    email: DEV_INSPECTOR.email,
    company_name: DEV_INSPECTOR.company,
    professional_title: "Inspecteur en bâtiment",
    association: "AIBQ",
    certification_number: "PILOT-001",
    default_language: "fr",
    preferred_ui_language: "fr-CA",
    default_client_report_language: "fr-CA",
    default_province: "ca_qc",
    ...localOverrides,
  });
}

export function isDevInspectorProfileConfigured(): boolean {
  if (!isDevAuthBypass()) return false;
  return isInspectorProfileConfigured(buildDevInspectorProfileInput());
}
