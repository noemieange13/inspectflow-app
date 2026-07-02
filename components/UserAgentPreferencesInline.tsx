"use client";

import type { ReportLanguage } from "@/lib/reportNarrative";
import type { UserAgentProfile } from "@/lib/userAgentProfile";

type Props = {
  profile: UserAgentProfile;
  language: ReportLanguage;
  onChange: (patch: Partial<UserAgentProfile>) => void;
};

/**
 * Mémoire utilisateur légère — influence guide terrain + résumé acheteur.
 */
export default function UserAgentPreferencesInline({
  profile,
  language,
  onChange,
}: Props) {
  return (
    <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2 text-xs text-violet-950">
      <p className="font-semibold text-violet-900">
        {language === "en" ? "Agent memory" : "Mémoire agent"}
      </p>
      <label className="mt-2 flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="rounded border-violet-300"
          checked={profile.prefers_short_reports}
          onChange={(e) => onChange({ prefers_short_reports: e.target.checked })}
        />
        {language === "en"
          ? "Shorter buyer summaries"
          : "Résumés acheteur plus courts"}
      </label>
      <label className="mt-1.5 flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="rounded border-violet-300"
          checked={profile.strict_on_roof}
          onChange={(e) => onChange({ strict_on_roof: e.target.checked })}
        />
        {language === "en"
          ? "Prioritize roof in field guide"
          : "Prioriser la toiture dans le guide terrain"}
      </label>
    </div>
  );
}
