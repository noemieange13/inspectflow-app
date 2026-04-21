import type { ZoneCode } from "@/lib/reportNarrative";
import { ZONES } from "@/lib/reportNarrative";

const ZONE_SET = new Set<string>(ZONES.map((z) => z.value));

function isZoneCode(v: string): v is ZoneCode {
  return ZONE_SET.has(v);
}

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Motifs (texte normalisé) → zone cible ; le premier match fort l’emporte si score unique. */
const KEYWORD_RULES: Array<{ zone: ZoneCode; patterns: RegExp[] }> = [
  {
    zone: "toiture",
    patterns: [
      /\btoiture\b/,
      /\broof\b/,
      /\bshingle\b/,
      /\bbardeau\b/,
      /\bcomble\b.*\bexterieur\b/,
      /\bgutter\b/,
      /\bgouttiere\b/,
    ],
  },
  {
    zone: "installation_electrique",
    patterns: [
      /\bpanneau\b/,
      /\bbreaker\b/,
      /\bdisjoncteur\b/,
      /\btableau\b.*\belectrique\b/,
      /\belectrique\b.*\btableau\b/,
      /\bservice\s+entree\b/,
      /\bentree\s+de\s+service\b/,
      /\bcompteur\b/,
      /\belectrique\b/,
      /\belectrical\b/,
      /\bwiring\b/,
      /\bcablage\b/,
      /\bprise\b.*\bmur\b/,
      /\boutlet\b/,
      /\bbranchement\b/,
    ],
  },
  {
    zone: "plomberie",
    patterns: [
      /\bplomberie\b/,
      /\bplumbing\b/,
      /\btuyau\b/,
      /\bpipe\b/,
      /\bdrain\b/,
      /\bevier\b/,
      /\bsink\b/,
      /\bwc\b/,
      /\btoilet\b/,
    ],
  },
  {
    zone: "fondation",
    patterns: [
      /\bfondation\b/,
      /\bfoundation\b/,
      /\bsemelle\b/,
      /\bfooting\b/,
      /\bvide sanitaire\b/,
      /\bcrawl\s*space\b/,
    ],
  },
  {
    zone: "facade",
    patterns: [
      /\bfa[cç]ade\b/,
      /\bcladding\b/,
      /\brevetement\b.*\bmur\b/,
      /\bsiding\b/,
      /\bmur exterieur\b/,
      /\bexterior wall\b/,
    ],
  },
  {
    zone: "grenier",
    patterns: [
      /\bgrenier\b/,
      /\battic\b/,
      /\bcombles\b/,
      /\brafters\b/,
    ],
  },
  {
    zone: "sous_sol",
    patterns: [
      /\bsous[- ]sol\b/,
      /\bbasement\b/,
      /\bcrawl\b/,
    ],
  },
  {
    zone: "salle_de_bain",
    patterns: [
      /\bsalle de bain\b/,
      /\bbathroom\b/,
      /\bshower\b/,
      /\bdouche\b/,
      /\bbain\b/,
      /\bvanity\b/,
    ],
  },
  {
    zone: "cuisine",
    patterns: [
      /\bcuisine\b/,
      /\bkitchen\b/,
      /\barmoire\b.*\bcuisine\b/,
    ],
  },
  {
    zone: "garage",
    patterns: [/\bgarage\b/],
  },
  {
    zone: "exterieur",
    patterns: [
      /\bexterieur\b/,
      /\bexterior\b/,
      /\bterrain\b/,
      /\byard\b/,
      /\bdeck\b/,
      /\bterrasse\b/,
      /\bporch\b/,
    ],
  },
  {
    zone: "salon",
    patterns: [
      /\bsalon\b/,
      /\bliving\s*room\b/,
      /\binterieur\b.*\bpiece\b/,
      /\binterior\b.*\broom\b/,
      /\bplancher\b/,
      /\bfloor\b.*\bfinish\b/,
    ],
  },
];

function collectAnalysisText(analysis: unknown): string {
  if (!analysis || typeof analysis !== "object") return "";
  const o = analysis as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof o.summary === "string") parts.push(o.summary);
  if (Array.isArray(o.observations)) {
    for (const x of o.observations) {
      if (typeof x === "string") parts.push(x);
    }
  }
  if (Array.isArray(o.defects_or_risks)) {
    for (const x of o.defects_or_risks) {
      if (typeof x === "string") parts.push(x);
    }
  }
  if (typeof o.suggested_inspector_note === "string") parts.push(o.suggested_inspector_note);
  return parts.join("\n");
}

/**
 * Déduit une `ZoneCode` à partir du JSON `photos.analysis` (vision) ou heuristique mots-clés.
 * Utilisé pour auto-zonage QC sans re-téléverser les images.
 */
export function inferLinkedZoneFromPhotoAnalysis(analysis: unknown): ZoneCode | null {
  if (!analysis || typeof analysis !== "object") return null;
  const o = analysis as Record<string, unknown>;
  const rawZone =
    typeof o.suggested_building_zone === "string" ? o.suggested_building_zone.trim() : "";
  if (rawZone && isZoneCode(rawZone)) return rawZone;

  const blob = normalizeForMatch(collectAnalysisText(analysis));
  if (!blob) return null;

  const scores = new Map<ZoneCode, number>();
  for (const { zone, patterns } of KEYWORD_RULES) {
    let n = 0;
    for (const re of patterns) {
      re.lastIndex = 0;
      if (re.test(blob)) n += 1;
    }
    if (n > 0) scores.set(zone, (scores.get(zone) ?? 0) + n);
  }

  let best: ZoneCode | null = null;
  let bestScore = 0;
  for (const [z, sc] of scores) {
    if (sc > bestScore) {
      bestScore = sc;
      best = z;
    }
  }
  return bestScore >= 1 ? best : null;
}
