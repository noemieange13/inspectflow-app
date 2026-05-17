/**
 * Garde-fous CI : traçabilité clauses, parallèle QC EN+FR, sans base de données.
 * `npm run test:compliance`
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { describe, it } from "node:test";

import { buildCreateReportPayloadFromInspectionRequest } from "@/lib/createInspectionRequest";
import { defaultCoverPayloadV1 } from "@/lib/inspectionCoverPayload";
import {
  buildClauseSnapshots,
  hashClauseSnapshotSha256,
  mergeClauseSnapshots,
  shouldFetchQuebecFrenchParallel,
} from "@/lib/qcLegalClauseSnapshot";
import { buildQc2027HtmlFromPayload } from "@/lib/qc2027PdfTemplate";
import type { QcLegalClauseRow } from "@/lib/qcLegalClauses";

function mockRow(
  overrides: Partial<QcLegalClauseRow> & Pick<QcLegalClauseRow, "clause">,
): QcLegalClauseRow {
  return {
    id: overrides.id ?? "id-mock",
    code: overrides.code ?? "MOCK_CODE",
    province: overrides.province ?? "QC",
    section: overrides.section ?? "Général",
    mandatory: overrides.mandatory ?? true,
    version: overrides.version ?? "1.0",
    created_at: overrides.created_at ?? "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("shouldFetchQuebecFrenchParallel", () => {
  it("QC + rapport anglais → charger le parallèle FR", () => {
    assert.equal(shouldFetchQuebecFrenchParallel("ca_qc", "en"), true);
  });
  it("QC + français → pas de parallèle obligatoire", () => {
    assert.equal(shouldFetchQuebecFrenchParallel("ca_qc", "fr"), false);
  });
  it("autre province → pas de parallèle QC", () => {
    assert.equal(shouldFetchQuebecFrenchParallel("ca_on", "en"), false);
  });
});

describe("clause snapshots", () => {
  it("mergeClauseSnapshots déduplique par code+langue", () => {
    const t = "2026-04-29T12:00:00.000Z";
    const a = buildClauseSnapshots(
      [mockRow({ clause: "x", code: "A", resolved_language: "en" })],
      t,
    );
    const b = buildClauseSnapshots(
      [mockRow({ clause: "y", code: "A", resolved_language: "fr" })],
      t,
    );
    const m = mergeClauseSnapshots(a, b);
    assert.equal(m.length, 2);
  });

  it("hashClauseSnapshotSha256 est stable pour le même instantané", () => {
    const t = "2026-04-29T12:00:00.000Z";
    const snap = mergeClauseSnapshots(
      buildClauseSnapshots(
        [mockRow({ clause: "a", code: "Z", resolved_language: "en" })],
        t,
      ),
      buildClauseSnapshots(
        [mockRow({ clause: "b", code: "Z", resolved_language: "fr" })],
        t,
      ),
    );
    const h1 = hashClauseSnapshotSha256(snap);
    const h2 = hashClauseSnapshotSha256(snap);
    assert.equal(h1, h2);
    assert.equal(h1.length, 64);
  });

  it("QC + EN : snapshot fusionné contient EN et FR (symétrie audit / Charte)", () => {
    const takenAt = "2026-04-29T12:00:00.000Z";
    const enRows = [
      mockRow({
        clause: "EN body",
        code: "QC_BILINGUAL_LOCK",
        resolved_language: "en",
      }),
    ];
    const frRows = [
      mockRow({
        clause: "Corps FR",
        code: "QC_BILINGUAL_LOCK",
        resolved_language: "fr",
      }),
    ];
    const snapshot = mergeClauseSnapshots(
      buildClauseSnapshots(enRows, takenAt),
      buildClauseSnapshots(frRows, takenAt),
    );
    const hasFr = snapshot.some((c) => c.language === "fr");
    const hasEn = snapshot.some((c) => c.language === "en");
    assert.ok(hasFr && hasEn, "attendu EN+FR dans le même snapshot après merge");
  });
});

describe("QC 2027 EN + clauses FR parallèles (HTML)", () => {
  it("inclut les clauses EN de référence et le bloc français officiel", () => {
    const cover = defaultCoverPayloadV1();
    const payload: Record<string, unknown> = {
      language: "en",
      entries: [{ zone: "toiture" }],
      sections: [
        {
          title: "Roof note",
          observation: "Obs",
          severity: "low",
        },
      ],
    };
    const enClause = mockRow({
      clause: "EN reference clause body for compliance test",
      code: "COMPLIANCE_TEST_EN",
      resolved_language: "en",
    });
    const frClause = mockRow({
      clause: "Corps français parallèle pour test conformité",
      code: "COMPLIANCE_TEST_EN",
      resolved_language: "fr",
    });

    const html = buildQc2027HtmlFromPayload(
      payload,
      cover,
      null,
      payload.sections as unknown[],
      {
        language: "en",
        basePrintCss: "body{}",
        defaultTitle: "Test",
        legalClauseRows: [enClause],
        legalClauseRowsFrForQc: [frClause],
      },
    );

    assert.ok(html);
    assert.match(html!, /Reference clauses \(registry/);
    assert.match(
      html!,
      /Clauses de référence — texte français \(Québec\)/,
    );
    assert.match(html!, /EN reference clause body for compliance test/);
    assert.match(html!, /Corps français parallèle pour test conformité/);
    assert.match(
      html!,
      /Charte de la langue française/,
      "avis Charte présent dans le bloc parallèle",
    );
  });

  it("PDF QC 2027 : bloc audit + SHA quand payload.compliance est renseigné", () => {
    const cover = defaultCoverPayloadV1();
    const takenAt = "2026-04-29T15:00:00.000Z";
    const snap = mergeClauseSnapshots(
      buildClauseSnapshots(
        [
          mockRow({
            clause: "e",
            code: "FOOTER_TEST",
            resolved_language: "en",
          }),
        ],
        takenAt,
      ),
      buildClauseSnapshots(
        [
          mockRow({
            clause: "f",
            code: "FOOTER_TEST",
            resolved_language: "fr",
          }),
        ],
        takenAt,
      ),
    );
    const sha = hashClauseSnapshotSha256(snap);
    const payload: Record<string, unknown> = {
      language: "en",
      entries: [{ zone: "toiture" }],
      sections: [{ title: "t", observation: "o", severity: "low" }],
      compliance: {
        clause_snapshot: snap,
        clause_snapshot_generated_at: takenAt,
        clause_snapshot_pack: "QC_2027_v1",
        clause_snapshot_sha256: sha,
      },
    };
    const html = buildQc2027HtmlFromPayload(
      payload,
      cover,
      null,
      payload.sections as unknown[],
      {
        language: "en",
        basePrintCss: "body{}",
        defaultTitle: "Audit footer test",
        legalClauseRows: [],
        legalClauseRowsFrForQc: [],
      },
    );
    assert.ok(html);
    assert.match(html!, /Compliance: PASS/);
    assert.match(html!, /Clause pack/);
    assert.match(html!, /QC_2027_v1/);
    assert.match(html!, /2026-04-29T15:00:00\.000Z/);
    assert.match(html!, /EN \+ FR/);
    assert.match(html!, new RegExp(sha));
  });

  it("sans lignes FR parallèles, pas de sous-titre français dédié", () => {
    const cover = defaultCoverPayloadV1();
    const payload: Record<string, unknown> = {
      language: "en",
      entries: [{ zone: "toiture" }],
      sections: [{ title: "t", observation: "o", severity: "low" }],
    };
    const html = buildQc2027HtmlFromPayload(
      payload,
      cover,
      null,
      payload.sections as unknown[],
      {
        language: "en",
        basePrintCss: "body{}",
        defaultTitle: "Test",
        legalClauseRows: [
          mockRow({
            clause: "Only EN",
            resolved_language: "en",
          }),
        ],
        legalClauseRowsFrForQc: undefined,
      },
    );
    assert.ok(html);
    assert.doesNotMatch(
      html!,
      /Clauses de référence — texte français \(Québec\)/,
    );
  });
});

describe("create-inspection route guardrails", () => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const inspectionId = "22222222-2222-4222-8222-222222222222";

  it("rejette les anciennes créations sans user_id ni inspection/job", () => {
    const result = buildCreateReportPayloadFromInspectionRequest({
      clientName: "Jean Dupont",
      address: "123 rue Test",
      inspectionType: "residential",
      language: "fr",
    });

    if (result.ok) assert.fail("expected validation failure");
    assert.equal(result.status, 400);
    assert.match(result.error, /user_id/);
  });

  it("exige inspection_id ou job_id pour éviter les rapports orphelins", () => {
    const result = buildCreateReportPayloadFromInspectionRequest({
      user_id: userId,
      clientName: "Jean Dupont",
    });

    if (result.ok) assert.fail("expected validation failure");
    assert.equal(result.status, 400);
    assert.match(result.error, /inspection_id.*job_id/);
  });

  it("mappe les champs rapides vers le writer create-report gardé", () => {
    const result = buildCreateReportPayloadFromInspectionRequest({
      user_id: userId,
      inspection_id: inspectionId,
      clientName: " Jean Dupont ",
      address: " 123 rue Test ",
      inspectionType: "residential",
      language: "fr",
    });

    if (!result.ok) assert.fail(result.error);
    assert.equal(result.payload.user_id, userId);
    assert.equal(result.payload.inspection_id, inspectionId);
    assert.equal(result.payload.client, "Jean Dupont");
    assert.equal(result.payload.adresse, "123 rue Test");
    const payload = result.payload.payload as Record<string, unknown>;
    const cover = payload.cover_v1 as Record<string, unknown>;
    assert.equal(cover.client_name, "Jean Dupont");
    assert.equal(cover.address, "123 rue Test");
    assert.equal(cover.inspection_type, "residential");
    assert.equal(cover.language, "fr");
  });

  it("ne réintroduit pas d'insert reports direct avec service role", () => {
    const routeSource = fs.readFileSync(
      "app/api/create-inspection/route.ts",
      "utf8",
    );

    assert.doesNotMatch(routeSource, /createServiceRoleClient/);
    assert.doesNotMatch(routeSource, /\.from\(["']reports["']\)\s*\.insert/s);
  });
});

describe("repository merge hygiene", () => {
  it("ne laisse pas de marqueurs de conflit dans le smoke test PDF", () => {
    const smoke = fs.readFileSync("scripts/e2e-smoke.mjs", "utf8");

    assert.doesNotMatch(smoke, /^<<<<<<< /m);
    assert.doesNotMatch(smoke, /^=======/m);
    assert.doesNotMatch(smoke, /^>>>>>>> /m);
  });
});
