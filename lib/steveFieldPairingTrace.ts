/**
 * Pilot #0.15 — Steve hybrid field sheet traces (dev only).
 */

export type FieldPairingCandidateTrace = {
  text: string;
  x: number;
  y: number;
  distance: number;
};

export function isSteveFieldTraceEnabled(): boolean {
  return process.env.NODE_ENV === "development";
}

export function traceSteveFormExtraction(payload: {
  label: string;
  candidates: FieldPairingCandidateTrace[];
  selected: string | null;
}): void {
  if (!isSteveFieldTraceEnabled()) return;
  console.debug("[STEVE FORM EXTRACTION]", payload);
}

/** @deprecated use traceSteveFormExtraction */
export function traceFieldPairing(payload: {
  label: string;
  candidates: FieldPairingCandidateTrace[];
  selected: string | null;
}): void {
  traceSteveFormExtraction(payload);
}

export function traceSteveFreeNotes(payload: {
  count: number;
  notes: Array<{ text: string; location: string }>;
}): void {
  if (!isSteveFieldTraceEnabled()) return;
  console.debug("[STEVE FREE NOTES]", payload);
}

export function traceSteveHeaderContact(payload: {
  candidates: Array<{ text: string; x: number; y: number; confidence: number }>;
  selected: { name: string | null; phone: string | null; email: string | null };
}): void {
  if (!isSteveFieldTraceEnabled()) return;
  console.debug("[STEVE HEADER CONTACT]", payload);
}

export function traceHandwritingNormalized(payload: {
  before: string;
  after: string;
  confidence: number;
}): void {
  if (!isSteveFieldTraceEnabled()) return;
  console.debug("[HANDWRITING NORMALIZED]", payload);
}

export function traceSteveCompleteExtraction(payload: {
  client: string | null;
  address: string | null;
  year: string | null;
  roof: string | null;
  broker: string | null;
  email: string | null;
  heating: string | null;
  electrical: string | null;
}): void {
  if (!isSteveFieldTraceEnabled()) return;
  console.debug("[STEVE COMPLETE EXTRACTION]", payload);
}

export function traceSteveSemanticOutput(payload: {
  client: string | null;
  address: { normalized: string | null; original: string | null };
  broker?: string | null;
  electrical_panel?: string | null;
  promoted_notes: number;
}): void {
  if (!isSteveFieldTraceEnabled()) return;
  console.debug("[STEVE SEMANTIC OUTPUT]", payload);
}

export function traceSteveOcrRows(lines: string[]): void {
  if (!isSteveFieldTraceEnabled()) return;
  console.debug("[STEVE OCR ROWS]", lines);
}

export function traceSteveFieldCapture(payload: {
  field: string;
  candidates: string[];
}): void {
  if (!isSteveFieldTraceEnabled()) return;
  console.debug("[STEVE FIELD CAPTURE]", payload);
}

export function traceSteveSectionMap(lines: string[]): void {
  if (!isSteveFieldTraceEnabled()) return;
  console.debug("[STEVE SECTION MAP]", lines);
}
