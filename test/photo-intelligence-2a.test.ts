/**
 * Phase Photo Intelligence 2A — capture_context, progression, jobs.
 * `npm run test:photo-intelligence-2a`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  formatCaptureContextForVisionPrompt,
  parsePhotoCaptureContextFromForm,
  parseSequenceNumber,
} from "@/lib/photoCaptureContext";
import { loadInspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";

describe("photoCaptureContext", () => {
  it("parse capture_mode camera avec sequence (indice terrain uniquement)", () => {
    const form = new FormData();
    form.append("capture_mode", "camera");
    form.append("sequence_number", "7");
    form.append("original_timestamp", "2026-06-15T14:30:00.000Z");
    const ctx = parsePhotoCaptureContextFromForm(form);
    assert.ok(ctx);
    assert.equal(ctx.capture_mode, "camera");
    assert.equal(ctx.sequence_number, 7);
    assert.equal(ctx.original_timestamp, "2026-06-15T14:30:00.000Z");
  });

  it("formatCaptureContextForVisionPrompt mentionne que sequence n'est pas un lien constat", () => {
    const hint = formatCaptureContextForVisionPrompt(
      {
        capture_mode: "bulk_import",
        original_timestamp: null,
        sequence_number: 42,
      },
      "fr",
    );
    assert.match(hint, /42/);
    assert.match(hint, /pas un lien constat|ordering hint/i);
  });

  it("parseSequenceNumber rejette les négatifs", () => {
    assert.equal(parseSequenceNumber(-1), null);
    assert.equal(parseSequenceNumber("3"), 3);
  });
});

describe("loadInspectionPhotoProgress", () => {
  it("calcule upload et analyse depuis les lignes photos", async () => {
    const supabase = {
      from(table: string) {
        if (table === "photos") {
          return {
            select() {
              return this;
            },
            eq() {
              return Promise.resolve({
                data: [
                  { analysis_status: "complete" },
                  { analysis_status: "complete" },
                  { analysis_status: "pending" },
                  { analysis_status: "failed" },
                ],
                error: null,
              });
            },
          };
        }
        if (table === "photo_analysis_jobs") {
          return {
            select(_cols?: unknown, opts?: { head?: boolean }) {
              if (opts?.head) {
                return {
                  eq() {
                    return Promise.resolve({ count: 0, error: null });
                  },
                };
              }
              return this;
            },
            eq() {
              return this;
            },
            in() {
              return this;
            },
            not() {
              return this;
            },
            order() {
              return this;
            },
            limit() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({ data: null, error: null });
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const progress = await loadInspectionPhotoProgress(
      supabase as never,
      "insp-1",
      { expectedUploadTotal: 500 },
    );

    assert.equal(progress.upload.done, 4);
    assert.equal(progress.upload.total, 500);
    assert.equal(progress.analysis.done, 2);
    assert.equal(progress.analysis.pending, 1);
    assert.equal(progress.analysis.failed, 1);
    assert.equal(progress.selection.status, "pending");
  });

  it("selection ready quand plus de pending/processing", async () => {
    const supabase = {
      from(table: string) {
        if (table === "photos") {
          return {
            select() {
              return this;
            },
            eq() {
              return Promise.resolve({
                data: [{ analysis_status: "complete" }, { analysis_status: "skipped" }],
                error: null,
              });
            },
          };
        }
        if (table === "photo_analysis_jobs") {
          return {
            select(_cols?: unknown, opts?: { head?: boolean }) {
              if (opts?.head) {
                return {
                  eq() {
                    return Promise.resolve({ count: 0, error: null });
                  },
                };
              }
              return this;
            },
            eq() {
              return this;
            },
            in() {
              return this;
            },
            not() {
              return this;
            },
            order() {
              return this;
            },
            limit() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({ data: null, error: null });
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };

    const progress = await loadInspectionPhotoProgress(supabase as never, "insp-2");
    assert.equal(progress.selection.status, "ready");
  });
});
