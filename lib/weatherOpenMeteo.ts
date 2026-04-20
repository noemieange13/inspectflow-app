/**
 * Météo courante via Open-Meteo (sans clé API). Usage côté client uniquement.
 */

function wmoCodeLabelFr(code: number): string {
  if (code === 0) return "dégagé";
  if (code <= 3) return "nuageux";
  if (code <= 48) return "brouillard";
  if (code <= 57) return "bruine";
  if (code <= 67) return "pluie";
  if (code <= 77) return "neige";
  if (code <= 82) return "averses";
  if (code <= 86) return "averses de neige";
  if (code <= 99) return "orage";
  return "conditions variables";
}

export type WeatherSnapshot = {
  temperature_c: number;
  label_fr: string;
  line_fr: string;
};

export async function fetchWeatherOpenMeteo(
  latitude: number,
  longitude: number,
): Promise<WeatherSnapshot> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    "&current=temperature_2m,weather_code&timezone=auto";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = (await res.json()) as {
    current?: { temperature_2m?: number; weather_code?: number };
  };
  const t = data.current?.temperature_2m ?? NaN;
  const code = data.current?.weather_code ?? 0;
  const label = wmoCodeLabelFr(code);
  const tempRounded = Number.isFinite(t) ? Math.round(t) : NaN;
  const line = Number.isFinite(tempRounded)
    ? `${tempRounded}°C, ${label}`
    : label;
  return {
    temperature_c: tempRounded,
    label_fr: label,
    line_fr: line,
  };
}

export async function geocodeAddressOpenMeteo(
  address: string,
): Promise<{ latitude: number; longitude: number; label: string }> {
  const q = address.trim();
  if (!q) throw new Error("Adresse manquante pour la météo.");
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}` +
    "&count=1&language=fr&format=json";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Géocodage HTTP ${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{
      latitude: number;
      longitude: number;
      name?: string;
      admin1?: string;
      country?: string;
    }>;
  };
  const hit = data.results?.[0];
  if (!hit) throw new Error("Adresse introuvable pour la météo.");
  const label = [hit.name, hit.admin1, hit.country].filter(Boolean).join(", ");
  return { latitude: hit.latitude, longitude: hit.longitude, label: label || q };
}

export function geolocationPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Géolocalisation non disponible"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => {
        const msg = String(err?.message || "");
        if (msg.toLowerCase().includes("permissions policy")) {
          reject(
            new Error(
              "Géolocalisation bloquée par la politique du navigateur (Permissions Policy).",
            ),
          );
          return;
        }
        reject(new Error(msg || "Permission de localisation refusée."));
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 60_000,
      },
    );
  });
}
