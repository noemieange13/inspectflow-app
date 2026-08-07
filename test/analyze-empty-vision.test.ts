import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isUsableVisionText } from "@/lib/services/pipeline";

describe("analyzeInspection empty vision fail-closed", () => {
  it("rejects empty and whitespace-only Gemini text", () => {
    assert.equal(isUsableVisionText(""), false);
    assert.equal(isUsableVisionText("   \n\t  "), false);
  });

  it("accepts non-empty vision text for OpenRouter structuring", () => {
    assert.equal(isUsableVisionText('{"conditionGenerale":"ok"}'), true);
    assert.equal(isUsableVisionText("  fondation fissurée  "), true);
  });
});
