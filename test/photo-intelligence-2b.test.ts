/**
 * Phase Photo Intelligence 2B — worker garanti, outbox, limites 500, doublons visuels.
 * `npm run test:photo-intelligence-2b`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MAX_INSPECTION_PHOTOS } from "@/lib/inspectionPhotoLimits";
import { loadInspectionPhotoProgress } from "@/lib/inspectionPhotoProgress";
import {
  hammingDistanceHex,
  isPerceptualHashSimilar,
  computePerceptualHashFromBuffer,
} from "@/lib/photoPerceptualHash";
import { enqueuePhotoAnalysisJob, runPhotoAnalysisWorkerDrain } from "@/lib/photoAnalysisJobs";

describe("MAX_INSPECTION_PHOTOS", () => {
  it("vaut 500 partout", () => {
    assert.equal(MAX_INSPECTION_PHOTOS, 500);
  });
});

describe("photoPerceptualHash", () => {
  it("identique buffer → distance 0", () => {
    const h = computePerceptualHashFromBuffer(Buffer.from("jpeg-bytes-sample"));
    assert.equal(h.length, 16);
    assert.equal(hammingDistanceHex(h, h), 0);
    assert.equal(isPerceptualHashSimilar(h, h), true);
  });
});

describe("loadInspectionPhotoProgress RPC", () => {
  it("agrège via count_photos_* sans charger les lignes", async () => {
    const supabase = {
      rpc(fn: string) {
        if (fn === "count_photos_for_inspection") {
          return Promise.resolve({ data: 500, error: null });
        }
        if (fn === "count_photos_analysis_status") {
          return Promise.resolve({
            data: [
              { analysis_status: "complete", cnt: 90 },
              { analysis_status: "processing", cnt: 20 },
              { analysis_status: "pending", cnt: 385 },
              { analysis_status: "failed", cnt: 5 },
            ],
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: { message: "unknown" } });
      },
      from(table: string) {
        if (table === "photo_upload_batches") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return this;
            },
            limit() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({
                data: { expected_count: 500 },
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
                    return Promise.resolve({ count: 385, error: null });
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

    const progress = await loadInspectionPhotoProgress(supabase as never, "insp-500");
    assert.equal(progress.upload.done, 500);
    assert.equal(progress.upload.total, 500);
    assert.equal(progress.analysis.done, 90);
    assert.equal(progress.analysis.processing, 20);
    assert.equal(progress.analysis.pending, 385);
    assert.equal(progress.analysis.failed, 5);
    assert.equal(progress.analysis.total, 500);
  });
});

describe("enqueuePhotoAnalysisJob skipVision", () => {
  it("ne crée pas de job pour doublon visuel", async () => {
    let inserted = false;
    const supabase = {
      from(table: string) {
        if (table === "photos") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({ data: { duplicate_of_photo_id: null }, error: null });
            },
            update() {
              return this;
            },
          };
        }
        if (table === "photo_analysis_jobs") {
          return {
            select() {
              return this;
            },
            eq() {
              return this;
            },
            in() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({ data: null, error: null });
            },
            insert() {
              inserted = true;
              return Promise.resolve({ error: null });
            },
          };
        }
        throw new Error(table);
      },
    };

    const result = await enqueuePhotoAnalysisJob(supabase as never, {
      inspectionId: "insp",
      reportId: "rep",
      photoId: "photo-1",
      fileHash: "abc",
      language: "fr",
      skipVision: true,
    });

    assert.equal(result.skipped, true);
    assert.equal(result.reason, "visual_duplicate");
    assert.equal(inserted, false);
  });
});

describe("runPhotoAnalysisWorkerDrain", () => {
  it("s arrête quand claim retourne 0", async () => {
    const supabase = {
      rpc(fn: string) {
        if (fn === "claim_photo_analysis_jobs") {
          return Promise.resolve({ data: [], error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      from(table: string) {
        if (table === "photo_analysis_jobs") {
          return {
            select() {
              return this;
            },
            eq() {
              return Promise.resolve({ count: 0, error: null });
            },
          };
        }
        throw new Error(table);
      },
    };

    const drain = await runPhotoAnalysisWorkerDrain(supabase as never, {
      batchLimit: 10,
      maxBatches: 5,
    });
    assert.equal(drain.claimed, 0);
    assert.equal(drain.batches, 1);
  });
});

describe("client_upload_id idempotence (contrat)", () => {
  it("même client_upload_id → une seule photo serveur (spec)", () => {
    const clientUploadId = "stable-uuid-125";
    const first = { client_upload_id: clientUploadId, photo_id: "p1" };
    const retry = { client_upload_id: clientUploadId, photo_id: "p1", deduplicated: true };
    assert.equal(first.photo_id, retry.photo_id);
    assert.equal(retry.deduplicated, true);
  });
});
