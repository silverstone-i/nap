# New feature: Cell registration and tenant provisioning UI

- [x] Register, edit, enable, and disable cells under Tenant Management.
- [x] Guide operators from cell selection through pending tenant creation.
- [x] Create or link the initial employee portal identity.
- [x] Show provisioning outcomes and recover failed jobs.
- [x] Activate with a selected initial `tenant_admin`.
- [x] Verify administrator login, required password change, and tenant access.

## Accepted design and outcome

Owner approved implementation on 2026-09-11. PRD 0004 TEN-010 and PRD 0009
SHELL-009 own the new UI behavior; existing TEN-006/TEN-009, CID-001–004 and
RBAC-006/007 retain provisioning, isolation and role requirements.
Complete the operator workflow from an empty registry to first administrator
login. The roadmap owns implementation status; historical verification is preserved.

## Delivery

One capability change: document accepted behavior first, add Cells routes and
navigation, improve existing provisioning pages, then test and record evidence.
Reuse existing shared contracts and API commands; no migrations or dependencies.
Cells use DataGrid and explicit forms, stable codes, enabled toggles and disabling
confirmation. Tenant creation handles missing cells. Provisioning preserves job
IDs across failures and reports durable outcomes before offering activation.
The initial administrator is selected from ready active employee memberships.

## Verification

Run focused web/API tests, then lint, typecheck, tests, build, format:check,
licenses and git diff --check. Use an isolated real API/browser fixture with an
empty registry for registration, tenant creation, employee provisioning,
recoverable failure/retry, activation, temporary-password change and tenant access.
Check unauthorized routes, keyboard/mobile navigation and light/dark themes.

## Risks, rollout and recovery

Registration requires existing configured infrastructure; it does not start a
cell. Disabled cells prevent assigned tenant access. A successful HTTP command
can leave a failed job; status must be refreshed without duplicating membership.
The bounded overview can omit records; unavailable status is not success.
Deploy the compatible web change with existing APIs. Roll back the web build if
needed; durable jobs remain resumable. Preserve development data during tests.
Commit, push and merge are separate delivery actions.

## Evidence

Verified upon merge of [PR #23](https://github.com/silverstone-i/nap/pull/23) with required checks passing.
Local browser/API verification was completed on 2026-09-11. No production schema
or API behavior changes were required.

Real UI/API verification used a disposable PostgreSQL cluster and temporary Vite
server at a separate loopback origin; development databases were not used.
The operator began with an empty cell registry, registered `cell-1` in the Cells
screen, created pending tenant `UI-VERIFY`, and provisioned its initial employee.
A fixture-only employee-write failure produced `CELL_SYNC_FAILED` and an
inaccessible pending membership. Removing the fault and retrying the same job
completed it without a new membership. Activation selected the sole ready
employee and completed the existing server readiness/isolation checks.

The new administrator logged in, was required to change its temporary password,
then opened Dashboard and its named employee profile. Cells and central tenant
management were unavailable to that identity. The operator subsequently edited,
disabled (with confirmation), and re-enabled the cell through the UI. Screens
were inspected in light/dark modes, the narrow mobile layout, and a 1440px desktop
viewport. Mobile navigation and the collapsed desktop flyout worked; Enter opened
the flyout, Escape closed it and restored focus. Browser console reported no
warnings or errors.

Automated evidence includes new cell-registry permission coverage, administrator
role seeding after recovery, Cells page interactions, and provisioning outcomes,
lost responses, retry validation and administrator choices. Initial sandbox attempts could not start localhost
listeners/PostgreSQL; the disposable test run was rerun with approved permissions.

### Final local checks

All passed on Node 24.19.0:

- `npm test`: 407 tests (28 toolchain, 291 API, 74 web, 14 shared).
- `npm run lint`, `npm run typecheck`, `npm run build`.
- `npm run format:check`, `npm run licenses`, `git diff --check`.

The initial full run found two new Cells test selector errors, corrected before
the final complete passing run. The temporary browser tab and isolated fixture
were closed after verification. That initial verification preceded commits and PR creation.

### PR review and merge verification

PR #23 fixes stale load errors and duplicate-code warnings, permits registry-only
registration without overview access, and preserves overview gates on list/edit
routes. Regression coverage includes these permission boundaries and recovery.
All 413 tests, lint, typecheck, build, formatting, licenses and diff checks passed.
[CI on the final code revision](https://github.com/silverstone-i/nap/actions/runs/34664383321)
passed; required CI must also pass on the documentation reconciliation before merge.
Copilot recommended approval on `8c4decaf` with no new comments.

This verification covers the UI on the existing deployment topology. The agreed
one-API, multiple-cell-database topology correction remains a separate change.
