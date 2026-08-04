import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

/**
 * Regression: reports.photo_id / jobs.photo_id must not short-circuit PDF AI
 * photo loading when an inspection batch exists (create-report bootstrap + uploads).
 */
describe("reports-pdf photo_id bootstrap does not truncate inspection batch", () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), "supabase/functions/reports-pdf/index.ts"),
    "utf8",
  );

  it("resolves inspection_id from bootstrap photo_id instead of early-returning one row", () => {
    assert.match(src, /resolveInspectionIdFromPhotoId/);
    assert.match(
      src,
      /reports\.photo_id.*jobs\.photo_id.*pointeurs de bootstrap/s,
    );
    // Legacy early-return sources must not remain on the happy path.
    assert.doesNotMatch(src, /source:\s*"reports\.photo_id"/);
    assert.doesNotMatch(src, /source:\s*"jobs\.photo_id"/);
  });

  it("keeps single-photo fallback only after inspection batch fails", () => {
    assert.match(src, /"reports\.photo_id_only"/);
    assert.match(src, /"jobs\.photo_id_only"/);
    assert.match(src, /"photos\.by_inspection_id"/);
    const batchIdx = src.indexOf('"photos.by_inspection_id"');
    const reportOnlyIdx = src.indexOf('"reports.photo_id_only"');
    const jobOnlyIdx = src.indexOf('"jobs.photo_id_only"');
    assert.ok(batchIdx >= 0 && reportOnlyIdx > batchIdx);
    assert.ok(jobOnlyIdx > reportOnlyIdx);
  });
});

