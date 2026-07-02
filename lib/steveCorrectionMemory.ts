/**
 * Pilot #0.20 — local Steve handwriting correction memory (no auto-learn yet).
 */
import type { HandwritingCorrection } from "@/lib/steveHandwritingNormalizer";

export type SteveCorrectionEntry = {
  original: string;
  corrected: string;
  field?: string;
  accepted: boolean;
};

export type SteveCorrectionMemoryV1 = {
  schema_version: 1;
  entries: SteveCorrectionEntry[];
};

const SEED_MEMORY: SteveCorrectionEntry[] = [
  { original: "Rut", corrected: "Rue", field: "address", accepted: true },
  { original: "dada", corrected: "de la", field: "address", accepted: true },
  { original: "dea", corrected: "des", field: "address", accepted: true },
  { original: "Pui", corrected: "Prés", field: "address", accepted: true },
  { original: "owt3", corrected: "0H3", field: "address", accepted: true },
  { original: "dal", corrected: "J9L", field: "address", accepted: true },
  { original: "Pres", corrected: "Prés", field: "address", accepted: true },
];

let runtimeMemory: SteveCorrectionMemoryV1 = {
  schema_version: 1,
  entries: [...SEED_MEMORY],
};

export function getSteveCorrectionMemory(): SteveCorrectionMemoryV1 {
  return runtimeMemory;
}

export function rememberSteveCorrection(entry: SteveCorrectionEntry): void {
  const existing = runtimeMemory.entries.findIndex(
    (item) => item.original === entry.original && item.field === entry.field,
  );
  if (existing >= 0) {
    runtimeMemory.entries[existing] = entry;
  } else {
    runtimeMemory.entries.push(entry);
  }
}

export function applySteveCorrectionMemory(
  text: string,
  field: string = "address",
): { value: string; corrections: HandwritingCorrection[] } {
  let value = text.replace(/\s+/g, " ").trim();
  const corrections: HandwritingCorrection[] = [];
  const entries = runtimeMemory.entries.filter(
    (entry) => entry.accepted && (!entry.field || entry.field === field),
  );

  for (const entry of entries) {
    const pattern = new RegExp(`\\b${entry.original.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    if (!pattern.test(value)) continue;
    value = value.replace(pattern, entry.corrected).replace(/\s+/g, " ").trim();
    corrections.push({
      from: entry.original,
      to: entry.corrected,
      reason: "steve_correction_memory",
    });
    pattern.lastIndex = 0;
  }

  return { value, corrections };
}
