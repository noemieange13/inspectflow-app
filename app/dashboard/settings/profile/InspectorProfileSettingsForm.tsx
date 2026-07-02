"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import CompanySettingsForm from "@/components/settings/CompanySettingsForm";
import InspectorProfileForm from "@/components/settings/InspectorProfileForm";
import { InsuranceSettingsForm } from "@/components/settings/InsuranceSettingsForm";
import ReportPreferencesForm from "@/components/settings/ReportPreferencesForm";
import StyleCalibrationSection from "@/components/settings/StyleCalibrationSection";
import { SaveBar } from "@/components/settings/FormPrimitives";
import type { InspectorProfileInput } from "@/lib/inspectorProfile";
import { normalizeInspectorProfileInput } from "@/lib/inspectorProfile";
import { isDevInspectorDashboardMode } from "@/lib/devInspectorMode";
import { useSupabaseAccessToken } from "@/lib/useSupabaseAccessToken";

const EMPTY: InspectorProfileInput = normalizeInspectorProfileInput({});

type Props = {
  organizationId?: string | null;
  accessToken?: string | null;
};

export default function InspectorProfileSettingsForm({
  organizationId,
  accessToken: navAccessToken,
}: Props) {
  const sessionToken = useSupabaseAccessToken();
  const bearerToken = sessionToken ?? navAccessToken ?? null;

  const [form, setForm] = useState<InspectorProfileInput>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const set =
    (key: keyof InspectorProfileInput) =>
    (value: string) => {
      setForm((prev) => ({ ...prev, [key]: value.trim() || null }));
      setSaved(false);
    };

  const loadProfile = useCallback(async () => {
    const useDevApi = isDevInspectorDashboardMode() && !bearerToken?.trim();
    if (!useDevApi && !bearerToken?.trim()) {
      setLoading(false);
      setError("Connectez-vous pour gérer votre profil professionnel.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = {};
      if (!useDevApi && bearerToken?.trim()) {
        headers.Authorization = `Bearer ${bearerToken.trim()}`;
      }
      const res = await fetch("/api/inspector-profile", { headers });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        profile?: InspectorProfileInput | null;
        error?: string;
      } | null;
      if (!res.ok || !body?.success) {
        setError(
          typeof body?.error === "string"
            ? body.error
            : "Impossible de charger le profil.",
        );
        return;
      }
      setForm(body.profile ? normalizeInspectorProfileInput(body.profile) : { ...EMPTY });
      if (body && "offline_message" in body && typeof body.offline_message === "string") {
        setError(null);
      }
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }, [bearerToken]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleSave = async () => {
    const useDevApi = isDevInspectorDashboardMode() && !bearerToken?.trim();
    if (!useDevApi && !bearerToken?.trim()) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (!useDevApi && bearerToken?.trim()) {
        headers.Authorization = `Bearer ${bearerToken.trim()}`;
      }
      const res = await fetch("/api/inspector-profile", {
        method: "PUT",
        headers,
        body: JSON.stringify(form),
      });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !body?.success) {
        setError(body?.error ?? "Enregistrement impossible.");
        return;
      }
      setSaved(true);
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Chargement du profil…</p>;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {saved ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Profil enregistré. Les prochaines inspections incluront automatiquement ces informations.
        </div>
      ) : null}

      <InspectorProfileForm form={form} set={set} />
      <InsuranceSettingsForm form={form} set={set} />
      <CompanySettingsForm
        form={form}
        set={set}
        bearerToken={bearerToken}
        organizationId={organizationId}
        onLogoUrl={(url) => {
          setForm((prev) => ({ ...prev, logo_url: url }));
          setSaved(false);
        }}
      />
      <ReportPreferencesForm
        form={form}
        set={set}
        setForm={setForm}
        bearerToken={bearerToken}
        organizationId={organizationId}
      />
      <StyleCalibrationSection form={form} setForm={setForm} bearerToken={bearerToken} />

      <div className="flex flex-wrap items-center gap-3">
        <SaveBar saving={saving} saved={saved} disabled={!bearerToken} onSave={() => void handleSave()} />
        <Link
          href="/dashboard/simple"
          className="text-sm font-medium text-slate-600 underline-offset-2 hover:underline"
        >
          Retour aux inspections
        </Link>
        {organizationId ? (
          <span className="text-xs text-slate-400">Org {organizationId.slice(0, 8)}…</span>
        ) : null}
      </div>
    </div>
  );
}
