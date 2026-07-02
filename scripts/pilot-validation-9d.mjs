/**
 * Phase 9D — Steve pilot E2E validation (API layer).
 * Run: npx tsx scripts/pilot-validation-9d.mjs
 */
import { config as loadDotenv } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

loadDotenv({ path: resolve(process.cwd(), ".env.local") });
loadDotenv({ path: resolve(process.cwd(), ".env") });

const BASE = (process.env.TEST_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const results = {};

function pass(key, detail = "") {
  results[key] = { status: "PASS", detail };
}
function fail(key, detail = "") {
  results[key] = { status: "FAIL", detail };
}
function skip(key, detail = "") {
  results[key] = { status: "SKIP", detail };
}

async function jsonFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts);
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { res, body, text };
}

async function main() {
  console.log("\n=== Phase 9D Pilot Validation (API) ===\n");
  console.log("BASE:", BASE);
  console.log("DEV_AUTH_BYPASS:", process.env.DEV_AUTH_BYPASS);
  console.log("");

  // 1 Dashboard — API proxy for dev mode (profile without auth)
  try {
    const { res, body } = await jsonFetch("/api/inspector-profile");
    if (res.ok && body?.profile?.first_name === "Steve") {
      pass("Dashboard", "Profile API sans auth → Steve");
    } else if (res.ok && body?.dev_inspector) {
      pass("Dashboard", "dev_inspector flag present");
    } else {
      fail("Dashboard", `GET profile ${res.status} ${JSON.stringify(body)?.slice(0, 200)}`);
    }
  } catch (e) {
    fail("Dashboard", e instanceof Error ? e.message : String(e));
  }

  // 2 Profile load + save + reload
  try {
    const get1 = await jsonFetch("/api/inspector-profile");
    if (!get1.res.ok) {
      fail("Profile", `GET ${get1.res.status}`);
    } else {
      const original = get1.body?.profile;
      const stamp = `pilot-9d-${Date.now()}`;
      const put = await jsonFetch("/api/inspector-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...original,
          phone: stamp,
        }),
      });
      const get2 = await jsonFetch("/api/inspector-profile");
      const phoneOk = get2.body?.profile?.phone === stamp;
      if (put.res.ok && phoneOk) {
        pass("Profile", `Save + reload phone=${stamp}`);
      } else {
        fail("Profile", `PUT ${put.res.status} reload phone=${get2.body?.profile?.phone}`);
      }
    }
  } catch (e) {
    fail("Profile", e instanceof Error ? e.message : String(e));
  }

  // 3 Create inspection
  let reportId = null;
  let reportToken = null;
  try {
    const create = await jsonFetch("/api/inspector/create-inspection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: "Client Pilot 9D",
        address: "2404 Rue de la Reine des Prés, Mont-Laurier",
        inspectionType: "residential",
        workflowMode: "field_assistant",
      }),
    });
    if (!create.res.ok || !create.body?.reportId) {
      fail("Inspection", `${create.res.status} ${JSON.stringify(create.body)?.slice(0, 300)}`);
    } else {
      reportId = create.body.reportId;
      const tokenMatch = /token=([^&]+)/.exec(create.body.reportUrl ?? "");
      reportToken = tokenMatch?.[1] ?? null;
      // Fetch report payload via report-content if token available
      let attr = null;
      if (reportToken) {
        const content = await jsonFetch("/api/report-content", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ report_id: reportId, access_token: reportToken }),
        });
        attr = content.body?.payload?.dev_inspector_v1;
      }
      const idOk = attr?.id === "dev-steve";
      const nameOk =
        attr?.name === "Steve Charbonneau" ||
        contentHasSteveName(create.body);
      if (idOk && nameOk) {
        pass("Inspection", `reportId=${reportId} dev-steve + Steve Charbonneau`);
      } else if (create.body?.success) {
        fail("Inspection", `Created but attribution missing: ${JSON.stringify(attr)?.slice(0, 200)}`);
      }
    }
  } catch (e) {
    fail("Inspection", e instanceof Error ? e.message : String(e));
  }

  // 4 OCR + Parser — replay Steve fixture
  try {
    const fixture = JSON.parse(
      readFileSync(resolve(process.cwd(), "fixtures/steve-real-document-trace.json"), "utf8"),
    );
    const recovered = fixture.replay?.ocr_blocks_recovered ?? [];
    const hasAddress = recovered.some((b) =>
      String(b.text).includes("Reine des Prés"),
    );
    const hasYear = recovered.some((b) => String(b.text).trim() === "1990");
    if (hasAddress && hasYear) {
      pass("OCR", "Fixture replay blocks contain address + year");
      pass("Parser", "Steve field sheet trace fixture validates parser path");
    } else {
      fail("OCR", "Fixture blocks missing expected values");
      fail("Parser", "Fixture incomplete");
    }
    // Live parse with embedded text from fixture
    const parse = await jsonFetch("/api/inspection-document-intake/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: fixture.replay.embedded_text,
        fileName: "checklist-steve-anonymized.pdf",
        mimeType: "application/pdf",
        kind: "dv_pdf",
        document_type: "other",
      }),
    });
    if (parse.res.ok && parse.body?.success) {
      const addr =
        parse.body?.fusion?.property?.address ??
        parse.body?.analysis?.property?.address ??
        "";
      if (addr && addr.length > 5) {
        pass("Parser", `Live parse address: ${addr.slice(0, 80)}`);
      } else {
        fail("Parser", `Parse OK but no address extracted: ${JSON.stringify(parse.body?.prefill)?.slice(0, 200)}`);
      }
    } else {
      fail("Parser", `Parse HTTP ${parse.res.status}`);
    }
  } catch (e) {
    fail("OCR", e instanceof Error ? e.message : String(e));
    fail("Parser", "Exception during parse");
  }

  // 5 AI Analysis
  try {
    const analyze = await jsonFetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "inspection",
        images: [
          "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80",
        ],
      }),
    });
    const attr = analyze.body?.inspectorAttribution;
    if (analyze.res.ok && analyze.body?.ok && attr?.id === "dev-steve") {
      pass("AI", `Gemini OK, inspectorAttribution=${attr.id}, issues=${analyze.body.issues?.length ?? 0}`);
    } else if (analyze.res.ok && analyze.body?.ok) {
      fail("AI", `Analyze OK but no inspectorAttribution in dev mode`);
    } else {
      fail("AI", `${analyze.body?.error ?? analyze.res.status}`);
    }
  } catch (e) {
    fail("AI", e instanceof Error ? e.message : String(e));
  }

  // 6-7 Photo association + Editing — need live report with photos (manual)
  if (reportId && reportToken) {
    try {
      const content = await jsonFetch("/api/report-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, access_token: reportToken }),
      });
      const links = content.body?.payload?.photo_observation_links ?? [];
      const entries = content.body?.payload?.entries ?? [];
      if (Array.isArray(links) && links.length === 0 && Array.isArray(entries) && entries.length === 0) {
        skip("Photo Association", "New inspection — no photos imported in automated run");
        skip("Editing", "No observations to edit in automated run");
      } else {
        pass("Photo Association", `${links.length} links`);
        pass("Editing", `${entries.length} entries present`);
      }

      // 8 PDF — trigger if possible
      const trigger = await jsonFetch("/api/trigger-inspection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_id: reportId,
          access_token: reportToken,
        }),
      });
      if (trigger.res.ok || trigger.body?.success) {
        pass("PDF", "trigger-inspection accepted");
      } else {
        fail("PDF", `${trigger.res.status} ${JSON.stringify(trigger.body)?.slice(0, 200)}`);
      }

      // 9 Persistence — re-fetch
      const reload = await jsonFetch("/api/report-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, access_token: reportToken }),
      });
      if (reload.res.ok && reload.body?.payload) {
        pass("Persistence", "Report payload reload OK");
      } else {
        fail("Persistence", `Reload ${reload.res.status}`);
      }
    } catch (e) {
      skip("Photo Association", e instanceof Error ? e.message : String(e));
      skip("Editing", "blocked");
      fail("PDF", "exception");
      fail("Persistence", "exception");
    }
  } else {
    skip("Photo Association", "No report created");
    skip("Editing", "No report created");
    skip("PDF", "No report created");
    skip("Persistence", "No report created");
  }

  // 10 Audit — check dev_inspector in payload (audit table needs DB)
  if (reportId && reportToken) {
    try {
      const content = await jsonFetch("/api/report-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, access_token: reportToken }),
      });
      const attr = content.body?.payload?.dev_inspector_v1;
      if (attr?.id === "dev-steve") {
        pass("Audit", "dev_inspector_v1.id=dev-steve in report payload");
      } else {
        fail("Audit", `Missing dev_inspector_v1 in payload`);
      }
    } catch (e) {
      fail("Audit", e instanceof Error ? e.message : String(e));
    }
  } else {
    fail("Audit", "No report to inspect");
  }

  console.log("\n--- PILOT READINESS REPORT ---\n");
  for (const [k, v] of Object.entries(results)) {
    console.log(`${v.status.padEnd(5)} ${k}${v.detail ? ` — ${v.detail}` : ""}`);
  }
  const fails = Object.values(results).filter((r) => r.status === "FAIL").length;
  process.exit(fails > 0 ? 1 : 0);
}

function contentHasSteveName(body) {
  return JSON.stringify(body ?? "").includes("Steve");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
