/**
 * Phase 8G — interchangeable weather provider (default: Open-Meteo, no API key).
 */

import {
  geocodeAddressOpenMeteo,
  geolocationPosition,
} from "@/lib/weatherOpenMeteo";
import {
  wmoCodeToConditionFr,
  type InspectionWeatherV1,
} from "@/lib/weather/inspectionWeather";

export type WeatherFetchInput = {
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationLabel?: string | null;
};

export type WeatherProvider = {
  fetchCurrent(input: WeatherFetchInput): Promise<InspectionWeatherV1>;
};

type OpenMeteoCurrent = {
  temperature_2m?: number;
  weather_code?: number;
  relative_humidity_2m?: number;
  wind_speed_10m?: number;
};

async function resolveCoordinates(
  input: WeatherFetchInput,
): Promise<{ latitude: number; longitude: number; location: string | null }> {
  if (
    typeof input.latitude === "number" &&
    Number.isFinite(input.latitude) &&
    typeof input.longitude === "number" &&
    Number.isFinite(input.longitude)
  ) {
    return {
      latitude: input.latitude,
      longitude: input.longitude,
      location: input.locationLabel?.trim() || null,
    };
  }

  const address = input.address?.trim();
  if (address) {
    const geo = await geocodeAddressOpenMeteo(address);
    return {
      latitude: geo.latitude,
      longitude: geo.longitude,
      location: geo.label,
    };
  }

  const pos = await geolocationPosition();
  return {
    latitude: pos.coords.latitude,
    longitude: pos.coords.longitude,
    location: input.locationLabel?.trim() || null,
  };
}

async function fetchOpenMeteoCurrent(
  latitude: number,
  longitude: number,
): Promise<OpenMeteoCurrent> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    "&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m&timezone=auto";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = (await res.json()) as { current?: OpenMeteoCurrent };
  return data.current ?? {};
}

function snapshotFromOpenMeteo(
  current: OpenMeteoCurrent,
  location: string | null,
): InspectionWeatherV1 {
  const code = current.weather_code ?? 0;
  const temp = current.temperature_2m ?? NaN;
  return {
    temperature_c: Number.isFinite(temp) ? Math.round(temp) : 0,
    condition: wmoCodeToConditionFr(code),
    humidity:
      typeof current.relative_humidity_2m === "number" &&
      Number.isFinite(current.relative_humidity_2m)
        ? Math.round(current.relative_humidity_2m)
        : null,
    wind_speed:
      typeof current.wind_speed_10m === "number" && Number.isFinite(current.wind_speed_10m)
        ? Math.round(current.wind_speed_10m * 10) / 10
        : null,
    recorded_at: new Date().toISOString(),
    location,
    notes: null,
  };
}

export const openMeteoWeatherProvider: WeatherProvider = {
  async fetchCurrent(input) {
    const { latitude, longitude, location } = await resolveCoordinates(input);
    const current = await fetchOpenMeteoCurrent(latitude, longitude);
    return snapshotFromOpenMeteo(current, location);
  },
};

let defaultProvider: WeatherProvider = openMeteoWeatherProvider;

export function getWeatherProvider(): WeatherProvider {
  return defaultProvider;
}

/** Test hook — swap provider without touching production default. */
export function setWeatherProviderForTests(provider: WeatherProvider | null): void {
  defaultProvider = provider ?? openMeteoWeatherProvider;
}

export async function fetchInspectionWeather(
  input: WeatherFetchInput,
  provider: WeatherProvider = getWeatherProvider(),
): Promise<InspectionWeatherV1> {
  return provider.fetchCurrent(input);
}
