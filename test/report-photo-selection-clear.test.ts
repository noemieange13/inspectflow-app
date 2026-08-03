/**
 * Empty photo-selection clear must serialize so report-content can wipe
 * payload + DB rows; omit the key until the editor is ready to clear.
 * `npm run test:photo-selection-clear`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveReportPhotoSelectionForSave } from "@/lib/reportPhotoSelectionPayload";

describe("resolveReportPhotoSelectionForSave", () => {
  it("serializes non-empty selection even without allowEmptyClear", () => {
    const sel = resolveReportPhotoSelectionForSave(
      [
        {
          serverPhotoId: "photo-a",
          report_tier: "critical",
          selected_for_report: true,
        },
        {
          serverPhotoId: "photo-b",
          report_tier: "excluded",
          selected_for_report: false,
        },
      ],
      { locked: true, allowEmptyClear: false },
    );
    assert.ok(sel);
    assert.deepEqual(sel!.selected_photo_ids, ["photo-a"]);
    assert.equal(sel!.selection_locked, true);
    assert.equal(sel!.photo_tiers?.["photo-a"], "critical");
  });

  it("omits key when empty and allowEmptyClear is false (hydration/autosave safe)", () => {
    const sel = resolveReportPhotoSelectionForSave(
      [
        {
          serverPhotoId: "photo-a",
          report_tier: "excluded",
          selected_for_report: false,
        },
      ],
      { locked: false, allowEmptyClear: false },
    );
    assert.equal(sel, undefined);
  });

  it("serializes explicit empty clear when allowEmptyClear is true", () => {
    const sel = resolveReportPhotoSelectionForSave(
      [
        {
          serverPhotoId: "photo-a",
          report_tier: "excluded",
          selected_for_report: false,
        },
        {
          serverPhotoId: "  ",
          report_tier: "support",
          selected_for_report: true,
        },
      ],
      { locked: true, allowEmptyClear: true },
    );
    assert.ok(sel);
    assert.deepEqual(sel!.selected_photo_ids, []);
    assert.equal(sel!.selection_locked, true);
    assert.equal(sel!.photo_tiers, undefined);
  });

  it("treats missing report_tier via selected_for_report", () => {
    const sel = resolveReportPhotoSelectionForSave(
      [{ serverPhotoId: "photo-z", selected_for_report: true }],
      { locked: false, allowEmptyClear: false },
    );
    assert.ok(sel);
    assert.deepEqual(sel!.selected_photo_ids, ["photo-z"]);
    assert.equal(sel!.photo_tiers?.["photo-z"], "support");
  });
});
