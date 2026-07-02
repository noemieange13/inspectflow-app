"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import type { DeliveryProfileGateState } from "@/lib/inspectorProfile";
import { useSupabaseAccessToken } from "@/lib/useSupabaseAccessToken";

type Props = {
  reportId: string;
  viewerToken?: string;
  gate: Extract<DeliveryProfileGateState, { blocked: true }>;
  language?: "fr" | "en";
  onSnapshotAttached?: () => void;
};

export default function InspectorProfileDeliveryPrompt({
  reportId,
  viewerToken,
  gate,
  language = "fr",
  onSnapshotAttached,
}: Props) {
  const sessionToken = useSupabaseAccessToken();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const settingsHref = "/dashboard/settings/profile";

  const attachSnapshot = useCallback(async () => {
    if (!viewerToken) return;
    setBusy(true);
    setError(null);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (sessionToken?.trim()) {
        headers.Authorization = `Bearer ${sessionToken.trim()}`;
      }
      const res = await fetch("/api/report-professional-snapshot", {
        method: "POST",
        headers,
        body: JSON.stringify({
          report_id: reportId,
          access_token: viewerToken,
          refresh_from_profile: true,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !body?.success) {
        setError(body?.error ?? (language === "en" ? "Unable to attach profile." : "Impossible d'ajouter le profil."));
        return;
      }
      setDone(true);
      onSnapshotAttached?.();
    } catch {
      setError(language === "en" ? "Network error." : "Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }, [viewerToken, sessionToken, reportId, language, onSnapshotAttached]);

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900">
        {language === "en"
          ? "Professional profile attached to this report. You can now deliver it."
          : "Profil professionnel ajouté à ce rapport. Vous pouvez maintenant le livrer."}
      </div>
    );
  }

  if (gate.reason === "no_profile") {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <p className="text-base font-semibold text-amber-950">
          {language === "en"
            ? "Let's complete your professional profile."
            : "Complétons votre profil professionnel."}
        </p>
        <p className="mt-2 text-sm text-amber-900">
          {language === "en"
            ? "You only need to do this once. Delivery is blocked until your profile is saved."
            : "Vous ne devrez le faire qu'une fois. La livraison est bloquée tant que le profil n'est pas enregistré."}
        </p>
        <Link
          href={settingsHref}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-amber-700 px-4 text-sm font-semibold text-white hover:bg-amber-800"
        >
          {language === "en" ? "Configure profile" : "Configurer mon profil"}
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
      <p className="text-base font-semibold text-blue-950">
        {language === "en"
          ? "Attach your professional profile to this report"
          : "Ajoutez votre profil professionnel à ce rapport"}
      </p>
      <p className="mt-2 text-sm text-blue-900">
        {language === "en"
          ? "This report was created before your profile was saved. Attach a snapshot to unlock delivery."
          : "Ce rapport a été créé avant l'enregistrement de votre profil. Ajoutez un instantané pour débloquer la livraison."}
      </p>
      {error ? (
        <p className="mt-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          disabled={busy || !viewerToken}
          onClick={() => void attachSnapshot()}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy
            ? language === "en"
              ? "Attaching…"
              : "Ajout en cours…"
            : language === "en"
              ? "Attach profile to report"
              : "Actualiser le snapshot"}
        </button>
        <Link
          href={settingsHref}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-blue-300 bg-white px-4 text-sm font-medium text-blue-900"
        >
          {language === "en" ? "Edit profile" : "Modifier le profil"}
        </Link>
      </div>
    </div>
  );
}
