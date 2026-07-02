/**
 * Pilot #0.19 — Steve OCR noise filter for field notes + learning candidates.
 */
import type { InspectorRawNoteV1, InspectorRawNotesV1 } from "@/lib/inspectorHandwritingNotes";
import { isLikelyOcrNameCorruption, isPlausibleReconstructedClientName } from "@/lib/steveClientNameReconstruction";
import type { HandwritingCorrection } from "@/lib/steveHandwritingNormalizer";

export type SteveLearningCandidateV1 = {
  original: string;
  corrected: string;
  field?: string;
  accepted: false;
};

export type SteveLearningCandidatesV1 = {
  schema_version: 1;
  candidates: SteveLearningCandidateV1[];
};

const INSPECTION_NOTE_VOCABULARY = [
  "fenêtre",
  "fenetre",
  "porte",
  "scellant",
  "fissure",
  "rampe",
  "patio",
  "garage",
  "toiture",
  "bardeaux",
  "tôle",
  "tole",
  "panneau",
  "électrique",
  "electrique",
  "coulis",
  "coulisse",
  "plomberie",
  "drain",
  "fondation",
  "béton",
  "beton",
  "chauffage",
  "thermopompe",
  "climatiseur",
  "plinthe",
  "valve",
  "pompe",
  "isolant",
  "membrane",
  "gouttière",
  "gouttiere",
  "solin",
  "ventilation",
  "humidité",
  "humidite",
  "infiltration",
  "sous-sol",
  "grenier",
  "balcon",
  "terrasse",
  "accès",
  "acces",
  "escalier",
  "cheminée",
  "cheminee",
];

const GARBAGE_TOKEN_PATTERNS = [
  /^[-–—]?\d{1,3}$/,
  /^[A-Z][a-z]{2,3}$/,
  /^[a-z]{2,4}$/,
  /^[A-Z]{2,5}$/,
  /^pore$/i,
  /^row$/i,
  /^mand$/i,
  /^das$/i,
  /^yipee$/i,
  /^gila$/i,
  /^unie$/i,
];

const NOTE_REJECT_PATTERNS = [
  /^inspect[- ]?habitation/i,
  /^check[- ]?list/i,
  /^report\/pour/i,
  /^report pour/i,
  /^chattois$/i,
  /^tran$/i,
  /^day$/i,
  /^chattois\s+tran$/i,
  /^pour rapport$/i,
];

function isRejectedNoteText(text: string): boolean {
  const normalized = normalizeText(text);
  if (!normalized) return true;
  if (NOTE_REJECT_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  if (isLikelyOcrNameCorruption(normalized)) return true;
  if (isPlausibleReconstructedClientName(normalized)) return true;
  if (/^[A-ZÀ-Ö][a-zà-ö'-]{3,14}$/.test(normalized) && !hasInspectionVocabulary(normalized)) {
    return true;
  }
  return false;
}

function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasInspectionVocabulary(text: string): boolean {
  const lower = normalizeText(text).toLowerCase();
  return INSPECTION_NOTE_VOCABULARY.some((term) => lower.includes(normalizeText(term).toLowerCase()));
}

function hasNumberUnitPattern(text: string): boolean {
  return /\b\d{2,4}\s*A\b/i.test(text) || /\b\d{2,4}\s*(gallons?|gal|litres?|l)\b/i.test(text);
}

function isMeaningfulInspectionNote(note: InspectorRawNoteV1): boolean {
  const text = note.text.trim();
  if (!text || isRejectedNoteText(text)) return false;
  if (note.linked_system_candidate) return true;
  if (hasInspectionVocabulary(text)) return true;
  if (hasNumberUnitPattern(text)) return true;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && text.length >= 10) {
    return note.location === "left_margin" || note.location === "right_margin" || hasInspectionVocabulary(text);
  }

  if (GARBAGE_TOKEN_PATTERNS.some((pattern) => pattern.test(text))) return false;
  if (text.length < 4) return false;
  if (note.location !== "left_margin" && note.location !== "right_margin") return false;
  if (words.length === 1 && text.length < 6 && note.confidence < 0.72) return false;
  if (note.confidence < 0.5 && text.length < 8 && !hasInspectionVocabulary(text)) return false;

  return note.location === "left_margin" && text.length >= 8;
}

export function buildSteveLearningCandidates(input: {
  addressCorrections?: HandwritingCorrection[];
  rejectedNotes?: string[];
}): SteveLearningCandidatesV1 {
  const candidates: SteveLearningCandidateV1[] = [];

  for (const correction of input.addressCorrections ?? []) {
    if (!correction.from || correction.to === "(removed)") continue;
    candidates.push({
      original: correction.from,
      corrected: correction.to,
      field: "address",
      accepted: false,
    });
  }

  for (const note of input.rejectedNotes ?? []) {
    const trimmed = note.trim();
    if (trimmed.length < 3) continue;
    candidates.push({
      original: trimmed,
      corrected: trimmed,
      field: "note_noise",
      accepted: false,
    });
  }

  const seen = new Set<string>();
  return {
    schema_version: 1,
    candidates: candidates.filter((candidate) => {
      const key = `${candidate.field}:${candidate.original}:${candidate.corrected}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}

export type SteveOcrNoiseFilterResult = {
  notes: InspectorRawNotesV1;
  ocr_rejected_notes: string[];
  steve_learning_candidates_v1: SteveLearningCandidatesV1;
};

export function filterSteveOcrNotes(
  notes: InspectorRawNotesV1,
  options?: { addressCorrections?: HandwritingCorrection[] },
): SteveOcrNoiseFilterResult {
  const kept: InspectorRawNoteV1[] = [];
  const ocr_rejected_notes: string[] = [];

  for (const note of notes.notes) {
    if (isMeaningfulInspectionNote(note)) {
      kept.push(note);
    } else {
      ocr_rejected_notes.push(note.text);
    }
  }

  const steve_learning_candidates_v1 = buildSteveLearningCandidates({
    addressCorrections: options?.addressCorrections,
    rejectedNotes: ocr_rejected_notes,
  });

  return {
    notes: {
      schema_version: 1,
      notes: kept,
      ocr_rejected_notes,
      steve_learning_candidates_v1,
    },
    ocr_rejected_notes,
    steve_learning_candidates_v1,
  };
}

export { INSPECTION_NOTE_VOCABULARY };
