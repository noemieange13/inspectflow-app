import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateReportAccessRow } from "@/lib/assertReportAccessForApi";
import { buildCreateInspectionInsert } from "@/lib/createInspectionReport";

describe("create-inspection report bootstrap", () => {
  it("creates token-protected canonical cover payloads", () => {
    const fixedNow = new Date("2026-06-16T11:00:00.000Z");
    const row = buildCreateInspectionInsert(
      {
        clientName: " Marie Tremblay ",
        address: " 123 rue Principale ",
        inspectionType: "residential",
        language: "en",
      },
      fixedNow,
    );

    assert.match(row.access_token, /^[0-9a-f]{64}$/);
    assert.equal(row.created_at, fixedNow.toISOString());
    assert.equal(row.payload.language, "en");

    const cover = row.payload.cover_v1 as {
      schema_version?: number;
      requerants?: string;
      propriete?: { adresse?: string; client_nom?: string; type_propriete?: string };
    };
    assert.equal(cover.schema_version, 1);
    assert.equal(cover.requerants, "Marie Tremblay");
    assert.equal(cover.propriete?.client_nom, "Marie Tremblay");
    assert.equal(cover.propriete?.adresse, "123 rue Principale");
    assert.equal(cover.propriete?.type_propriete, "residential");
  });
});

describe("report access token gate", () => {
  it("rejects protected reports when the token is missing or wrong", () => {
    const row = {
      access_token: "secret-token",
      token_expires_at: null,
      user_id: null,
    };

    assert.deepEqual(validateReportAccessRow("report-1", "", row), {
      ok: false,
      status: 403,
      error: "Invalid access token",
      code: "access_denied",
    });

    assert.deepEqual(validateReportAccessRow("report-1", "wrong", row), {
      ok: false,
      status: 403,
      error: "Invalid access token",
      code: "access_denied",
    });
  });

  it("allows the matching token and keeps legacy tokenless rows open", () => {
    assert.deepEqual(
      validateReportAccessRow("report-1", "secret-token", {
        access_token: "secret-token",
        token_expires_at: null,
        user_id: "user-1",
      }),
      { ok: true, userId: "user-1" },
    );

    assert.deepEqual(
      validateReportAccessRow("legacy-report", "", {
        access_token: "",
        token_expires_at: null,
        user_id: null,
      }),
      { ok: true, userId: null },
    );
  });
});
