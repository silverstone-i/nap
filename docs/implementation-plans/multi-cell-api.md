# One API application serving multiple cell databases

Design accepted by owner, 2026-09-11. Implemented locally; not merged or shipped.
The owner authorized PR preparation with release:minor on 2026-09-12, superseding
the earlier no-PR instruction. Required CI remains pending.

## Feature checklist

- [x] Amend topology and supersede ADR 0007 with ADR 0011.
- [x] Configure runtime connections by registered cell UUID.
- [x] Initialize independent pools, repositories, readiness and recovery.
- [x] Dispatch module requests and operator writes to the assigned database.
- [x] Remove forwarding and update maintenance/configuration tooling.
- [x] Verify concurrent two-cell isolation, outages, provisioning and browser flows.

## Implementation

The specification's ARCH-009/010 and [ADR 0011](../ADRs/0011-one-api-multiple-cell-databases.md)
own the topology. This plan records implementation and verification, not a second
architecture contract. No dependencies or schema migrations were added.

1. **Architecture:** amended the specification, authentication/control-plane PRDs,
   ADR index and roadmap. Marked the historical forwarding runbook superseded.
2. **Configuration:** `apps/api/src/util/env.ts` validates UUID-keyed
   `CELL_DATABASES_DEV/TEST/PROD` component maps (ADR 0012). Empty maps allow registration.
   Invalid UUIDs, malformed URLs, duplicate targets and admin/cell overlap fail
   without exposing credentials. Obsolete runtime names are rejected. CellsPage
   shows the UUID only on overview-authorized details.
3. **Lifecycle:** `server.ts` creates each pool with at most ten connections and
   UUID-namespaced authorization caching. `services/cellRegistry.ts` owns startup
   identity checks, independent readiness and 30-second recovery. Readiness checks
   connectivity, role safety and registered relations without creating tables.
   Logs contain UUID, state and fixed failure categories. `runtime.ts` keeps
   admitted requests' handles available while draining, then closes all pools.
4. **Dispatch:** `framework/routeRegistry.ts` creates fixed router/controller
   instances per cell and dispatches using internal `ResolvedSession.cellId`.
   `resolveSession.ts` remains admin-only; `cellAuthorization.ts` loads selected
   cell grants/projections. `controlPlane.ts` and `entitlements.ts` select the
   authorized target tenant/job/membership/cell. Durable-job and cross-database
   failure semantics remain intact. No global current database or HTTP hop exists.
5. **Operations:** removed forwarding middleware and process modes. Migrations and
   resets still target one explicit database per invocation. Access maintenance
   requires a cell UUID and verifies its migration target against the runtime
   map and central assignment. Updated local/CI fixtures and configuration examples.
6. **Verification:** the multi-cell fixture runs one listener with admin and two
   independently credentialed databases. Conformance checks exercise each router
   instance, including rejection of a malformed second instance. Existing business
   controllers and tenant transaction contracts remain unchanged.

## Verification evidence

Local verification on 2026-09-11 (UTC logs dated 2026-09-12):

- Full test run: 428 passing tests (28 toolchain, 306 API, 80 web, 14 shared).
- Multi-cell HTTP tests cover simultaneous reads and writes with overlapping
  record UUIDs, spoofed header/query/body selectors, tenant switching, controlled
  access, scoped RBAC, field grants and cache isolation.
- An operator assigned to cell 1 provisions/retries/activates cell 2 tenants.
  Durable jobs retain failures and recover safely, including cell commits followed
  by central rollback. Disabled/missing/unconfigured targets fail safely.
- Cell 2 unavailable at startup does not block admin readiness. The real
  30-second timer restores it after recovery without API restart. Unsafe roles
  and missing relations quarantine the cell while the other remains available.
- Runtime tests reject unknown configured UUIDs before listening and verify all
  three pools and cache resources close after request drain.
- Browser verification used disposable databases and one same-origin Vite proxy
  at `127.0.0.1:4179`: empty connection map → register both cells → verify UUID
  display → configure handles/restart → create one tenant per cell → provision
  employee administrator → completed durable job → activate with confirmed
  projection → administrator login for each tenant. Both logins reached the
  mandatory temporary-password change screen. No browser warnings/errors were
  captured. Password-change completion and subsequent tenant operations were
  verified by integration tests, not this browser pass. The temporary harness
  and its disposable databases were removed.
- Final local checks passed: `npm run lint`, `npm run format:check`,
  `npm run typecheck`, `npm test`, `npm run build`, `npm run licenses`
  (227 production package records), and `git diff --check`.
- No production deployment, database reset, data conversion or tenant movement.
  No commits, pushes or PR creation. Required CI must pass before a later merge.

## Rollout

1. Keep the prior artifact and its deployment configuration available. Preserve
   admin/session data and tenant assignments; this change has no data conversion.
2. Apply `npm run db:migrate:admin` using deployment-owned migration credentials.
   For a fresh installation, bootstrap admin and start with an empty cell map.
3. Register each cell in Management → Cells and copy its UUID from the detail
   page. Existing cells keep their UUIDs, codes and assignments.
4. Supply ADMIN_DATABASE_PROD and CELL_DATABASES_PROD using the component
   structure in `.env.example` and ADR 0012. API entries contain appPassword only;
   maintenance execution supplies adminPassword for its selected database.
5. Run `npm run db:migrate:cell -- --cell-id <registered-uuid>` separately for
   each cell. The fixed nap_admin role owns migration work and grants nap_app.
   Physical registration/identity checks remain deferred to the setup correction;
   configuration matching is not proof of provisioning.
6. Remove `API_MODE`, `CELL_CODE`, `CELL_API_ORIGINS` and singular
   `CELL_DATABASE_URL_DEV/TEST/PROD` from the new runtime environment. Retain their
   prior values only in the rollback configuration, not the running environment.
7. On Render, run one API service using the built `apps/api/dist/server.js`, with
   the admin URL, full cell map, existing session/cache settings and correct
   trusted-proxy configuration. Preserve the existing same-origin web/API ingress.
   Permit this service to connect to both independently hosted databases. There
   are no private cell HTTP services or cell API origins in the new topology.
8. Roll out the new build and configuration together after migrations. Check
   `/health/ready`, per-cell readiness transitions, login/admin operations and
   tenant reads/writes in each cell. Connection-map changes require API restart;
   recovery of an already configured database does not.

The API now holds credentials for every configured cell. Per-cell database roles
remain restricted, but credentials no longer isolate API processes. API process
availability is shared; individual database outages are isolated.

## Rollback

Restore the prior API artifact, prior process topology and its matching secrets
as one coordinated operation behind the same public origin. Stop routing traffic
to the new process before retiring it. Preserve existing databases and assignments;
no down migration, reset or data movement is required. Recheck central login and
both tenant destinations. This task does not authorize production deployment.

## Local configuration note

ADR 0012 supersedes the complete-URL configuration recorded in the original
verification. The configuration correction preserves existing secret values,
uses the owner-selected admin runtime password for all DEV targets, and keeps
empty maps empty. No cell UUID is invented. See the
[configuration plan](environment-configuration.md) for current verification.

## Combined PR validation — 2026-09-12

The multi-cell runtime and ADR 0012 configuration correction passed all 444 tests
(32 toolchain, 318 API, 80 web, 14 shared) and required local static/build/license
checks. These results include disposable database fixtures. Production deployment,
physical identity verification, and the complete setup correction remain outside
this PR. Earlier browser evidence is historical; no new browser pass was run.
