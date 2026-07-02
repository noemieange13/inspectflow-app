"use client";

import { useCallback, useState } from "react";

import type { InspectorProfileInput } from "@/lib/inspectorProfile";
import type { InspectorReportStyleV1, InspectorStyleProfileV1 } from "@/lib/inspectorReportStyle";
import type { StyleMatchScores } from "@/lib/inspector_style_matcher";
import { Section } from "./FormPrimitives";

type Props = {
  form: InspectorProfileInput;
  setForm: React.Dispatch<React.SetStateAction<InspectorProfileInput>>;
  bearerToken: string | null;
};

const DETAIL_OPTIONS = [
  { value: "concise", label: "Concis" },
  { value: "standard", label: "Standard" },
  { value: "detailed", label: "Détaillé" },
] as const;

const TONE_OPTIONS = [
  { value: "direct", label: "Direct" },
  { value: "educational", label: "Pédagogique" },
  { value: "cautious", label: "Prudent" },
] as const;

const PHOTO_OPTIONS = [
  { value: "minimal", label: "Minimal" },
  { value: "standard", label: "Standard" },
  { value: "many", label: "Nombreuses" },
] as const;

const REC_OPTIONS = [
  { value: "short_action", label: "Action courte" },
  { value: "explanatory", label: "Explicatif" },
] as const;

function styleField<K extends keyof InspectorReportStyleV1>(
  style: InspectorReportStyleV1,
  key: K,
  value: InspectorReportStyleV1[K],
): InspectorReportStyleV1 {
  return { ...style, [key]: value };
}

export default function StyleCalibrationSection({ form, setForm, bearerToken }: Props) {
  const style = form.inspector_report_style_v1 ?? {
    version: "1" as const,
    detail_level: "detailed",
    tone: "educational",
    photo_density: "standard",
    recommendation_style: "explanatory",
  };

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [matchPreview, setMatchPreview] = useState<StyleMatchScores | null>(null);
  const [calibratedProfile, setCalibratedProfile] = useState<InspectorStyleProfileV1 | null>(
    form.inspector_style_profile_v1,
  );

  const updateStyle = useCallback(
    <K extends keyof InspectorReportStyleV1>(key: K, value: InspectorReportStyleV1[K]) => {
      setForm((prev) => ({
        ...prev,
        inspector_report_style_v1: styleField(
          prev.inspector_report_style_v1 ?? style,
          key,
          value,
        ),
      }));
    },
    [setForm, style],
  );

  const handleCalibrateUpload = async (file: File) => {
    if (!bearerToken?.trim()) {
      setUploadError("Connectez-vous pour importer un rapport.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/inspector-style/calibrate", {
        method: "POST",
        headers: { Authorization: `Bearer ${bearerToken.trim()}` },
        body,
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        inspector_report_style_v1?: InspectorReportStyleV1;
        style_profile?: InspectorStyleProfileV1;
        match_preview?: StyleMatchScores;
      } | null;
      if (!res.ok || !json?.success) {
        setUploadError(json?.error ?? "Échec de la calibration.");
        return;
      }
      if (json.inspector_report_style_v1) {
        setForm((prev) => ({
          ...prev,
          inspector_report_style_v1: json.inspector_report_style_v1!,
          inspector_style_profile_v1: json.style_profile ?? prev.inspector_style_profile_v1,
        }));
      }
      if (json.style_profile) setCalibratedProfile(json.style_profile);
      if (json.match_preview) setMatchPreview(json.match_preview);
    } catch {
      setUploadError("Erreur réseau.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Section title="Style de rapport (calibration)">
      <p className="text-sm text-slate-600">
        Ajustez le vocabulaire, le niveau de détail et le ton des rapports générés pour correspondre
        à votre pratique.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="detail_level" className="block text-sm font-medium text-slate-700">
            Niveau de détail
          </label>
          <select
            id="detail_level"
            value={style.detail_level}
            onChange={(e) =>
              updateStyle("detail_level", e.target.value as InspectorReportStyleV1["detail_level"])
            }
            className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {DETAIL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tone" className="block text-sm font-medium text-slate-700">
            Ton
          </label>
          <select
            id="tone"
            value={style.tone}
            onChange={(e) => updateStyle("tone", e.target.value as InspectorReportStyleV1["tone"])}
            className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {TONE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="photo_density" className="block text-sm font-medium text-slate-700">
            Densité photos
          </label>
          <select
            id="photo_density"
            value={style.photo_density}
            onChange={(e) =>
              updateStyle("photo_density", e.target.value as InspectorReportStyleV1["photo_density"])
            }
            className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {PHOTO_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            htmlFor="recommendation_style"
            className="block text-sm font-medium text-slate-700"
          >
            Style recommandations
          </label>
          <select
            id="recommendation_style"
            value={style.recommendation_style}
            onChange={(e) =>
              updateStyle(
                "recommendation_style",
                e.target.value as InspectorReportStyleV1["recommendation_style"],
              )
            }
            className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {REC_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
        <p className="text-sm font-medium text-slate-800">Calibrer avec mon ancien rapport</p>
        <p className="mt-1 text-xs text-slate-500">
          Importez un PDF d&apos;inspection passé. Seuls les signaux de style sont conservés — aucune
          donnée client.
        </p>
        <input
          type="file"
          accept="application/pdf,.pdf"
          disabled={uploading}
          className="mt-3 block w-full text-sm text-slate-600"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleCalibrateUpload(f);
          }}
        />
        {uploading ? <p className="mt-2 text-xs text-slate-500">Analyse en cours…</p> : null}
        {uploadError ? <p className="mt-2 text-xs text-red-600">{uploadError}</p> : null}
        {calibratedProfile ? (
          <p className="mt-2 text-xs text-emerald-700">
            Profil calibré le{" "}
            {new Date(calibratedProfile.calibrated_at).toLocaleDateString("fr-CA")} —{" "}
            {calibratedProfile.frequent_phrases.length} expressions typiques détectées.
          </p>
        ) : null}
        {matchPreview ? (
          <p className="mt-1 text-xs text-slate-600">
            Correspondance style : {matchPreview.overallPct}% (structure {matchPreview.structurePct}
            %, sections {matchPreview.sectionsPct}%)
          </p>
        ) : null}
      </div>
    </Section>
  );
}
