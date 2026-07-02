"use client";

import { useCallback, useEffect, useState } from "react";

import type { InspectorProfileInput } from "@/lib/inspectorProfile";
import { isInspectorProfileConfigured, normalizeInspectorProfileInput } from "@/lib/inspectorProfile";
import { useSupabaseAccessToken } from "@/lib/useSupabaseAccessToken";

import CompanySettingsForm from "@/components/settings/CompanySettingsForm";
import InspectorProfileForm from "@/components/settings/InspectorProfileForm";
import { InsuranceSettingsForm } from "@/components/settings/InsuranceSettingsForm";
import ReportPreferencesForm from "@/components/settings/ReportPreferencesForm";
import { SaveBar } from "@/components/settings/FormPrimitives";

const EMPTY = normalizeInspectorProfileInput({});

const STEPS = [
  { id: "company", title: "Entreprise", emoji: "🏢" },
  { id: "inspector", title: "Inspecteur", emoji: "👤" },
  { id: "report", title: "Rapport", emoji: "📄" },
  { id: "signature", title: "Signature", emoji: "✍️" },
] as const;

type Props = {
  organizationId?: string | null;
  onComplete?: () => void;
  onDismiss?: () => void;
};

export default function InspectorSetupWizard({
  organizationId,
  onComplete,
  onDismiss,
}: Props) {
  const sessionToken = useSupabaseAccessToken();
  const bearerToken = sessionToken ?? null;

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<InspectorProfileInput>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const set =
    (key: keyof InspectorProfileInput) =>
    (value: string) => {
      setForm((prev) => ({ ...prev, [key]: value.trim() || null }));
    };

  const loadProfile = useCallback(async () => {
    if (!bearerToken?.trim()) return;
    try {
      const res = await fetch("/api/inspector-profile", {
        headers: { Authorization: `Bearer ${bearerToken.trim()}` },
      });
      const body = (await res.json().catch(() => null)) as {
        profile?: InspectorProfileInput | null;
      } | null;
      if (body?.profile) setForm(normalizeInspectorProfileInput(body.profile));
    } catch {
      /* keep empty defaults */
    }
  }, [bearerToken]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const saveProfile = async (): Promise<boolean> => {
    if (!bearerToken?.trim()) {
      setError("Connectez-vous pour enregistrer votre profil.");
      return false;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/inspector-profile", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${bearerToken.trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });
      const body = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !body?.success) {
        setError(body?.error ?? "Enregistrement impossible.");
        return false;
      }
      return true;
    } catch {
      setError("Erreur réseau.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
      return;
    }
    const ok = await saveProfile();
    if (!ok) return;
    if (isInspectorProfileConfigured(form)) {
      setDone(true);
      onComplete?.();
    } else {
      setError("Indiquez au minimum votre nom et votre numéro de certification.");
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <p className="text-2xl">✅</p>
        <h2 className="mt-3 text-xl font-bold text-emerald-950">Votre espace InspectFlow est prêt</h2>
        <p className="mt-2 text-sm text-emerald-900">
          Vos prochaines inspections incluront automatiquement vos informations professionnelles.
        </p>
        <button
          type="button"
          onClick={() => onDismiss?.()}
          className="mt-6 inline-flex min-h-[44px] items-center rounded-xl bg-emerald-700 px-6 text-base font-semibold text-white hover:bg-emerald-800"
        >
          Commencer une inspection
        </button>
      </div>
    );
  }

  const current = STEPS[step]!;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-500">
          Configuration {step + 1} / {STEPS.length}
        </p>
        {onDismiss ? (
          <button type="button" onClick={onDismiss} className="text-sm text-slate-500 hover:text-slate-800">
            Plus tard
          </button>
        ) : null}
      </div>

      <div className="mb-6 flex gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-blue-600" : "bg-slate-200"}`}
            aria-hidden
          />
        ))}
      </div>

      <h2 className="text-xl font-bold text-slate-900">
        {current.emoji} {current.title}
      </h2>

      {error ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {step === 0 ? (
          <CompanySettingsForm
            form={form}
            set={set}
            bearerToken={bearerToken}
            organizationId={organizationId}
            onLogoUrl={(url) => setForm((prev) => ({ ...prev, logo_url: url }))}
          />
        ) : null}
        {step === 1 ? (
          <>
            <InspectorProfileForm form={form} set={set} />
            <InsuranceSettingsForm form={form} set={set} />
          </>
        ) : null}
        {step === 2 ? (
          <ReportPreferencesForm
            form={form}
            set={set}
            setForm={setForm}
            bearerToken={bearerToken}
            organizationId={organizationId}
          />
        ) : null}
        {step === 3 ? (
          <ReportPreferencesForm
            form={form}
            set={set}
            setForm={setForm}
            bearerToken={bearerToken}
            organizationId={organizationId}
          />
        ) : null}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 px-5 text-sm font-semibold text-slate-700"
          >
            Retour
          </button>
        ) : null}
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleNext()}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-blue-600 px-6 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-60 sm:flex-none"
        >
          {step === STEPS.length - 1
            ? saving
              ? "Finalisation…"
              : "Terminer"
            : "Continuer"}
        </button>
      </div>
    </div>
  );
}
