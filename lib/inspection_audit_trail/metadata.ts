import { sha256Hex } from "@/lib/sha256Hex";

import { ALLOWED_AUDIT_METADATA_KEYS } from "./constants";

const MAX_SCALAR_LEN = 128;

function trimScalar(value: unknown): unknown {
  if (typeof value === "string") {
    const t = value.trim();
    return t.length <= MAX_SCALAR_LEN ? t : t.slice(0, MAX_SCALAR_LEN);
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value
      .slice(0, 32)
      .map((item) => trimScalar(item))
      .filter((item) => item !== undefined && item !== null && item !== "");
  }
  return undefined;
}

/** Filtre métadonnées — pas de PII, pas de texte rapport complet. */
export function sanitizeAuditMetadata(
  raw: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!raw) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!ALLOWED_AUDIT_METADATA_KEYS.has(key)) continue;
    const trimmed = trimScalar(value);
    if (trimmed === undefined) continue;
    out[key] = trimmed;
  }
  return out;
}

export function hashInspectionContent(value: unknown): string {
  return sha256Hex(JSON.stringify(value)).slice(0, 32);
}
