/**
 * Regression tests for finalized/locked report integrity.
 *
 * Viewer access tokens authorize normal edits, but they must not be treated as
 * permission to clear `reports.is_locked` / `finalized_at`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { allowReportPayloadUnlock } from "@/lib/reportPayloadUnlock";

const writeRoutes = [
  "app/api/report-cover/route.ts",
  "app/api/report-content/route.ts",
  "app/api/report-versions/restore/route.ts",
  "app/api/cover-condition-synthesize/route.ts",
] as const;

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("locked report payload updates", () => {
  it("does not derive unlock permission from viewer access tokens", () => {
    for (const route of writeRoutes) {
      const source = readWorkspaceFile(route);
      const allowUnlockAssignments = source.matchAll(
        /const\s+allowUnlock\s*=\s*([^;]+);/gs,
      );
      for (const match of allowUnlockAssignments) {
        const expression = match[1] ?? "";
        assert.doesNotMatch(
          expression,
          /\b(dbToken|accessTokenRaw|access_token|token)\b/,
          `${route} must not let report access tokens unlock finalized reports`,
        );
      }
    }
  });

  it("keeps unlock disabled on Vercel production by default", () => {
    const previous = {
      nodeEnv: process.env.NODE_ENV,
      vercel: process.env.VERCEL,
      unlock: process.env.INSPECTFLOW_DEV_UNLOCK_REPORT,
    };

    try {
      process.env.NODE_ENV = "production";
      process.env.VERCEL = "1";
      delete process.env.INSPECTFLOW_DEV_UNLOCK_REPORT;

      const req = new Request("https://inspectflow-app.vercel.app/api/report-content", {
        headers: { host: "inspectflow-app.vercel.app" },
      });

      assert.equal(allowReportPayloadUnlock(req), false);
    } finally {
      process.env.NODE_ENV = previous.nodeEnv;
      if (previous.vercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previous.vercel;
      if (previous.unlock === undefined) delete process.env.INSPECTFLOW_DEV_UNLOCK_REPORT;
      else process.env.INSPECTFLOW_DEV_UNLOCK_REPORT = previous.unlock;
    }
  });
});
