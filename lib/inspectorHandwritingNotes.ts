/**
 * Pilot #0.15 — free inspector handwriting notes (not form fields, not defects).
 */
import {
  buildFormGeometry,
  isKnownLabel,
  matchFieldKey,
  parseSteveFieldSheetFormFromLayout,
  type LayoutTextBlock,
} from "@/lib/document_parsers/steveFieldSheetParser";
import { traceSteveFreeNotes, traceSteveFieldCapture } from "@/lib/steveFieldPairingTrace";
import {
  buildSteveNumberedSectionMap,
  getBlocksForSteveSection,
} from "@/lib/steveNumberedSections";

export type InspectorNoteLocation =
  | "left_margin"
  | "right_margin"
  | "inline"
  | "bottom"
  | "between_sections"
  | "unknown";

export type InspectorRawNoteV1 = {
  text: string;
  source: "handwriting";
  confidence: number;
  location: InspectorNoteLocation;
  page: number;
  nearby_section?: string | null;
  linked_system_candidate?: string | null;
  linked_component_candidate?: string | null;
  requires_confirmation: true;
};

export type InspectorRawNotesV1 = {
  schema_version: 1;
  notes: InspectorRawNoteV1[];
  /** Pilot #0.19 — OCR fragments removed from recognized notes (never deleted). */
  ocr_rejected_notes?: string[];
  /** Pilot #0.19 — future Steve learning queue (not auto-applied). */
  steve_learning_candidates_v1?: import("@/lib/steveOcrNoiseFilter").SteveLearningCandidatesV1;
};

const DOCUMENT_HEADER_PATTERNS = [/^inspect[- ]?habitation/i, /^check[- ]?list/i];

const SYSTEM_CANDIDATES: Array<{ pattern: RegExp; system: string; component?: string }> = [
  { pattern: /toiture|t[oô]le|bardeaux|membrane/i, system: "TOITURE", component: "couverture" },
  { pattern: /fondation|fissure|structure|mur/i, system: "STRUCTURE", component: "fondation" },
  { pattern: /chauffage|plinthe|thermopompe/i, system: "CHAUFFAGE" },
  { pattern: /chauffe[- ]?eau|r[eé]servoir|eau chaude/i, system: "EAU_CHAUDE" },
  { pattern: /fen[eê]tre|scellant|porte/i, system: "ENVELOPPE", component: "fenetre" },
  { pattern: /drain|rampe|escalier/i, system: "EXTERIEUR" },
  { pattern: /isolant|r\d{2}|cellulose/i, system: "ENVELOPPE", component: "isolation" },
  { pattern: /valve|pompe/i, system: "PLOMBERIE" },
];

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function isDocumentHeader(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return DOCUMENT_HEADER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function findNearbySection(block: LayoutTextBlock, labelBlocks: LayoutTextBlock[]): string | null {
  if (labelBlocks.length === 0) return null;
  const centerY = block.y + block.height / 2;
  let nearest: LayoutTextBlock | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const label of labelBlocks) {
    const labelCenter = label.y + label.height / 2;
    const delta = Math.abs(centerY - labelCenter);
    if (delta < distance) {
      distance = delta;
      nearest = label;
    }
  }
  return nearest ? normalizeText(nearest.text) : null;
}

function inferSystemCandidates(text: string): {
  linked_system_candidate: string | null;
  linked_component_candidate: string | null;
} {
  for (const rule of SYSTEM_CANDIDATES) {
    if (rule.pattern.test(text)) {
      return {
        linked_system_candidate: rule.system,
        linked_component_candidate: rule.component ?? null,
      };
    }
  }
  return { linked_system_candidate: null, linked_component_candidate: null };
}

function classifyNoteLocation(
  block: LayoutTextBlock,
  mainFormStartX: number,
  valueColumnRight: number,
  maxLabelY: number,
): InspectorNoteLocation {
  if (block.x < mainFormStartX) return "left_margin";
  if (block.x >= valueColumnRight + 40) return "right_margin";
  if (block.y > maxLabelY + 80) return "bottom";
  if (block.x >= mainFormStartX && block.x < valueColumnRight) return "between_sections";
  return "inline";
}

export function extractInspectorRawNotes(
  blocks: LayoutTextBlock[],
  usedBlocks?: Set<LayoutTextBlock>,
): InspectorRawNotesV1 {
  const consumed = usedBlocks ?? parseSteveFieldSheetFormFromLayout(blocks).usedBlocks;
  const geometry = buildFormGeometry(blocks);
  const sectionMap = buildSteveNumberedSectionMap(blocks);
  const labelBlocks = blocks.filter((block) => matchFieldKey(block.text));
  const marginSectionBlocks = getBlocksForSteveSection(sectionMap, "NOTES_MARGIN");
  if (marginSectionBlocks.length > 0) {
    traceSteveFieldCapture({
      field: "notes_margin",
      candidates: marginSectionBlocks.map((block) => normalizeText(block.text)).filter(Boolean),
    });
  }
  const valueColumnRight =
    blocks
      .filter((block) => consumed.has(block))
      .reduce((max, block) => Math.max(max, block.x + block.width), geometry.labelColumnRight) || 320;
  const maxLabelY = labelBlocks.reduce((max, block) => Math.max(max, block.y + block.height), 0);

  const notes: InspectorRawNoteV1[] = [];

  for (const block of blocks) {
    if (consumed.has(block)) continue;
    const text = normalizeText(block.text);
    if (!text || text.length < 3) continue;
    if (isDocumentHeader(text)) continue;
    if (isKnownLabel(text)) continue;
    if (matchFieldKey(text)) continue;

    const location = classifyNoteLocation(
      block,
      geometry.mainFormStartX,
      valueColumnRight,
      maxLabelY,
    );
    const candidates = inferSystemCandidates(text);

    notes.push({
      text: text.slice(0, 240),
      source: "handwriting",
      confidence: block.confidence,
      location,
      page: block.page ?? 1,
      nearby_section: findNearbySection(block, labelBlocks),
      linked_system_candidate: candidates.linked_system_candidate,
      linked_component_candidate: candidates.linked_component_candidate,
      requires_confirmation: true,
    });
  }

  const deduped = new Map<string, InspectorRawNoteV1>();
  for (const note of notes) {
    if (!deduped.has(note.text)) deduped.set(note.text, note);
  }

  const result = {
    schema_version: 1 as const,
    notes: [...deduped.values()].slice(0, 24),
  };

  traceSteveFreeNotes({
    count: result.notes.length,
    notes: result.notes.map((note) => ({ text: note.text, location: note.location })),
  });

  return result;
}

export function inspectorNotesToFieldNotesV1(
  inspectorNotes: InspectorRawNotesV1,
): import("@/lib/document_parsers/steveFieldSheetParser").FieldNotesV1 {
  return {
    raw_notes: inspectorNotes.notes.map((note) => ({
      original_text: note.text,
      source: "handwritten" as const,
      confidence: note.confidence,
      location:
        note.location === "bottom" || note.location === "between_sections"
          ? "inline"
          : note.location === "unknown"
            ? "unknown"
            : note.location,
    })),
  };
}
