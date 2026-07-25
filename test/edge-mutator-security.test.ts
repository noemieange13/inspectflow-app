import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

describe("Edge mutator service-role gates", () => {
  it("requires matching Bearer + apikey service-role credentials", () => {
    const source = read("supabase/functions/_shared/serviceRoleAuth.ts");
    assert.match(source, /hasServiceRoleCredentials/);
    assert.match(source, /Bearer/);
    assert.match(source, /apikey/);
    assert.match(source, /bearer === serviceRoleKey && apikey === serviceRoleKey/);
  });

  it("gates reports-pdf behind service-role credentials", () => {
    const source = read("supabase/functions/reports-pdf/index.ts");
    assert.match(source, /hasServiceRoleCredentials/);
    assert.match(source, /Unauthorized/);
    assert.match(
      source,
      /if\s*\(\s*!hasServiceRoleCredentials\s*\(\s*req\s*,\s*SERVICE_ROLE\s*\)\s*\)/,
    );
  });

  it("gates process-notes behind service-role credentials", () => {
    const source = read("supabase/functions/process-notes/index.ts");
    assert.match(source, /hasServiceRoleCredentials/);
    assert.match(source, /Unauthorized/);
    assert.match(
      source,
      /if\s*\(\s*!hasServiceRoleCredentials\s*\(\s*req\s*,\s*SERVICE_ROLE\s*\)\s*\)/,
    );
  });
});

describe("process-notes lock and encoding integrity", () => {
  it("does not auto-unlock finalized reports when appending notes", () => {
    const source = read(
      "supabase/functions/_shared/updateReportPayloadWithAutoUnlock.ts",
    );
    assert.match(source, /p_allow_unlock:\s*false/);
    assert.doesNotMatch(source, /p_allow_unlock:\s*true/);
  });

  it("encodes note media without spreading the full buffer into fromCharCode", () => {
    const source = read("supabase/functions/process-notes/index.ts");
    assert.match(source, /bytesToBase64/);
    assert.doesNotMatch(
      source,
      /btoa\s*\(\s*String\.fromCharCode\s*\(\s*\.\.\.\s*new Uint8Array/,
    );
  });
});

describe("claim_report_lock privilege hardening", () => {
  it("revokes authenticated/anon execute on claim_report_lock", () => {
    const source = read(
      "supabase/migrations/20260725120000_revoke_claim_report_lock_authenticated.sql",
    );
    assert.match(
      source,
      /revoke execute on function public\.claim_report_lock\(uuid\) from authenticated/i,
    );
    assert.match(
      source,
      /revoke execute on function public\.claim_report_lock\(uuid\) from anon/i,
    );
    assert.match(
      source,
      /grant execute on function public\.claim_report_lock\(uuid\) to service_role/i,
    );
  });
});
