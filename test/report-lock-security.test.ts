import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const repoRoot = process.cwd();

const lockedReportMutationRoutes = [
  "app/api/report-cover/route.ts",
  "app/api/report-content/route.ts",
  "app/api/report-versions/restore/route.ts",
  "app/api/cover-condition-synthesize/route.ts",
];

test("viewer tokens do not unlock finalized report payload mutations", () => {
  for (const route of lockedReportMutationRoutes) {
    const source = readFileSync(join(repoRoot, route), "utf8");

    assert.match(
      source,
      /const\s+allowUnlock\s*=\s*allowReportPayloadUnlock\(req\);/,
      `${route} must derive allowUnlock only from the explicit/local unlock policy`,
    );
    assert.doesNotMatch(
      source,
      /Boolean\(\s*dbToken\s*\)|!!\s*dbToken|allowReportPayloadUnlock\(req\)\s*\|\|/,
      `${route} must not use stored viewer-token presence as an unlock credential`,
    );
  }
});
