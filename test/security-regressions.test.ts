import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { POST as createInspection } from "@/app/api/create-inspection/route";
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

  it("never loads PDF photos without matching the report inspection", () => {
    const source = read("supabase/functions/reports-pdf/index.ts");
    assert.match(
      source,
      /if\s*\(inspectionId\s*&&\s*photoRow\.inspection_id\s*===\s*inspectionId\)/,
    );
    assert.match(source, /ai_photo_selection_missing_report_inspection/);
    assert.match(source, /\.in\("id", ids\)[\s\S]{0,100}\.eq\("inspection_id", inspectionId\)/);
    assert.doesNotMatch(
      source,
      /if\s*\(!inspectionId\s*\|\|\s*photoRow\.inspection_id\s*===\s*inspectionId\)/,
    );
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

  it("uses the shared token gate for the server-rendered report viewer", () => {
    const source = read("lib/reportViewerServer.ts");
    assert.match(source, /validateReportAccessRow/);
    assert.doesNotMatch(source, /if\s*\(dbToken\s*&&\s*viewerToken\)/);
  });

  it("routes legacy inspection creation through the guarded report writer", () => {
    const source = read("app/api/create-inspection/route.ts");
    assert.match(source, /createReportPost/);
    assert.doesNotMatch(source, /createServiceRoleClient/);
    assert.doesNotMatch(source, /\.from\(["']reports["']\)\s*\.insert/s);
  });

  it("rejects the legacy payload instead of creating a tokenless report", async () => {
    const previousSecret = process.env.TRIGGER_INSPECTION_SECRET;
    delete process.env.TRIGGER_INSPECTION_SECRET;
    try {
      const response = await createInspection(
        new Request("http://localhost/api/create-inspection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientName: "Client public",
            address: "123 Rue Exemple",
            inspectionType: "residential",
            language: "fr",
          }),
        }),
      );
      assert.equal(response.status, 400);
      const body = (await response.json()) as { error?: string };
      assert.match(body.error ?? "", /Missing user_id/);
    } finally {
      if (previousSecret === undefined) {
        delete process.env.TRIGGER_INSPECTION_SECRET;
      } else {
        process.env.TRIGGER_INSPECTION_SECRET = previousSecret;
      }
    }
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
