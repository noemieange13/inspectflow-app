import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import {
  hasExactTriggerSecret,
  rejectMissingExactTriggerSecret,
} from "@/lib/triggerSecretAuth";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("trigger secret authentication", () => {
  it("accepts only the exact x-trigger-secret value", async () => {
    const req = new Request("https://example.test/api/trigger-inspection", {
      method: "POST",
      headers: {
        "x-trigger-secret": "s3cr3t",
        origin: "https://example.test",
        host: "example.test",
      },
    });

    assert.equal(hasExactTriggerSecret(req, "s3cr3t"), true);
    assert.equal(hasExactTriggerSecret(req, "different"), false);
    assert.equal(rejectMissingExactTriggerSecret(req, "s3cr3t"), null);

    const rejected = rejectMissingExactTriggerSecret(req, "different");
    assert.equal(rejected?.status, 401);
    assert.deepEqual(await rejected?.json(), {
      success: false,
      error: "Unauthorized",
    });
  });
});

describe("report token gates", () => {
  it("rejects missing, fake, and expired tokens for tokenized reports", () => {
    const row = {
      access_token: "stored-token",
      token_expires_at: new Date(Date.now() + 60_000).toISOString(),
      user_id: "owner",
    };

    assert.equal(validateReportAccessRow("r1", "", row).ok, false);
    assert.equal(validateReportAccessRow("r1", "fake", row).ok, false);
    assert.equal(validateReportAccessRow("r1", "stored-token", row).ok, true);

    const expired = {
      ...row,
      token_expires_at: new Date(Date.now() - 60_000).toISOString(),
    };
    assert.equal(validateReportAccessRow("r1", "stored-token", expired).ok, false);
  });
});

describe("critical route regression guards", () => {
  it("does not use spoofable same-origin headers as credentials", () => {
    for (const file of [
      "app/api/create-report/route.ts",
      "app/api/trigger-inspection/route.ts",
      "app/api/inspection-agent/route.ts",
    ]) {
      const source = read(file);
      assert.doesNotMatch(source, /isSameOrigin/);
      assert.doesNotMatch(source, /headers\.get\("origin"\)/);
      assert.doesNotMatch(source, /headers\.get\("referer"\)/);
    }
  });

  it("requires service-role credentials and inspection-scoped photos in Edge create-report", () => {
    const source = read("supabase/functions/create-report/index.ts");
    assert.match(source, /hasServiceRoleCredentials/);
    assert.match(source, /Unauthorized/);
    assert.match(source, /photo_id does not belong to inspection_id/);
    assert.match(source, /\.select\("id, inspection_id"\)/);
  });

  it("requires report access and report inspection matching before photo uploads", () => {
    const source = read("app/api/upload-photo/route.ts");
    assert.match(source, /assertReportAccessWithOptionalSession/);
    assert.match(source, /hasExactTriggerSecret/);
    assert.match(source, /inspection_id does not match report\.inspection_id/);
    assert.match(source, /Photo metadata insert failed/);
    assert.match(source, /\.is\("photo_id", null\)/);
  });

  it("validates report-version tokens and returns metadata-only rows", () => {
    const source = read("app/api/report-versions/list/route.ts");
    assert.match(source, /assertReportAccessWithOptionalSession/);
    assert.match(source, /listReportVersions/);
    assert.doesNotMatch(source, /\.select\("\*"\)/);
  });

  it("does not let viewer tokens unlock finalized report payloads", () => {
    for (const file of [
      "app/api/report-cover/route.ts",
      "app/api/report-content/route.ts",
      "app/api/report-versions/restore/route.ts",
      "app/api/cover-condition-synthesize/route.ts",
    ]) {
      assert.doesNotMatch(read(file), /\|\|\s*Boolean\(dbToken\)/);
    }
  });
});
