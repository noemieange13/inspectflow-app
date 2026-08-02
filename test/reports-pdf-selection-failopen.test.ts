import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

describe("reports-pdf photo selection fail-open guard", () => {
  it("does not return the unfiltered inspection page when selection misses", () => {
    const src = fs.readFileSync(
      path.join(process.cwd(), "supabase/functions/reports-pdf/index.ts"),
      "utf8",
    );
    assert.match(src, /ai_photo_selection_miss_on_inspection_page/);
    // When filtered.length === 0 we must fall through, not keep `rows` unfiltered.
    assert.doesNotMatch(
      src,
      /if \(filtered\.length > 0\) rows = filtered;\s*\}?\s*return \{\s*rows,/,
    );
  });
});
