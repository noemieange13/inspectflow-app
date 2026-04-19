/**
 * Préférences inspecteur / personnalisation légère de l’agent (localStorage).
 */

export type UserAgentProfile = {
  prefers_short_reports: boolean;
  strict_on_roof: boolean;
};

const STORAGE_KEY = "inspectflow:user-agent-profile-v1";

export const DEFAULT_USER_AGENT_PROFILE: UserAgentProfile = {
  prefers_short_reports: false,
  strict_on_roof: false,
};

export function loadUserAgentProfile(): UserAgentProfile {
  if (typeof window === "undefined") return { ...DEFAULT_USER_AGENT_PROFILE };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_AGENT_PROFILE };
    const o = JSON.parse(raw) as Partial<UserAgentProfile>;
    return {
      prefers_short_reports: !!o.prefers_short_reports,
      strict_on_roof: !!o.strict_on_roof,
    };
  } catch {
    return { ...DEFAULT_USER_AGENT_PROFILE };
  }
}

export function saveUserAgentProfile(patch: Partial<UserAgentProfile>): UserAgentProfile {
  const next: UserAgentProfile = {
    ...loadUserAgentProfile(),
    ...patch,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export type ReportViewMode = "inspector" | "buyer";

const VIEW_STORAGE = "inspectflow:report-view-mode-v1";

export function loadReportViewMode(): ReportViewMode {
  if (typeof window === "undefined") return "inspector";
  try {
    const v = localStorage.getItem(VIEW_STORAGE);
    if (v === "buyer" || v === "inspector") return v;
  } catch {
    /* ignore */
  }
  return "inspector";
}

export function saveReportViewMode(mode: ReportViewMode): void {
  try {
    localStorage.setItem(VIEW_STORAGE, mode);
  } catch {
    /* ignore */
  }
}
