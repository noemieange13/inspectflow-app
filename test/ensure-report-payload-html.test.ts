import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureReportPayloadHtml } from "@/lib/ensureReportPayloadHtml";

const ORIGINAL_READINESS_BYPASS = process.env.ALLOW_PDF_EXPORT_WITHOUT_READINESS;

afterEach(() => {
  if (ORIGINAL_READINESS_BYPASS === undefined) {
    delete process.env.ALLOW_PDF_EXPORT_WITHOUT_READINESS;
  } else {
    process.env.ALLOW_PDF_EXPORT_WITHOUT_READINESS = ORIGINAL_READINESS_BYPASS;
  }
});

type RpcCall = {
  name: string;
  args: Record<string, unknown>;
};

function buildPayloadNeedingHtmlRefresh(): Record<string, unknown> {
  return {
    html: "<p>stale</p>",
    language: "fr",
    title: "Rapport de test",
    sections: [
      {
        title: "Toiture",
        observation:
          "Bardeaux retroussés observés sur plusieurs rangées près du versant avant.",
        analysis:
          "L'usure avancée augmente le risque d'infiltration pendant les pluies soutenues.",
        recommendation:
          "Faire vérifier la couverture par un couvreur qualifié et planifier les réparations.",
        severity: "high",
      },
    ],
  };
}

function createMockSupabase(payload: Record<string, unknown>) {
  const rpcCalls: RpcCall[] = [];
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        payload,
      },
      error: null,
    }),
  };

  const supabase = {
    from: (table: string) => {
      assert.equal(table, "reports");
      return query;
    },
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return {
        data: { ok: true, unlocked: false, source: "ensure-report-payload-html" },
        error: null,
      };
    },
  } as unknown as SupabaseClient;

  return { supabase, rpcCalls };
}

describe("ensureReportPayloadHtml", () => {
  it("does not allow locked report unlocks by default when refreshing PDF HTML", async () => {
    process.env.ALLOW_PDF_EXPORT_WITHOUT_READINESS = "1";
    const { supabase, rpcCalls } = createMockSupabase(buildPayloadNeedingHtmlRefresh());

    const result = await ensureReportPayloadHtml(
      "11111111-1111-4111-8111-111111111111",
      { supabaseClient: supabase },
    );

    assert.equal(result.ok, true);
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0]?.name, "update_report_payload_with_unlock");
    assert.equal(rpcCalls[0]?.args.p_allow_unlock, false);
    assert.equal(rpcCalls[0]?.args.p_clear_pdf_path, true);
    assert.match(
      String((rpcCalls[0]?.args.p_payload as Record<string, unknown>).html),
      /Toiture/,
    );
  });

  it("keeps unlock as an explicit caller opt-in", async () => {
    process.env.ALLOW_PDF_EXPORT_WITHOUT_READINESS = "1";
    const { supabase, rpcCalls } = createMockSupabase(buildPayloadNeedingHtmlRefresh());

    const result = await ensureReportPayloadHtml(
      "11111111-1111-4111-8111-111111111111",
      { allowUnlock: true, supabaseClient: supabase },
    );

    assert.equal(result.ok, true);
    assert.equal(rpcCalls.length, 1);
    assert.equal(rpcCalls[0]?.args.p_allow_unlock, true);
  });
});
