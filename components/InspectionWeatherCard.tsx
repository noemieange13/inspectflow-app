"use client";

import { useCallback, useState } from "react";

import { humanInspectorError } from "@/lib/commercialCopy8g";
import { useNetworkStatus } from "@/lib/hooks/useNetworkStatus";
import {
  buildWeatherSaveBody,
  formatWeatherRecordedTime,
  mergeInspectionWeatherEdits,
  type InspectionWeatherDraft,
  type InspectionWeatherV1,
} from "@/lib/weather/inspectionWeather";
import { localizeWeatherCondition, weatherFieldLabels } from "@/lib/weather/weatherLabels";
import { fetchInspectionWeather } from "@/lib/weather/weatherProvider";
import type { ReportLocale } from "@/lib/reportLocale";

type Props = {
  reportId: string;
  viewerToken?: string;
  address?: string;
  language?: "fr" | "en";
  reportLocale?: ReportLocale;
  initialWeather: InspectionWeatherV1 | null;
  onWeatherChange?: (weather: InspectionWeatherV1) => void;
};

async function persistWeather(
  reportId: string,
  accessToken: string,
  weather: InspectionWeatherV1,
): Promise<void> {
  const res = await fetch("/api/inspection-weather", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildWeatherSaveBody(reportId, accessToken, weather)),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
  if (!res.ok || !body?.success) {
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
}

export default function InspectionWeatherCard({
  reportId,
  viewerToken,
  address,
  language = "fr",
  reportLocale,
  initialWeather,
  onWeatherChange,
}: Props) {
  const displayLocale = reportLocale ?? (language === "en" ? "en-CA" : "fr-CA");
  const labels = weatherFieldLabels(displayLocale);
  const { isOnline } = useNetworkStatus();
  const [weather, setWeather] = useState<InspectionWeatherV1 | null>(initialWeather);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<InspectionWeatherDraft>({});

  const applyWeather = useCallback(
    (next: InspectionWeatherV1) => {
      setWeather(next);
      onWeatherChange?.(next);
    },
    [onWeatherChange],
  );

  const saveWeather = useCallback(
    async (next: InspectionWeatherV1) => {
      const token = viewerToken?.trim();
      if (!token) {
        applyWeather(next);
        return;
      }
      setSaving(true);
      setErr(null);
      try {
        await persistWeather(reportId, token, next);
        applyWeather(next);
      } catch (e) {
        setErr(
          humanInspectorError({
            language,
            kind: "network",
            raw: e instanceof Error ? e.message : undefined,
          }),
        );
        applyWeather(next);
      } finally {
        setSaving(false);
      }
    },
    [applyWeather, language, reportId, viewerToken],
  );

  const handleRefresh = useCallback(async () => {
    if (!isOnline) {
      setErr(
        language === "en"
          ? "Offline — showing last saved weather."
          : "Hors ligne — dernière météo enregistrée affichée.",
      );
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const fetched = await fetchInspectionWeather({ address });
      const merged = weather?.notes
        ? mergeInspectionWeatherEdits(fetched, { notes: weather.notes })
        : fetched;
      await saveWeather(merged);
    } catch (e) {
      setErr(
        humanInspectorError({
          language,
          kind: "network",
          raw: e instanceof Error ? e.message : undefined,
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [address, isOnline, language, saveWeather, weather?.notes]);

  const startEdit = useCallback(() => {
    if (!weather) return;
    setDraft({
      temperature_c: weather.temperature_c,
      condition: weather.condition,
      humidity: weather.humidity,
      wind_speed: weather.wind_speed,
      notes: weather.notes,
    });
    setEditing(true);
  }, [weather]);

  const commitEdit = useCallback(async () => {
    if (!weather) return;
    const merged = mergeInspectionWeatherEdits(weather, {
      ...draft,
      recorded_at: new Date().toISOString(),
    });
    await saveWeather(merged);
    setEditing(false);
  }, [draft, saveWeather, weather]);

  const offlineBanner =
    !isOnline && weather
      ? language === "en"
        ? "Offline — last saved weather"
        : "Hors ligne — dernière météo enregistrée"
      : null;

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
      aria-label={language === "en" ? "Weather conditions" : "Conditions météo"}
    >
      <h2 className="text-sm font-semibold text-slate-900">☀️ Conditions météo</h2>

      {offlineBanner ? (
        <p className="mt-2 text-xs text-amber-800" role="status">
          {offlineBanner}
        </p>
      ) : null}

      {weather && !editing ? (
        <dl className="mt-3 space-y-1.5 text-sm text-slate-700">
          <div className="flex justify-between gap-4">
            <dt>{labels.temperature}</dt>
            <dd className="font-medium tabular-nums text-slate-900">{weather.temperature_c}°C</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>{labels.condition}</dt>
            <dd className="font-medium text-slate-900">
              {localizeWeatherCondition(weather.condition, displayLocale)}
            </dd>
          </div>
          {weather.wind_speed != null ? (
            <div className="flex justify-between gap-4">
              <dt>{labels.wind}</dt>
              <dd className="font-medium tabular-nums text-slate-900">
                {weather.wind_speed} km/h
              </dd>
            </div>
          ) : null}
          {weather.humidity != null ? (
            <div className="flex justify-between gap-4">
              <dt>{labels.humidity}</dt>
              <dd className="font-medium tabular-nums text-slate-900">{weather.humidity}%</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt>{labels.recordedAt}</dt>
            <dd className="font-medium tabular-nums text-slate-900">
              {formatWeatherRecordedTime(weather.recorded_at, language)}
            </dd>
          </div>
          {weather.notes ? (
            <div className="pt-1">
              <dt className="text-slate-500">{labels.notes}</dt>
              <dd className="mt-1 text-slate-800">{weather.notes}</dd>
            </div>
          ) : null}
        </dl>
      ) : weather && editing ? (
        <div className="mt-3 space-y-3">
          <label className="block text-sm">
            <span className="text-slate-600">
              {language === "en" ? "Temperature (°C)" : "Température (°C)"}
            </span>
            <input
              type="number"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={draft.temperature_c ?? weather.temperature_c}
              onChange={(e) =>
                setDraft((d) => ({ ...d, temperature_c: Number(e.target.value) }))
              }
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">{language === "en" ? "Condition" : "Condition"}</span>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              value={draft.condition ?? weather.condition}
              onChange={(e) => setDraft((d) => ({ ...d, condition: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">{language === "en" ? "Notes" : "Notes"}</span>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              rows={2}
              placeholder={
                language === "en"
                  ? "e.g. Heavy rain during roof inspection"
                  : "ex. Pluie forte durant inspection toiture"
              }
              value={draft.notes ?? weather.notes ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void commitEdit()}
              disabled={saving}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {language === "en" ? "Save" : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700"
            >
              {language === "en" ? "Cancel" : "Annuler"}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-600">
          {language === "en"
            ? "No weather recorded yet."
            : "Aucune météo enregistrée pour le moment."}
        </p>
      )}

      {err ? (
        <p className="mt-2 text-sm text-rose-700" role="alert">
          {err}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={loading || saving}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
        >
          {loading || saving
            ? language === "en"
              ? "Updating…"
              : "Mise à jour…"
            : language === "en"
              ? "Update weather"
              : "Mettre à jour météo"}
        </button>
        {weather && !editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-medium text-blue-600 underline hover:text-blue-800"
          >
            {language === "en" ? "Edit manually" : "Modifier manuellement"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** Called on workspace mount to auto-fetch weather when none saved. */
export async function loadOrFetchInspectionWeather(opts: {
  address?: string;
  saved: InspectionWeatherV1 | null;
  isOnline: boolean;
}): Promise<InspectionWeatherV1 | null> {
  if (opts.saved) return opts.saved;
  if (!opts.isOnline) return null;
  try {
    return await fetchInspectionWeather({ address: opts.address });
  } catch {
    return null;
  }
}
