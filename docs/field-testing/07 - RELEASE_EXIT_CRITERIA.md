# 07 — Release Exit Criteria

Defines what must be **true** before promoting to the next version. Each item is
a PASS / FAIL check. A version is only released when **all** its criteria PASS.

Versioning convention: `v1.0.0-pilot.1 → pilot.2 → rc.1 → 1.0.0`.

---

## Table of contents

1. [pilot.2 — next pilot iteration](#pilot2--next-pilot-iteration)
2. [rc.1 — release candidate](#rc1--release-candidate)
3. [1.0.0 — official release](#100--official-release)

---

## pilot.2 — next pilot iteration

Goal: fix what blocked Steve in `pilot.1` and re-test. Small, focused iteration.

| # | Criterion | PASS/FAIL |
| --- | --- | :---: |
| 1 | All **Blocker** issues from `pilot.1` field feedback are fixed | ☐ |
| 2 | All **Major** issues either fixed or explicitly deferred with reason | ☐ |
| 3 | No **data loss** reproduced in a full inspection run | ☐ |
| 4 | No **crash** during a full inspection run | ☐ |
| 5 | Report PDF is correct on at least one real property | ☐ |
| 6 | Persistence verified (reopen after close) | ☐ |
| 7 | Automated test suites still green (`test:all` + sync/offline suites) | ☐ |
| 8 | Decision log + feedback updated for the iteration | ☐ |

## rc.1 — release candidate

Goal: production-shaped build; only stabilization, no new features.

| # | Criterion | PASS/FAIL |
| --- | --- | :---: |
| 1 | Zero open **Blocker** or **Major** issues | ☐ |
| 2 | ≥ 2 full inspections completed by Steve without work-blocking issues | ☐ |
| 3 | Offline → online sync validated **live** against Supabase (no duplicates, no loss) | ☐ |
| 4 | Report content reviewed and accepted on multiple properties | ☐ |
| 5 | Production gates verified (offline/dev features cannot activate in prod) | ☐ |
| 6 | Secrets absent from repo; environment config documented | ☐ |
| 7 | All automated suites green; no flaky tests across repeated runs | ☐ |
| 8 | Known limitations reviewed; none is release-blocking | ☐ |
| 9 | Rollback / recovery procedure documented and understood | ☐ |

## 1.0.0 — official release

Goal: first officially supported version.

| # | Criterion | PASS/FAIL |
| --- | --- | :---: |
| 1 | `rc.1` ran in real use with no new Blocker/Major for an agreed period | ☐ |
| 2 | Data integrity confirmed over multi-day usage (no loss, no duplicates) | ☐ |
| 3 | Report output accepted as client-ready | ☐ |
| 4 | Performance acceptable on the target device(s) in the field | ☐ |
| 5 | Support/runbook docs complete (`docs/PRODUCTION_RUNBOOK.md`, `docs/FAILURE_RECOVERY.md`) | ☐ |
| 6 | Backup and recovery tested | ☐ |
| 7 | Sign-off from the pilot inspector (Steve) | ☐ |
| 8 | Version tagged and release notes published | ☐ |

---

> A FAIL on any single criterion blocks that promotion. Record the decision and
> rationale in `05 - PILOT_DECISION_LOG.md`.
