import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { allowReportPayloadUnlock } from "@/lib/reportPayloadUnlock";
import { requireTriggerSecret } from "@/lib/triggerSecretAuth";

const root = process.cwd();

function source(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("report viewer token gates", () => {
  it("denies missing or fake tokens for tokenized reports", () => {
    const row = {
      access_token: "secret-token",
      token_expires_at: new Date(Date.now() + 60_000).toISOString(),
    };

    assert.equal(validateReportAccessRow("r1", "", row).ok, false);
    assert.equal(validateReportAccessRow("r1", "fake", row).ok, false);
    assert.equal(validateReportAccessRow("r1", "secret-token", row).ok, true);
  });

  it("denies expired report tokens", () => {
    const row = {
      access_token: "secret-token",
      token_expires_at: new Date(Date.now() - 60_000).toISOString(),
    };

    const gate = validateReportAccessRow("r1", "secret-token", row);
    assert.equal(gate.ok, false);
    if (!gate.ok) assert.equal(gate.code, "access_denied");
  });
});

describe("trigger secret authentication", () => {
  it("does not trust spoofable Origin or Referer headers", () => {
    const prior = process.env.TRIGGER_INSPECTION_SECRET;
    process.env.TRIGGER_INSPECTION_SECRET = "expected";
    try {
      const spoofed = new Request("https://app.example/api/trigger-inspection", {
        method: "POST",
        headers: {
          host: "app.example",
          origin: "https://app.example",
          referer: "https://app.example/report/r1",
        },
      });
      assert.equal(requireTriggerSecret(spoofed).ok, false);

      const exact = new Request("https://app.example/api/trigger-inspection", {
        method: "POST",
        headers: { "x-trigger-secret": "expected" },
      });
      assert.equal(requireTriggerSecret(exact).ok, true);
    } finally {
      if (prior === undefined) {
        delete process.env.TRIGGER_INSPECTION_SECRET;
      } else {
        process.env.TRIGGER_INSPECTION_SECRET = prior;
      }
    }
  });
});

describe("locked report integrity guards", () => {
  it("production Vercel requests do not get dev unlock by default", () => {
    const priorEnv = process.env.NODE_ENV;
    const priorVercel = process.env.VERCEL;
    const priorUnlock = process.env.INSPECTFLOW_DEV_UNLOCK_REPORT;
    process.env.NODE_ENV = "production";
    process.env.VERCEL = "1";
    delete process.env.INSPECTFLOW_DEV_UNLOCK_REPORT;
    try {
      const req = new Request("https://app.example/api/report-content", {
        headers: { host: "app.example" },
      });
      assert.equal(allowReportPayloadUnlock(req), false);
    } finally {
      process.env.NODE_ENV = priorEnv;
      if (priorVercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = priorVercel;
      if (priorUnlock === undefined) delete process.env.INSPECTFLOW_DEV_UNLOCK_REPORT;
      else process.env.INSPECTFLOW_DEV_UNLOCK_REPORT = priorUnlock;
    }
  });

  it("write routes do not use stored viewer tokens as unlock permission", () => {
    for (const file of [
      "app/api/report-content/route.ts",
      "app/api/report-cover/route.ts",
      "app/api/report-versions/restore/route.ts",
      "app/api/cover-condition-synthesize/route.ts",
    ]) {
      assert.doesNotMatch(source(file), /allowReportPayloadUnlock\(req\)\s*\|\|\s*Boolean\(dbToken\)/);
    }
  });
});

describe("service-role write boundaries", () => {
  it("upload-photo requires report access and rejects foreign inspection links", () => {
    const upload = source("app/api/upload-photo/route.ts");
    assert.match(upload, /assertReportAccessWithOptionalSession/);
    assert.match(upload, /inspection_id does not match report\.inspection_id/);
    assert.match(upload, /\.is\("photo_id", null\)/);
  });

  it("report version listing validates access and returns metadata only", () => {
    const list = source("app/api/report-versions/list/route.ts");
    assert.match(list, /reportAccessTokensMatch/);
    assert.match(list, /listReportVersions/);
    assert.doesNotMatch(list, /\.select\("\*"\)/);
  });

  it("Edge create-report requires service-role headers and photo inspection ownership", () => {
    const edge = source("supabase/functions/create-report/index.ts");
    assert.match(edge, /authorization/);
    assert.match(edge, /apikey/);
    assert.match(edge, /photoBelongsToInspection/);
    assert.match(edge, /photo_id does not match resolved inspection_id/);
  });
});
