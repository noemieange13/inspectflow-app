/**
 * Pilot #0.39.1 — document intake resolver reference restore
 * `npm run test:document-intake-resolver-pilot-039-1`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Pilot #0.39.1 document intake resolver reference", () => {
  it("exports resolveDocumentIntakePrefill from the canonical module", () => {
    assert.equal(typeof resolveDocumentIntakePrefill, "function");
  });

  it("wires resolver import in InspectorHome and DocumentIntakeReview", () => {
    assert.match(
      read("components/InspectorHome.tsx"),
      /import\s*\{\s*resolveDocumentIntakePrefill\s*\}\s*from\s*"@\/lib\/documentIntakePrefill"/,
    );
    assert.match(
      read("components/DocumentIntakeReview.tsx"),
      /import\s*\{\s*resolveDocumentIntakePrefill\s*\}\s*from\s*"@\/lib\/documentIntakePrefill"/,
    );
  });

  it("keeps resolver before learning in DocumentIntakeReview pipeline", () => {
    const source = read("components/DocumentIntakeReview.tsx");
    const resolveIndex = source.indexOf("resolveDocumentIntakePrefill(analysis, fusion)");
    const learningIndex = source.indexOf("applyInspectorLearningToDocumentAnalysis(analysis");
    assert.ok(resolveIndex >= 0);
    assert.ok(learningIndex >= 0);
    assert.ok(resolveIndex < learningIndex);
  });
});
