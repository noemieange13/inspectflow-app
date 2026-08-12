/**
 * Zero Draft notes → findings must not invent salon / water_infiltration.
 * `npm run test:notes-entry-map`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { mapProcessedNotesToEntries } from "@/lib/mapProcessedNotesToEntries";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("mapProcessedNotesToEntries", () => {
  it("keeps valid zone+issue", () => {
    const out = mapProcessedNotesToEntries([
      {
        enhanced: "Panneau électrique chaud au toucher",
        suggested_zone: "installation_electrique",
        suggested_issue: "electrical_risk",
        confidence: 0.9,
      },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.zone, "installation_electrique");
    assert.equal(out[0]?.issue, "electrical_risk");
  });

  it("does not invent salon/water_infiltration when zone/issue missing", () => {
    const out = mapProcessedNotesToEntries([
      {
        enhanced: "Note vocale toiture",
        suggested_zone: null,
        suggested_issue: null,
        confidence: 0.95,
      },
      {
        enhanced: "Usure bardeaux",
        suggested_zone: "roof", // not in grid
        suggested_issue: "electrical", // not in grid
        confidence: 0.8,
      },
    ]);
    assert.deepEqual(out, []);
  });

  it("maps unknown issue to other when zone is valid", () => {
    const out = mapProcessedNotesToEntries([
      {
        enhanced: "Observation toiture",
        suggested_zone: "toiture",
        suggested_issue: "infiltration",
        confidence: 0.7,
      },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.zone, "toiture");
    assert.equal(out[0]?.issue, "other");
  });

  it("filters low confidence", () => {
    const out = mapProcessedNotesToEntries([
      {
        enhanced: "faible",
        suggested_zone: "salon",
        suggested_issue: "other",
        confidence: 0.3,
      },
    ]);
    assert.equal(out.length, 0);
  });
});

describe("ZeroDraftReportComposer notes wiring", () => {
  it("uses mapProcessedNotesToEntries (no hard-coded water_infiltration fallback)", () => {
    const src = readFileSync(
      join(root, "components/ZeroDraftReportComposer.tsx"),
      "utf8",
    );
    assert.match(src, /mapProcessedNotesToEntries/);
    assert.doesNotMatch(
      src,
      /suggested_issue[\s\S]{0,120}:\s*"water_infiltration"/,
    );
    assert.doesNotMatch(
      src,
      /:\s*"salon";\s*\n\s*const issue/,
    );
  });
});
