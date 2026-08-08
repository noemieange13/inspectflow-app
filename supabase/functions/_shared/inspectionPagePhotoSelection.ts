/**
 * Selection coverage for the ordered inspection photo page used by reports-pdf.
 *
 * A non-empty selection must be covered completely by the page before callers may
 * return the filtered rows. Partial hits (selected ids past AI_PHOTO_FETCH_CAP,
 * or mismatched inspection_id) must fall through to an explicit `.in("id", …)` query.
 */
export type InspectionPageSelectionResult<T extends { id: string }> =
  | { kind: "complete"; rows: T[] }
  | { kind: "incomplete"; matchedCount: number };

export function resolveInspectionPageSelection<T extends { id: string }>(
  pageRows: T[],
  wanted: Set<string>,
): InspectionPageSelectionResult<T> {
  if (wanted.size === 0) {
    return { kind: "incomplete", matchedCount: 0 };
  }
  const filtered = pageRows.filter((r) => wanted.has(String(r.id)));
  if (filtered.length === wanted.size) {
    return { kind: "complete", rows: filtered };
  }
  return { kind: "incomplete", matchedCount: filtered.length };
}
