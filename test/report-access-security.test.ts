import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { uploadPhotoViaApi } from "@/photo-pipeline/client/uploadPhoto";

describe("report access validation", () => {
  it("rejects missing or wrong viewer tokens when a report is token-protected", () => {
    const row = {
      access_token: "secret-token",
      token_expires_at: new Date(Date.now() + 60_000).toISOString(),
      user_id: "user-1",
    };

    const missing = validateReportAccessRow("report-1", "", row);
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.status, 403);
      assert.equal(missing.code, "access_denied");
    }

    const wrong = validateReportAccessRow("report-1", "not-secret", row);
    assert.equal(wrong.ok, false);
    if (!wrong.ok) {
      assert.equal(wrong.status, 403);
      assert.equal(wrong.code, "access_denied");
    }
  });

  it("allows matching viewer tokens and still allows legacy reports without a token", () => {
    const tokenProtected = validateReportAccessRow(
      "report-1",
      "secret-token",
      {
        access_token: "secret-token",
        token_expires_at: new Date(Date.now() + 60_000).toISOString(),
        user_id: "user-1",
      },
    );
    assert.equal(tokenProtected.ok, true);

    const legacy = validateReportAccessRow("report-2", "", {
      access_token: null,
      token_expires_at: null,
      user_id: "user-2",
    });
    assert.equal(legacy.ok, true);
  });

  it("rejects expired viewer tokens", () => {
    const expired = validateReportAccessRow("report-1", "secret-token", {
      access_token: "secret-token",
      token_expires_at: new Date(Date.now() - 60_000).toISOString(),
      user_id: "user-1",
    });

    assert.equal(expired.ok, false);
    if (!expired.ok) {
      assert.equal(expired.status, 403);
      assert.equal(expired.code, "access_denied");
    }
  });
});

describe("uploadPhotoViaApi", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("forwards the viewer access token in multipart uploads", async () => {
    let body: BodyInit | null | undefined;
    globalThis.fetch = (async (_input, init) => {
      body = init?.body;
      return new Response(
        JSON.stringify({
          success: true,
          storage_path: "user/photo.jpg",
          url: null,
          file_hash: "hash",
          photo_id: "photo-1",
          file_name: "photo.jpg",
          file_size: 5,
          photo_analysis: null,
          suggested_inspector_note: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await uploadPhotoViaApi({
      file: new File(["photo"], "photo.jpg", { type: "image/jpeg" }),
      reportId: "report-1",
      accessToken: "  viewer-token  ",
    });

    assert.equal("success" in result ? result.success : false, true);
    assert.ok(body instanceof FormData);
    assert.equal(body.get("access_token"), "viewer-token");
  });
});
