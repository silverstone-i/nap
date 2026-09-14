# Operator bootstrap and Tenant Management

- [x] Durable greenfield bootstrap and first-successful-cell claim.
- [x] Idempotent projection, RBAC and isolation verification; root-only retry.
- [x] Complete control functionality under permission-gated management destinations.
- [x] Readiness and protected-root presentation.
- [x] Isolated API/browser validation and required repository checks.

Owner accepted implementation on 2026-09-13. ADR 0015, TEN-011 and SHELL-010 own behavior. One cohesive change; no existing DEV/PROD database mutation or deployment.

Validation covers normal rerun no-op, no upgrade enrollment, first successful cell, interruptions and duplicate execution, independent bootstrap failure, permission boundaries, legacy redirects, ordinary provisioning and desktop/mobile navigation. Test resources are disposable; production provisioning is mocked.

## Evidence

Verified upon merge of [PR #25](https://github.com/silverstone-i/nap/pull/25) with required checks passing. Validated on Node 24.19.0. No deployment performed.

All 489 tests passed: 58 toolchain/provisioning, 338 API, 79 web and 14 shared.
Lint, typecheck, build, formatting, production licenses and git diff checks pass.
The added operator-bootstrap tests cover no-op reruns, no upgrade enrollment,
first-cell selection, duplicate/concurrent execution, post-write failure/retry,
root preservation and negative isolation. Existing multi-cell/RBAC/provisioning
suites exercise normal tenant activation and mocked production infrastructure.

Browser verification used a fresh temporary PostgreSQL cluster, isolated DEV
configuration/state files, a real API and a temporary Vite origin. No application
DEV or production databases were used. Root signed in to an empty cell registry;
its tenant showed no assignment, pending bootstrap and no activation-success
message. Register cell created and enabled the first cell. A fixture-only audit
write failure left bootstrap failed while the cell remained available. After
removing that fault, Retry bootstrap completed the same selected cell, showing
projection Confirmed and RBAC Ready with protected root controls omitted.

Verified Platform access and Audit destinations, the bootstrap completion audit
event, controlled access to Dashboard and exit, /control and /platform-access
redirects, mobile navigation at 390x844 and collapsed desktop navigation at
1440x900. Desktop and mobile screenshots were inspected. One transient Vite HMR
error occurred while editing source; final navigation and reloads succeeded.
Viewport override was reset and the temporary browser tab/server/database were
closed after verification.

Initial test runs exposed outdated overview/route assertions and a fixture that
removed a cell now referenced by bootstrap tracking. Those tests were updated
to the new contract and an uncompleted bootstrap fixture respectively; the final
full suite passed. The initial sandbox listener restriction was resolved by
running the isolated fixtures with approved permissions.

DEV cleanup validation uses the disposable PostgreSQL cluster. It covers required
confirmation, refusal of other environment arguments, ownership checks before
any drops, DEV-only deletion, preserved TEST/PROD databases and credentials,
environment comments, state removal and repeat cleanup. The README includes
cleanup, setup, migration, bootstrap and API/web startup instructions.

PR #25 review fixes publish running bootstrap progress in a committed transaction
before cell writes, with a paused-write test proving overview visibility and
concurrent-worker exclusion. The controlled employee access test waits explicitly
for lazy-route initialization. The complete local suite and all 79 web tests in
CI mode pass. Running database fixtures with CI mode locally requires GitHub's
service configuration, so database validation used the disposable local fixtures.

## Final verification

[Repository CI](https://github.com/silverstone-i/nap/actions/runs/34795459114) passed
all required checks on the implementation head. The final documentation head must
also pass required checks before merge. The evidence above covers the completed
capability; no existing installation cleanup or production deployment was performed.
