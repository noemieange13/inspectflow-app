"use client";

import type { InspectorProfileInput } from "@/lib/inspectorProfile";
import { Field, Section } from "./FormPrimitives";
import SignatureUpload from "./SignatureUpload";

type Props = {
  form: InspectorProfileInput;
  set: (key: keyof InspectorProfileInput) => (value: string) => void;
  setForm: React.Dispatch<React.SetStateAction<InspectorProfileInput>>;
  bearerToken: string | null;
  organizationId?: string | null;
};

export default function ReportPreferencesForm({
  form,
  set,
  setForm,
  bearerToken,
  organizationId,
}: Props) {
  return (
    <>
      <Section title="Rapports">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Langue interface"
            id="preferred_ui_language"
            value={form.preferred_ui_language ?? "fr-CA"}
            onChange={set("preferred_ui_language")}
            placeholder="fr-CA"
            hint="Langue de l'application."
          />
          <Field
            label="Langue rapport client par défaut"
            id="default_client_report_language"
            value={form.default_client_report_language ?? "fr-CA"}
            onChange={set("default_client_report_language")}
            placeholder="en-CA"
            hint="Langue remise au client."
          />
        </div>
        <fieldset className="text-sm">
          <legend className="font-medium text-slate-700">Langues disponibles pour livraison</legend>
          <div className="mt-2 flex flex-wrap gap-4">
            {(["fr", "en"] as const).map((lang) => {
              const selected = (form.available_report_languages ?? ["fr", "en"]).includes(lang);
              return (
                <label key={lang} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(e) => {
                      setForm((prev) => {
                        const current = prev.available_report_languages ?? ["fr", "en"];
                        const next = e.target.checked
                          ? [...new Set([...current, lang])]
                          : current.filter((l) => l !== lang);
                        return {
                          ...prev,
                          available_report_languages: next.length > 0 ? next : [lang],
                        };
                      });
                    }}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span>{lang === "fr" ? "Français" : "English"}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <Field label="Province par défaut" id="default_province" value={form.default_province ?? "ca_qc"} onChange={set("default_province")} />
        <Field
          label="Gabarit rapport par défaut"
          id="default_report_template"
          value={form.default_report_template ?? "QC_2027"}
          onChange={set("default_report_template")}
        />
        <div>
          <label htmlFor="preferred_creation_method" className="block text-sm font-medium text-slate-700">
            Création inspection par défaut
          </label>
          <select
            id="preferred_creation_method"
            value={
              form.default_report_preferences?.preferred_creation_method ?? "document_import"
            }
            onChange={(e) => {
              setForm((prev) => ({
                ...prev,
                default_report_preferences: {
                  ...(prev.default_report_preferences ?? {}),
                  preferred_creation_method: e.target.value,
                },
              }));
            }}
            className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm text-gray-900"
          >
            <option value="document_import">Importer courriel ou document</option>
            <option value="manual">Saisie manuelle</option>
          </select>
        </div>
        <div>
          <label htmlFor="preferred_workflow" className="block text-sm font-medium text-slate-700">
            Mode de travail par défaut
          </label>
          <select
            id="preferred_workflow"
            value={form.preferred_workflow ?? "field_assistant"}
            onChange={(e) => set("preferred_workflow")(e.target.value)}
            className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="field_assistant">Assistant terrain — photos pendant l&apos;inspection</option>
            <option value="post_inspection">Après inspection — import au retour au bureau</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Utilisé lors de la création d&apos;une nouvelle inspection.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.include_weather_default !== false}
            onChange={(e) => {
              setForm((prev) => ({
                ...prev,
                include_weather_default: e.target.checked,
              }));
            }}
            className="h-4 w-4 rounded border-slate-300"
          />
          <span className="text-slate-700">Inclure la météo automatiquement sur les nouvelles inspections</span>
        </label>
      </Section>

      <Section title="Signature">
        <SignatureUpload
          label="Signature sur les rapports"
          assetType="signature"
          currentUrl={form.signature_image_url}
          bearerToken={bearerToken}
          organizationId={organizationId}
          onUploaded={(url) => {
            setForm((prev) => ({ ...prev, signature_image_url: url }));
          }}
        />
      </Section>
    </>
  );
}
