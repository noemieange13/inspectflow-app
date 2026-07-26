/**
 * Garde-fous : l'agent d'inspection en mode prévisualisation ne doit pas
 * muter/déverrouiller un rapport finalisé.
 * `npm run test:inspection-agent`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const repoRoot = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("inspection-agent preview integrity", () => {
  it("does not persist building_summary_v1 before the execute gate", () => {
    const source = read("lib/inspectionAgent/runInspectionAgent.ts");
    const executeGate = source.search(/if\s*\(\s*!input\.execute\s*\)/);
    const persistCall = source.search(/persistBuildingSummaryV1\s*\(/);

    assert.ok(executeGate >= 0, "expected an early return when execute is false");
    assert.ok(persistCall >= 0, "expected persistBuildingSummaryV1 to remain for execute path");
    assert.ok(
      persistCall > executeGate,
      "persistBuildingSummaryV1 must run only after the !execute early return (preview is read-only)",
    );
  });

  it("never unlocks finalized reports when writing building_summary_v1", () => {
    const source = read("lib/inspectionAgent/persistBuildingSummary.ts");
    assert.match(source, /allowUnlock:\s*false/);
    assert.doesNotMatch(source, /allowUnlock:\s*true/);
  });
});
