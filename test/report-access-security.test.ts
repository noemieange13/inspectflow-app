import assert from "node:assert/strict";
import { after, describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { uploadPhotoViaApi } from "@/photo-pipeline/client/uploadPhoto";

describe("report access token gate", () => {
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

  it("denies protected reports when the viewer token is invalid", () => {
    const result = validateReportAccessRow("report-1", "wrong-token", {
      access_token: "secret-token",
      token_expires_at: null,
    });

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 403);
      assert.equal(result.code, "access_denied");
    }
  });

  it("allows matching viewer tokens and legacy untokenized reports", () => {
    assert.deepEqual(
      validateReportAccessRow("report-1", "secret-token", {
        access_token: "secret-token",
        token_expires_at: null,
      }),
      { ok: true, userId: null },
    );
    assert.deepEqual(
      validateReportAccessRow("legacy-report", "", {
        access_token: null,
        token_expires_at: null,
      }),
      { ok: true, userId: null },
    );
  });
});

describe("uploadPhotoViaApi", () => {
  const originalFetch = globalThis.fetch;

  after(() => {
    globalThis.fetch = originalFetch;
  });

  it("forwards report access tokens and bearer credentials to /api/upload-photo", async () => {
    let captured: RequestInit | undefined;
    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      captured = init;
      return new Response(
        JSON.stringify({
          success: true,
          storage_path: "owner/hash.jpg",
          url: "https://example.test/hash.jpg",
          file_hash: "hash",
          photo_id: "photo-1",
          file_name: "photo.jpg",
          file_size: 4,
          photo_analysis: null,
          suggested_inspector_note: null,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const result = await uploadPhotoViaApi({
      file: new File([new Blob(["test"])], "photo.jpg", { type: "image/jpeg" }),
      reportId: "report-1",
      accessToken: "viewer-token",
      authorizationBearer: "jwt-token",
      language: "fr",
    });

    assert.equal("success" in result && result.success, true);
    assert.equal(captured?.method, "POST");
    assert.ok(captured?.body instanceof FormData);
    assert.equal(captured.body.get("report_id"), "report-1");
    assert.equal(captured.body.get("access_token"), "viewer-token");
    assert.equal(captured.body.get("language"), "fr");
    const headers = new Headers(captured.headers);
    assert.equal(headers.get("authorization"), "Bearer jwt-token");
  });
});
