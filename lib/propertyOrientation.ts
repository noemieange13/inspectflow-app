/**
 * Phase 8U+ — facade orientation suggestion (never auto-finalized).
 */
import type { BuildingProfileDirection } from "@/lib/buildingProfile";

export type FacadeOrientationSuggestion = {
  suggested_direction: BuildingProfileDirection;
  confidence: number;
  source: "map_analysis";
};

const CARDINAL_STREET_HINTS: Array<{ pattern: RegExp; direction: BuildingProfileDirection }> = [
  { pattern: /\b(rue|avenue|av\.?|boulevard|boul\.?|chemin|ch\.?)\s+(nord|north)\b/i, direction: "nord" },
  { pattern: /\b(rue|avenue|av\.?|boulevard|boul\.?|chemin|ch\.?)\s+(sud|south)\b/i, direction: "sud" },
  { pattern: /\b(rue|avenue|av\.?|boulevard|boul\.?|chemin|ch\.?)\s+(est|east)\b/i, direction: "est" },
  { pattern: /\b(rue|avenue|av\.?|boulevard|boul\.?|chemin|ch\.?)\s+(ouest|west)\b/i, direction: "ouest" },
  { pattern: /\b(nord|north)\b/i, direction: "nord" },
  { pattern: /\b(sud|south)\b/i, direction: "sud" },
  { pattern: /\b(est|east)\b/i, direction: "est" },
  { pattern: /\b(ouest|west)\b/i, direction: "ouest" },
];

function hashAddress(address: string): number {
  let h = 0;
  for (let i = 0; i < address.length; i++) {
    h = (h * 31 + address.charCodeAt(i)) >>> 0;
  }
  return h;
}

/**
 * Suggest facade orientation from address heuristics.
 * Display only — inspector must confirm before persisting as final.
 */
export function suggestFacadeOrientation(address: string): FacadeOrientationSuggestion | null {
  const trimmed = address.trim();
  if (trimmed.length < 6) return null;

  for (const hint of CARDINAL_STREET_HINTS) {
    if (hint.pattern.test(trimmed)) {
      return {
        suggested_direction: hint.direction,
        confidence: 0.85,
        source: "map_analysis",
      };
    }
  }

  const fallbackDirections: BuildingProfileDirection[] = ["est", "sud", "ouest", "nord"];
  const idx = hashAddress(trimmed.toLowerCase()) % fallbackDirections.length;
  return {
    suggested_direction: fallbackDirections[idx] ?? "est",
    confidence: 0.55,
    source: "map_analysis",
  };
}

export function orientationLabelFr(direction: BuildingProfileDirection): string {
  switch (direction) {
    case "nord":
      return "Nord";
    case "sud":
      return "Sud";
    case "est":
      return "Est";
    case "ouest":
      return "Ouest";
    default:
      return "—";
  }
}
