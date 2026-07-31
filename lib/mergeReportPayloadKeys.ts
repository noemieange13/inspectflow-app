/**
 * Shallow top-level merge mirroring SQL `coalesce(payload,'{}') || patch`
 * used by `public.update_report_payload_keys_with_unlock`.
 */
export function mergeReportPayloadKeys(
  current: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    current && typeof current === "object" && !Array.isArray(current)
      ? { ...current }
      : {};
  return { ...base, ...patch };
}

/** Mirrors SQL `merged - key` for each remove key (after patch). */
export function applyPayloadKeyRemovals(
  current: Record<string, unknown>,
  removeKeys: string[] | null | undefined,
): Record<string, unknown> {
  if (!removeKeys || removeKeys.length === 0) return current;
  const next = { ...current };
  for (const raw of removeKeys) {
    const key = typeof raw === "string" ? raw.trim() : "";
    if (!key) continue;
    delete next[key];
  }
  return next;
}
