import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { resolveUploadInspectionId } from "@/lib/reportUploadAccess";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readRepoFile(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

describe("report viewer token access", () => {
  it("denies protected reports when the viewer token is missing", () => {
    const result = validateReportAccessRow("report-1", "", {
      access_token: "secret-token",
      token_expires_at: null,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "access_denied");
    }
  });

  it("denies expired report viewer tokens even when the value matches", () => {
    const result = validateReportAccessRow("report-1", "secret-token", {
      access_token: "secret-token",
      token_expires_at: "2020-01-01T00:00:00.000Z",
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "access_denied");
    }
  });

  it("keeps legacy tokenless reports accessible", () => {
    const result = validateReportAccessRow("report-1", "", {
      access_token: null,
      token_expires_at: null,
    });

    assert.equal(result.ok, true);
  });
});

describe("photo upload authorization invariants", () => {
  it("rejects caller-supplied inspection ids that do not belong to the report", () => {
    const result = resolveUploadInspectionId("inspection-a", "inspection-b");

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.body.code, "inspection_mismatch");
    }
  });

  it("uses the report inspection id when the caller omits one", () => {
    const result = resolveUploadInspectionId("inspection-a", "");

    assert.deepEqual(result, { ok: true, inspectionId: "inspection-a" });
  });

  it("checks report access before any storage side effect", () => {
    const source = readRepoFile("app/api/upload-photo/route.ts");
    const accessIdx = source.indexOf(
      "const gate = await assertReportAccessWithOptionalSession",
    );
    const storageIdx = source.indexOf("await ensureBucket");

    assert.ok(accessIdx >= 0, "upload route must call the report access gate");
    assert.ok(storageIdx >= 0, "upload route should still write through storage");
    assert.ok(
      accessIdx < storageIdx,
      "upload authorization must happen before bucket/storage writes",
    );
  });

  it("uses atomic photo numbering and does not overwrite an existing report photo", () => {
    const source = readRepoFile("app/api/upload-photo/route.ts");

    assert.match(source, /rpc\(\s*["']next_photo_number["']/);
    assert.match(source, /\.is\(\s*["']photo_id["']\s*,\s*null\s*\)/);
    assert.doesNotMatch(source, /order\(\s*["']photo_number["']/);
  });
});

describe("report version listing access", () => {
  it("validates report tokens and returns metadata-only version rows", () => {
    const source = readRepoFile("app/api/report-versions/list/route.ts");

    assert.match(source, /validateReportAccessRow/);
    assert.match(source, /listReportVersions/);
    assert.doesNotMatch(source, /\.select\(\s*["']\*["']\s*\)/);
  });
});
