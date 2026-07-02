/**
 * Libellés météo bilingues — données brutes dans `inspection_weather_v1`, localisation à l'affichage.
 */

import type { ReportLanguage } from "@/lib/reportNarrative";
import { toWriterLanguage, type ReportLocale } from "@/lib/reportLocale";

const CONDITION_FR_TO_EN: Record<string, string> = {
  Ensoleillé: "Sunny",
  Nuageux: "Cloudy",
  Brouillard: "Foggy",
  Bruine: "Drizzle",
  Pluie: "Rain",
  Neige: "Snow",
  Averses: "Showers",
  "Averses de neige": "Snow showers",
  Orage: "Thunderstorm",
  "Conditions variables": "Variable conditions",
};

const CONDITION_EN_TO_FR: Record<string, string> = Object.fromEntries(
  Object.entries(CONDITION_FR_TO_EN).map(([fr, en]) => [en.toLowerCase(), fr]),
);

function resolveWriterLanguage(language: ReportLanguage | ReportLocale): ReportLanguage {
  if (language === "fr" || language === "en") return language;
  return toWriterLanguage(language);
}

export function weatherFieldLabels(
  language: ReportLanguage | ReportLocale = "fr",
): {
  condition: string;
  temperature: string;
  humidity: string;
  wind: string;
  recordedAt: string;
  location: string;
  notes: string;
} {
  const lang = resolveWriterLanguage(language);
  if (lang === "en") {
    return {
      condition: "Conditions",
      temperature: "Temperature",
      humidity: "Humidity",
      wind: "Wind",
      recordedAt: "Recorded at",
      location: "Location",
      notes: "Notes",
    };
  }
  return {
    condition: "Conditions",
    temperature: "Température",
    humidity: "Humidité",
    wind: "Vent",
    recordedAt: "Enregistré à",
    location: "Lieu",
    notes: "Notes",
  };
}

/** Localise la condition stockée (souvent FR depuis WMO) sans altérer le payload. */
export function localizeWeatherCondition(
  condition: string,
  language: ReportLanguage | ReportLocale,
): string {
  const trimmed = condition.trim();
  if (!trimmed) return trimmed;
  const lang = resolveWriterLanguage(language);
  if (lang === "en") {
    return CONDITION_FR_TO_EN[trimmed] ?? trimmed;
  }
  const fromEn = CONDITION_EN_TO_FR[trimmed.toLowerCase()];
  return fromEn ?? trimmed;
}

export function formatWeatherSummary(
  weather: {
    condition: string;
    temperature_c: number;
    humidity: number | null;
    wind_speed: number | null;
  },
  language: ReportLanguage | ReportLocale,
): string {
  const labels = weatherFieldLabels(language);
  const condition = localizeWeatherCondition(weather.condition, language);
  const parts = [`${labels.temperature}: ${weather.temperature_c} °C`, condition];
  if (weather.humidity != null) {
    parts.push(`${labels.humidity}: ${weather.humidity} %`);
  }
  if (weather.wind_speed != null) {
    parts.push(`${labels.wind}: ${weather.wind_speed} km/h`);
  }
  return parts.join(" · ");
}
