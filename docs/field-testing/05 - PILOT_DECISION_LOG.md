# 05 — Pilot Decision Log

A running history of decisions made during the pilot, so the rationale behind
each change is never lost. Add a new row for every meaningful decision.

---

## How to use

- One row per decision.
- Keep **Reason** short but specific (why, not just what).
- **Impact** = what changes for Steve / the product / the schedule.
- **Version** = the release the decision targets or was made under.

---

## Decision log

| Date | Decision | Reason | Impact | Version |
| --- | --- | --- | --- | --- |
| 2026-07-01 | Freeze pilot baseline and tag it | Need a clear, reproducible reference before field testing | Field issues can be traced to a known version | v1.0.0-pilot.1 |
| 2026-07-01 | Exclude `inspectflow-ui/`, OCR binaries, secrets, temp dumps from the release | Keep the reference clean, reproducible, and safe | Smaller, buildable baseline; OCR fetched at runtime | v1.0.0-pilot.1 |
| 2026-07-01 | Restrict pilot fixes to crashes / data loss / sync / incorrect reports / blockers | Protect pilot stability; avoid feature churn | Cosmetic requests deferred to a later version | v1.0.0-pilot.1 |
| 2026-07-03 | Add Steve field testing pack (docs only) | Give Steve a clear, repeatable test protocol | Structured feedback and bug capture | v1.0.0-pilot.1 |
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |
