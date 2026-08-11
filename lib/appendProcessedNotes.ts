/**
 * Pure helper mirroring the SQL merge in
 * `append_report_processed_notes` (existing array || incoming array).
 * Used by unit tests to lock the concurrent-append contract.
 */
export function mergeProcessedNotesAppend(
  existingPayload: Record<string, unknown> | null | undefined,
  incomingNotes: unknown[],
  notesProcessedAt: string,
): Record<string, unknown> {
  const base =
    existingPayload && typeof existingPayload === "object"
      ? { ...existingPayload }
      : {};

  const existing = Array.isArray(base.processed_notes)
    ? [...(base.processed_notes as unknown[])]
    : [];

  return {
    ...base,
    processed_notes: [...existing, ...incomingNotes],
    notes_processed_at: notesProcessedAt,
  };
}

/**
 * Simulate two concurrent stale full-payload RWMs (the pre-fix bug):
 * both readers see the same base, each appends locally, last writer wins →
 * the other append is lost.
 */
export function simulateStaleFullPayloadAppendRace(
  basePayload: Record<string, unknown>,
  notesA: unknown[],
  notesB: unknown[],
  atA: string,
  atB: string,
): Record<string, unknown> {
  const writeA = mergeProcessedNotesAppend(basePayload, notesA, atA);
  const writeB = mergeProcessedNotesAppend(basePayload, notesB, atB);
  // Last writer wins with a full replace (B overwrites A).
  return writeB;
}

/**
 * Simulate the fixed path: each append sees the prior writer's result
 * (FOR UPDATE serializes the second append onto the first).
 */
export function simulateSerializedAppend(
  basePayload: Record<string, unknown>,
  notesA: unknown[],
  notesB: unknown[],
  atA: string,
  atB: string,
): Record<string, unknown> {
  const afterA = mergeProcessedNotesAppend(basePayload, notesA, atA);
  return mergeProcessedNotesAppend(afterA, notesB, atB);
}
