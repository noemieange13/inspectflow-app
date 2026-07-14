import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const coverPageSource = readFileSync(
  new URL("../app/rapport/couverture/page.tsx", import.meta.url),
  "utf8",
);

describe("report-linked cover page", () => {
  it("loads the linked report and hydrates the persistent cover form", () => {
    assert.match(coverPageSource, /searchParams:\s*Promise/);
    assert.match(coverPageSource, /loadReportForViewer\(reportId,\s*viewerToken\)/);
    assert.match(coverPageSource, /parseCoverV1FromUnknown\(payload\.cover_v1\)/);
    assert.match(coverPageSource, /<InspectionCoverFormHydrated[\s\S]*reportId=\{reportId\}/);
    assert.match(coverPageSource, /viewerToken=\{viewerToken\}/);
    assert.doesNotMatch(coverPageSource, /InspectionCoverFormSimple/);
  });
});
