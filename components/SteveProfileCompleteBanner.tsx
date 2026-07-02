"use client";

import Link from "next/link";

import { isFieldValidationMode } from "@/lib/fieldDevMode";

type Props = {
  language?: "fr" | "en";
  profileComplete: boolean;
};

/**
 * Shown on field workspace when inspector profile (8J) is incomplete.
 * Hidden when profile OK.
 */
export default function SteveProfileCompleteBanner({
  language = "fr",
  profileComplete,
}: Props) {
  if (profileComplete) return null;

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-sm font-semibold text-amber-950">
        {language === "en"
          ? "One-time setup — your name on reports"
          : "Configuration unique — votre nom sur les rapports"}
      </p>
      <p className="mt-1 text-sm text-amber-900">
        {language === "en"
          ? "Complete your profile once. Future reports will include it automatically."
          : "Complétez votre profil une seule fois. Vos prochains rapports l'incluront automatiquement."}
      </p>
      <Link
        href="/dashboard/settings/profile"
        className="mt-3 inline-flex min-h-[48px] items-center rounded-lg bg-amber-700 px-4 text-sm font-semibold text-white hover:bg-amber-800"
      >
        {language === "en" ? "Complete profile" : "Compléter mon profil"}
      </Link>
    </div>
  );
}

export function isSteveProfileCompleteFromPayload(
  payload: Record<string, unknown> | null | undefined,
): boolean {
  if (!payload) return false;
  const snap = payload.report_professional_snapshot_v1;
  if (!snap || typeof snap !== "object") return false;
  const o = snap as Record<string, unknown>;
  if (o.version !== "8J") return false;
  const inspector = o.inspector;
  if (!inspector || typeof inspector !== "object") return false;
  const name = (inspector as { name?: string }).name;
  return typeof name === "string" && name.trim().length > 0;
}

/** Dev-only subtle link to advanced mode. */
export function SteveAdvancedModeLink({
  language,
  onAdvancedMode,
}: {
  language: "fr" | "en";
  onAdvancedMode: () => void;
}) {
  if (!isFieldValidationMode()) return null;

  return (
    <button
      type="button"
      onClick={onAdvancedMode}
      className="mt-6 w-full text-center text-[11px] text-slate-400 underline hover:text-slate-600"
    >
      {language === "en" ? "Advanced mode (dev)" : "Mode avancé (dev)"}
    </button>
  );
}
