import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { validateReportVersionListViewerAccess } from "@/lib/reportVersionListAccess"

const NOW = new Date("2026-05-12T11:00:00.000Z")

describe("report version list viewer access", () => {
  it("rejects a missing report", () => {
    assert.deepEqual(
      validateReportVersionListViewerAccess(null, "token", NOW),
      { ok: false, status: 404, error: "REPORT_NOT_FOUND" },
    )
  })

  it("rejects arbitrary tokens when the report has no stored viewer token", () => {
    assert.deepEqual(
      validateReportVersionListViewerAccess({ access_token: null }, "anything", NOW),
      { ok: false, status: 403, error: "ACCESS_TOKEN_REQUIRED" },
    )
  })

  it("rejects a wrong viewer token", () => {
    assert.deepEqual(
      validateReportVersionListViewerAccess(
        { access_token: "correct-token" },
        "wrong-token",
        NOW,
      ),
      { ok: false, status: 403, error: "ACCESS_TOKEN_INVALID" },
    )
  })

  it("rejects an expired viewer token", () => {
    assert.deepEqual(
      validateReportVersionListViewerAccess(
        {
          access_token: "correct-token",
          token_expires_at: "2026-05-12T10:59:59.000Z",
        },
        "correct-token",
        NOW,
      ),
      { ok: false, status: 403, error: "ACCESS_TOKEN_EXPIRED" },
    )
  })

  it("accepts a valid unexpired viewer token", () => {
    assert.deepEqual(
      validateReportVersionListViewerAccess(
        {
          access_token: "Correct-Token",
          token_expires_at: "2026-05-12T11:00:01.000Z",
        },
        " correct-token ",
        NOW,
      ),
      { ok: true },
    )
  })
})
