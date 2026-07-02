function devAuthBypassFlag(): string {
  return (
    process.env.DEV_AUTH_BYPASS ??
    process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS ??
    ""
  ).trim().toLowerCase();
}

/**
 * Phase 8G / 9C — identité inspecteur dev unique (jamais en production).
 */
export function isDevAuthBypass(): boolean {
  if (process.env.NODE_ENV !== "development") return false;
  const flag = devAuthBypassFlag();
  return flag === "true" || flag === "1" || flag === "yes";
}

export function isDevInspectorDashboardMode(): boolean {
  return isDevAuthBypass();
}

export type DevInspectorIdentity = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  company: string;
  role: string;
};

export const DEV_INSPECTOR: DevInspectorIdentity = {
  id: "dev-steve",
  email: "steve@inspectflow.local",
  first_name: "Steve",
  last_name: "Charbonneau",
  company: "InspectFlow Pilot",
  role: "inspector",
};

export const DEV_INSPECTOR_DISPLAY_NAME = DEV_INSPECTOR.first_name;

export const DEV_MODE_BANNER_LABEL = `DEV MODE — ${DEV_INSPECTOR.first_name} ${DEV_INSPECTOR.last_name}`;

export function devInspectorFullName(): string {
  return `${DEV_INSPECTOR.first_name} ${DEV_INSPECTOR.last_name}`.trim();
}

export const DEV_INSPECTOR_ATTRIBUTION_KEY = "dev_inspector_v1" as const;

/** Attache l'identité dev au payload rapport / observations (audit cohérent). */
export function stampDevInspectorAttribution(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (!isDevAuthBypass()) return payload;
  return {
    ...payload,
    [DEV_INSPECTOR_ATTRIBUTION_KEY]: {
      id: DEV_INSPECTOR.id,
      email: DEV_INSPECTOR.email,
      first_name: DEV_INSPECTOR.first_name,
      last_name: DEV_INSPECTOR.last_name,
      name: devInspectorFullName(),
      company: DEV_INSPECTOR.company,
      role: DEV_INSPECTOR.role,
    },
  };
}

export function enrichDevInspectorAuditMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const base = metadata ?? {};
  if (!isDevAuthBypass()) return base;
  return {
    ...base,
    inspector_id: DEV_INSPECTOR.id,
    inspector_name: devInspectorFullName(),
    inspector_company: DEV_INSPECTOR.company,
  };
}

export function resolveDevInspectorLearningId(): string {
  return DEV_INSPECTOR.id;
}
