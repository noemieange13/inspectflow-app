const SYSTEM_KEY_ALIASES: Record<string, string> = {
  electricite: "electrical",
  plomberie: "plumbing",
  structure: "structural",
  toiture: "roofing",
  ventilation: "ventilation",
  chauffage: "heating",
  isolation: "insulation",
  general: "general",
};

export function normalizeSystemKey(raw: string | undefined | null): string {
  const key = (raw ?? "general").trim().toLowerCase();
  if (!key) return "general";
  return SYSTEM_KEY_ALIASES[key] ?? key;
}
