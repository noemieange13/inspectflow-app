/**
 * Garde-fou : restore ne doit pas muter le payload live si l’insert d’historique échoue.
 * `npm run test:restore-mutation-order`
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runRestoreReportMutation } from "@/lib/reportVersions";

describe("runRestoreReportMutation", () => {
  it("does not update payload when version insert fails (non-atomic restore)", async () => {
    const calls: string[] = [];

    const result = await runRestoreReportMutation({
      insertVersion: async () => {
        calls.push("insert_version");
        return { error: "insert report_versions failed" };
      },
      updatePayload: async () => {
        calls.push("update_payload");
        return { error: null };
      },
      bumpPointer: async () => {
        calls.push("bump_pointer");
      },
    });

    assert.deepEqual(result, { error: "insert report_versions failed" });
    assert.deepEqual(calls, ["insert_version"]);
  });

  it("updates payload only after a successful version insert", async () => {
    const calls: string[] = [];

    const result = await runRestoreReportMutation({
      insertVersion: async () => {
        calls.push("insert_version");
        return { versionId: "ver-new", versionNumber: 7 };
      },
      updatePayload: async () => {
        calls.push("update_payload");
        return { error: null };
      },
      bumpPointer: async (versionId) => {
        calls.push(`bump_pointer:${versionId}`);
      },
    });

    assert.deepEqual(result, { newVersionNumber: 7 });
    assert.deepEqual(calls, [
      "insert_version",
      "update_payload",
      "bump_pointer:ver-new",
    ]);
  });

  it("does not bump pointer when payload update fails after insert", async () => {
    const calls: string[] = [];

    const result = await runRestoreReportMutation({
      insertVersion: async () => {
        calls.push("insert_version");
        return { versionId: "ver-new", versionNumber: 8 };
      },
      updatePayload: async () => {
        calls.push("update_payload");
        return { error: { message: "Report is locked" } };
      },
      bumpPointer: async () => {
        calls.push("bump_pointer");
      },
    });

    assert.deepEqual(result, { error: "Report is locked" });
    assert.deepEqual(calls, ["insert_version", "update_payload"]);
  });
});
