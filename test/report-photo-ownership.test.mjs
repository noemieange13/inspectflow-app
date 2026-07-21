import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const read = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.notEqual(from, -1, `missing source marker: ${start}`);
  assert.notEqual(to, -1, `missing source marker: ${end}`);
  return source.slice(from, to);
}

function assertConditionallyScoped(block, executionMarker) {
  const scope = 'query = query.eq("inspection_id", inspectionId)';
  assert.match(
    block,
    /if \(inspectionId\) \{\s*query = query\.eq\("inspection_id", inspectionId\);\s*\}/,
  );
  assert.ok(
    block.indexOf(scope) < block.indexOf(executionMarker),
    "inspection scope must be applied before executing the photo query",
  );
}

describe("report photo ownership", () => {
  it("scopes create-report photo resolution to the resolved inspection", () => {
    const source = read("supabase/functions/create-report/index.ts");
    const lookup = between(
      source,
      "async function photoExists",
      "async function resolvePhotoId",
    );
    const resolver = between(
      source,
      "async function resolvePhotoId",
      "Deno.serve",
    );
    const writerFlow = between(
      source,
      "let inspectionId = optUuid(body.inspection_id)",
      "const client = String(body.client",
    );

    assert.match(
      lookup,
      /\.eq\("id", id\)\s*\.eq\("inspection_id", inspectionId\)/,
    );
    assert.match(
      resolver,
      /photoExists\(supabase, candidate, inspectionId\)/,
    );
    assert.doesNotMatch(
      writerFlow,
      /resolvePhotoId\(supabase,\s*(?:jobPhoto|explicit)\s*\)/,
    );
    assert.equal(
      [...writerFlow.matchAll(/resolvePhotoId\(supabase,/g)].length,
      3,
      "job-derived and explicit photos must all use the scoped resolver",
    );
  });

  it("scopes every reports-pdf fallback when report inspection_id is known", () => {
    const source = read("supabase/functions/reports-pdf/index.ts");
    const flow = between(
      source,
      "async function fetchPhotoAnalysesForReport",
      "function scorePhotoQuality",
    );
    const reportPhoto = between(
      flow,
      "if (links?.photo_id",
      "if (links?.job_id",
    );
    const jobPhoto = between(
      flow,
      "if (links?.job_id",
      "\n  if (inspectionId) {\n    const { data, error }",
    );
    const selection = flow.slice(
      flow.lastIndexOf("if (wanted && wanted.size > 0)"),
    );

    assertConditionallyScoped(reportPhoto, "query.maybeSingle()");
    assertConditionallyScoped(jobPhoto, "query.maybeSingle()");
    assertConditionallyScoped(selection, "const { data, error } = await query");
  });
});
