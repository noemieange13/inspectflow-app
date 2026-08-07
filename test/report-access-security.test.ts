import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reportViewerTokenAccepted } from "@/lib/reportViewerServer";

describe("report viewer token gate", () => {
  it("rejects missing viewer token when the report has an access token", () => {
    assert.equal(reportViewerTokenAccepted({ access_token: "secret" }, undefined), false);
    assert.equal(reportViewerTokenAccepted({ access_token: "secret" }, ""), false);
  });

  it("accepts matching non-expired tokens and keeps legacy tokenless reports open", () => {
    assert.equal(reportViewerTokenAccepted({ access_token: "" }, undefined), true);
    assert.equal(
      reportViewerTokenAccepted(
        {
          access_token: "secret",
          token_expires_at: new Date(Date.now() + 60_000).toISOString(),
        },
        " secret ",
      ),
      true,
    );
  });

  it("rejects expired viewer tokens", () => {
    assert.equal(
      reportViewerTokenAccepted(
        {
          access_token: "secret",
          token_expires_at: new Date(Date.now() - 60_000).toISOString(),
        },
        "secret",
      ),
      false,
    );
  });
});
