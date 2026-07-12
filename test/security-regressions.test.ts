import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { join } from "node:path";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { hasExactTriggerSecret } from "@/lib/triggerSecretAuth";

const ROOT = process.cwd();

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("report access tokens", () => {
  const protectedRow = {
    access_token: "Secret-Token",
    token_expires_at: "2999-01-01T00:00:00.000Z",
    user_id: "user-1",
  };

  it("rejects missing tokens for tokenized reports", () => {
    const gate = validateReportAccessRow("report-1", "", protectedRow);
    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.status, 403);
      assert.equal(gate.code, "access_denied");
    }
  });

  it("rejects fake and expired report tokens", () => {
    const fake = validateReportAccessRow("report-1", "fake", protectedRow);
    assert.equal(fake.ok, false);

    const expired = validateReportAccessRow("report-1", "Secret-Token", {
      ...protectedRow,
      token_expires_at: "2000-01-01T00:00:00.000Z",
    });
    assert.equal(expired.ok, false);
    if (!expired.ok) {
      assert.equal(expired.error, "Access token expired");
    }
  });

  it("accepts the stored token and preserves tokenless legacy rows", () => {
    assert.equal(validateReportAccessRow("report-1", "secret-token", protectedRow).ok, true);
    assert.equal(validateReportAccessRow("legacy", "", { user_id: "user-1" }).ok, true);
  });
});

describe("trigger secret authentication", () => {
  it("requires the exact trigger secret, not spoofable origin headers", () => {
    const old = process.env.TRIGGER_INSPECTION_SECRET;
    process.env.TRIGGER_INSPECTION_SECRET = "real-secret";
    try {
      const spoofed = new Request("https://app.example/api/trigger-inspection", {
        method: "POST",
        headers: {
          host: "app.example",
          origin: "https://app.example",
          referer: "https://app.example/report/abc",
          "x-trigger-secret": "wrong",
        },
      });
      assert.equal(hasExactTriggerSecret(spoofed), false);

      const exact = new Request("https://app.example/api/trigger-inspection", {
        method: "POST",
        headers: { "x-trigger-secret": "real-secret" },
      });
      assert.equal(hasExactTriggerSecret(exact), true);
    } finally {
      if (old === undefined) {
        delete process.env.TRIGGER_INSPECTION_SECRET;
      } else {
        process.env.TRIGGER_INSPECTION_SECRET = old;
      }
    }
  });
});

describe("critical security source invariants", () => {
  it("does not let viewer-token presence unlock finalized reports", () => {
    for (const file of [
      "app/api/report-cover/route.ts",
      "app/api/report-content/route.ts",
      "app/api/report-versions/restore/route.ts",
      "app/api/cover-condition-synthesize/route.ts",
    ]) {
      assert.doesNotMatch(
        source(file),
        /allowReportPayloadUnlock\(req\)\s*\|\|\s*Boolean\(dbToken\)/,
        `${file} must not derive allowUnlock from reports.access_token`,
      );
    }
  });

  it("does not treat Origin or Referer as trigger credentials", () => {
    for (const file of [
      "app/api/create-report/route.ts",
      "app/api/trigger-inspection/route.ts",
      "app/api/inspection-agent/route.ts",
    ]) {
      const text = source(file);
      assert.doesNotMatch(text, /isSameOrigin/, `${file} must not use same-origin auth shortcuts`);
      assert.doesNotMatch(text, /new URL\(origin\)|new URL\(referer\)/, `${file} must not parse spoofable origin headers for auth`);
    }
  });

  it("keeps service-role upload-photo behind report access and hard-fails metadata loss", () => {
    const text = source("app/api/upload-photo/route.ts");
    assert.match(text, /assertReportAccessWithOptionalSession/);
    assert.match(text, /formData\.get\("access_token"\)/);
    assert.match(text, /inspection_id does not match report\.inspection_id/);
    assert.match(text, /Photo metadata insert failed/);
    assert.match(text, /\.is\("photo_id", null\)/);
  });

  it("keeps report version listing token-gated and metadata-only", () => {
    const text = source("app/api/report-versions/list/route.ts");
    assert.match(text, /validateReportAccessRow/);
    assert.match(text, /listReportVersions/);
    assert.doesNotMatch(text, /\.select\("\*"\)/);
  });

  it("keeps edge create-report service-role only and photo scoped", () => {
    const text = source("supabase/functions/create-report/index.ts");
    assert.match(text, /authorization !== `Bearer \$\{SERVICE_ROLE\}`/);
    assert.match(text, /apikey !== SERVICE_ROLE/);
    assert.match(text, /validatePhotoForInspection/);
    assert.match(text, /photo_id does not belong to resolved inspection_id/);
  });
});
