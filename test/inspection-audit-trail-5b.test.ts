/**
 * Phase 5B — inspection_audit_trail
 * `npm run test:inspection-audit-trail-5b`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  APPEND_ONLY_AUDIT_TABLE,
  recordInspectionEvent,
  sanitizeAuditMetadata,
} from "@/lib/inspection_audit_trail";

const REPORT = "770e8400-e29b-41d4-a716-446655440001";
const INSPECTION = "880e8400-e29b-41d4-a716-446655440002";

type Row = Record<string, unknown>;

function mockSupabase(opts?: {
  insertError?: { message: string; code?: string };
  updateError?: { message: string };
}) {
  const rows: Row[] = [];
  return {
    rows,
    client: {
      from(table: string) {
        assert.equal(table, APPEND_ONLY_AUDIT_TABLE);
        return {
          insert(payload: Row) {
            if (opts?.insertError) {
              return {
                select: () => ({
                  single: async () => ({ data: null, error: opts.insertError }),
                }),
              };
            }
            const id = `evt-${rows.length + 1}`;
            rows.push({ ...payload, id });
            return {
              select: () => ({
                single: async () => ({ data: { id }, error: null }),
              }),
            };
          },
          update: () => ({
            eq: async () => ({
              data: null,
              error: opts?.updateError ?? { message: "inspection_audit_events is append-only" },
            }),
          }),
        };
      },
    },
  };
}

describe("recordInspectionEvent", () => {
  it("A) upload photo → event photo_uploaded", async () => {
    const mock = mockSupabase();
    const result = await recordInspectionEvent(mock.client as never, {
      report_id: REPORT,
      inspection_id: INSPECTION,
      event_type: "photo_uploaded",
      actor_type: "inspector",
      metadata: {
        photo_id: "990e8400-e29b-41d4-a716-446655440003",
        file_hash: "abc123",
      },
    });

    assert.equal(result.recorded, true);
    assert.equal(mock.rows[0]?.event_type, "photo_uploaded");
    assert.equal(mock.rows[0]?.actor_type, "inspector");
  });

  it("B) IA analyse → event photo_analyzed", async () => {
    const mock = mockSupabase();
    await recordInspectionEvent(mock.client as never, {
      report_id: REPORT,
      inspection_id: INSPECTION,
      event_type: "photo_analyzed",
      actor_type: "ai",
      metadata: {
        photo_id: "990e8400-e29b-41d4-a716-446655440003",
        job_id: "job-1",
        ai_model: "vision-v1",
      },
    });

    assert.equal(mock.rows[0]?.event_type, "photo_analyzed");
    assert.equal(mock.rows[0]?.actor_type, "ai");
  });

  it("C) inspecteur modifie → inspector_modified", async () => {
    const mock = mockSupabase();
    await recordInspectionEvent(mock.client as never, {
      report_id: REPORT,
      inspection_id: INSPECTION,
      event_type: "inspector_modified",
      actor_type: "inspector",
      metadata: {
        entries_count: 4,
        content_hash: "deadbeef",
        change_types: ["changed_severity"],
        observation_ids: ["550e8400-e29b-41d4-a716-446655440001"],
      },
    });

    assert.equal(mock.rows[0]?.event_type, "inspector_modified");
    assert.deepEqual(mock.rows[0]?.metadata, {
      entries_count: 4,
      content_hash: "deadbeef",
      change_types: ["changed_severity"],
      observation_ids: ["550e8400-e29b-41d4-a716-446655440001"],
    });
  });

  it("D) tentative update event existant → refusée", async () => {
    const mock = mockSupabase({
      updateError: { message: "inspection_audit_events is append-only" },
    });
    const update = mock.client.from(APPEND_ONLY_AUDIT_TABLE).update({ metadata: {} }).eq("id", "evt-1");
    const res = await update;
    assert.match(String(res.error?.message), /append-only/i);
  });

  it("E) erreur audit DB → inspection continue (pas de throw)", async () => {
    const mock = mockSupabase({ insertError: { message: "connection failed", code: "08006" } });
    const result = await recordInspectionEvent(mock.client as never, {
      report_id: REPORT,
      event_type: "pdf_generated",
      actor_type: "system",
    });

    assert.equal(result.recorded, false);
    assert.match(result.error ?? "", /connection failed/i);
  });
});

describe("sanitizeAuditMetadata", () => {
  it("filtre PII et texte rapport", () => {
    const meta = sanitizeAuditMetadata({
      photo_id: "p1",
      client_name: "Jean Dupont",
      note: "Long texte rapport complet interdit",
      content_hash: "abc",
    });
    assert.equal(meta.photo_id, "p1");
    assert.equal(meta.content_hash, "abc");
    assert.equal(meta.client_name, undefined);
    assert.equal(meta.note, undefined);
  });
});

describe("migration append-only", () => {
  it("définit un trigger anti-update", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260437120000_inspection_audit_events.sql"),
      "utf8",
    );
    assert.match(sql, /prevent_inspection_audit_events_mutation/);
    assert.match(sql, /before update or delete/i);
  });
});
