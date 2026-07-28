/**
 * Shallow top-level merge mirroring SQL `coalesce(payload,'{}') || patch`
 * used by `public.patch_report_payload_keys`.
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
