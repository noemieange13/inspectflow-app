import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  mergeProcessedNotesAppend,
  simulateSerializedAppend,
  simulateStaleFullPayloadAppendRace,
} from "../lib/appendProcessedNotes";

describe("process-notes processed_notes append integrity", () => {
  it("appends onto an existing processed_notes array without dropping prior keys", () => {
    const next = mergeProcessedNotesAppend(
      {
        cover_v1: { schema_version: 1 },
        processed_notes: [{ original: "a", enhanced: "A" }],
      },
      [{ original: "b", enhanced: "B" }],
      "2026-08-11T12:00:00.000Z",
    );

    assert.deepEqual(next.cover_v1, { schema_version: 1 });
    assert.deepEqual(next.processed_notes, [
      { original: "a", enhanced: "A" },
      { original: "b", enhanced: "B" },
    ]);
    assert.equal(next.notes_processed_at, "2026-08-11T12:00:00.000Z");
  });

  it("treats a missing or non-array processed_notes as empty", () => {
    const fromMissing = mergeProcessedNotesAppend(
      { html: "<p>x</p>" },
      [{ original: "n", enhanced: "N" }],
      "2026-08-11T12:00:01.000Z",
    );
    assert.deepEqual(fromMissing.processed_notes, [
      { original: "n", enhanced: "N" },
    ]);
    assert.equal(fromMissing.html, "<p>x</p>");

    const fromBad = mergeProcessedNotesAppend(
      { processed_notes: { not: "array" } },
      [{ original: "n2", enhanced: "N2" }],
      "2026-08-11T12:00:02.000Z",
    );
    assert.deepEqual(fromBad.processed_notes, [
      { original: "n2", enhanced: "N2" },
    ]);
  });

  it("documents the stale full-payload race that loses a concurrent append", () => {
    const base = {
      cover_v1: { schema_version: 1 },
      processed_notes: [{ original: "seed", enhanced: "Seed" }],
    };
    const raced = simulateStaleFullPayloadAppendRace(
      base,
      [{ original: "voice", enhanced: "Voice note about roof" }],
      [{ original: "ocr", enhanced: "OCR note about foundation" }],
      "2026-08-11T12:00:03.000Z",
      "2026-08-11T12:00:04.000Z",
    );

    const texts = (raced.processed_notes as Array<{ original: string }>).map(
      (n) => n.original,
    );
    assert.ok(texts.includes("seed"));
    assert.ok(texts.includes("ocr"));
    // Last writer started from the same base → voice append is gone.
    assert.equal(texts.includes("voice"), false);
  });

  it("keeps both appends when serialized (FOR UPDATE / atomic append)", () => {
    const base = {
      cover_v1: { schema_version: 1 },
      processed_notes: [{ original: "seed", enhanced: "Seed" }],
    };
    const fixed = simulateSerializedAppend(
      base,
      [{ original: "voice", enhanced: "Voice note about roof" }],
      [{ original: "ocr", enhanced: "OCR note about foundation" }],
      "2026-08-11T12:00:03.000Z",
      "2026-08-11T12:00:04.000Z",
    );

    const texts = (fixed.processed_notes as Array<{ original: string }>).map(
      (n) => n.original,
    );
    assert.deepEqual(texts, ["seed", "voice", "ocr"]);
    assert.deepEqual(fixed.cover_v1, { schema_version: 1 });
  });
});
