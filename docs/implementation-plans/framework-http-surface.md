# Framework HTTP surface implementation plan

## Features already implemented

Delivered by earlier platform capabilities. This plan reuses them and does not
recreate them.

- `withTenantTransaction` and the `CellDatabase` handle type, the only entry
  point for tenant-owned queries.
- The success, list, and error envelopes, `pageSchema`, and the error-code
  registry in `@nap/shared`.
- `HttpError` and the `errorResponses` status table, the boundary error
  handler, correlation, request logging, and the bounded JSON body parser.
- `validateBody` with dotted-path field errors and `sendContract` for
  response-contract validation.
- The disposable PostgreSQL fixture, the `isolationDatabase` provisioning
  pattern, and the shared tenant-isolation harness.
- The workspace import-boundary test built on the TypeScript parser.

## Work checklist

- [x] Amend the specification's technology stack and framework HTTP contract
      and add a revision.
- [x] Add the list, batch, and spreadsheet transport contracts and the three
      error codes to the shared package.
- [x] Add the session gates, tenant-input rejection, and the raw spreadsheet
      body reader.
- [x] Add `framework/`: controllers, the router factory, list parsing,
      operations, spreadsheet handling, and the route registry.
- [x] Name the runtime handles and mount the registry from the app.
- [x] Add the fixture model, unit, integration, isolation, conformance, and
      layer tests.
- [x] Verify, then reconcile the roadmap, changelog, and this plan.
- [x] Amendment of 2026-09-07: admin-targeted routers and declared route
      access, delivered with the amendment in the Authentication design pull
      request.
  - [x] `db/admin/index.ts` carries repositories like the cell pool,
        `db/admin/repositories.ts` is the admin composition root, and
        `db/withAdminTransaction.ts` opens a plain admin transaction.
  - [x] `framework/ReadController.ts` records a binding of pool and target;
        `describeModel` and `runOperation` dispatch on it.
  - [x] `framework/createRouter.ts` pushes gates by declared access, gives
        extension operations the client address and cookie controls, and
        refuses access declarations outside the `admin-tenancy` auth router.
  - [x] `framework/routeRegistry.ts` registers a target per router and
        `mountRoutes` passes the matching pool; `app.ts` and `runtime.ts` pass
        both pools and the trusted proxy hop count from `TRUST_PROXY_HOPS`.
  - [x] Unit, conformance, layer, and admin-router integration tests.

## Outcome and accepted design

Implement `ARCH-050` from the
[specification](../specs/nap-platform-specification.md#arch-050--uniform-module-http-surface):
the [framework HTTP contract](../specs/nap-platform-specification.md#framework-http-contract)'s
standard route set, ordered middleware chain, list parameters, batch
semantics, refusals, and spreadsheet routes, produced by `createRouter` over a
controller extending `ReadController` or `WriteController`. This is
specification-owned architecture and needs no component PRD. ADR 0002 governs
this filename. The plan is required because the capability establishes the
authorization and tenant-isolation boundary every module route passes. No new
ADR is needed: naming the spreadsheet library in the stack and the raw upload
media type in the contract are specification amendments recorded on
2026-09-07, not changed decisions.

The owner resolved the roadmap's blocker on 2026-09-07: no multipart parser
enters the stack. `POST /import-xls` receives the workbook bytes as the request
body, and the organization-owned `@nap-sft/tablsx` reads and writes workbook
bytes in memory; pg-schemata's file-path spreadsheet helpers are not used.

## Work and PR sequence

One coherent implementation PR. Amend the specification first, then the shared
package, the API, tests, and documentation. Commit, push, PR creation, and
merge require separate authorization.

The shared package gains `transport/lists.ts` with the list parameter names,
the page-size defaults (50, maximum 500), the sort expression grammar, the
`archived` selector (`exclude`, `only`, `include`), and the loose
`listQuerySchema`; `transport/batches.ts` with the batch limit (500), the
`ids` body, and the bulk-insert, update, and bulk-update body factories; and
`transport/spreadsheets.ts` with the workbook media type, the 5 MB upload
ceiling, the 5000-row import limit, and the `sheet` query schema. The error
registry gains `UNAUTHENTICATED`, `FORBIDDEN`, and `CONFLICT`.

The API gains, in `middleware/`, the resolved-session type and the four gates
`requireSession`, `requireTenant`, `requireEntitlement`, and
`requirePermission`; `rejectTenantInput`, which refuses a tenant identifier in
headers, query, route parameters, or body at any depth; and `xlsxBody`, which
reads a workbook body behind the ceiling. The JSON body parser passes a
workbook body through unread, and request logging reports the route label the
framework sets. `db/cell/repositories.ts` becomes the composition root for the
repositories on the runtime cell handle, and the runtime takes named `admin`
and `cell` handles so the app can mount routers.

`framework/` gains `ReadController` and `WriteController` (configuration
only), `modelContract.ts` (reads a model's schema once at construction),
`listQuery.ts` (parameters and the keyset cursor), `recordInput.ts` (column
checks), `runOperation.ts` (the one tenant transaction per request and the
SQLSTATE mapping), `operations.ts` (the ten standard operations over the
transaction-bound repository), `spreadsheets.ts` (the only tablsx importer),
`createRouter.ts` (the chain, route set, disabling, and extension callback),
and `routeRegistry.ts` (the empty registry and `mountRoutes`). tablsx ships no
type declarations, so `types/nap-sft-tablsx.d.ts` declares the members used;
adding declarations upstream is a follow-up in tablsx.

Every framework route answers `UNAUTHENTICATED` until the authentication
capability installs the session resolver, and the registry is empty, so no
production route is reachable. A batch refusal answers `INVALID_INPUT` with
field errors keyed `ids.<i>` or `records.<i>.id`, the only envelope slot that
can name a refused item under `ARCH-043`, without echoing values.
Resource-scope middleware, the permission vocabulary, the actor resolver, and
filter operators are deferred to the capabilities that own them.

The 2026-09-07 amendment adds two declared variations. A controller records a
binding of its pool and target, `cell` or `admin`; `describeModel` requires
`tenant_id` only for a cell model, and `runOperation` opens a tenant
transaction for a cell pool and a plain `withAdminTransaction` for an admin
pool, with the same failure mapping. An extension route may declare `access`
as `anonymous` or `authenticated`; the factory pushes no session gate or only
`requireSession` for those, keeps tenant-input rejection on every route, hands
the operation the client address (Express's trusted-proxy setting, from
`TRUST_PROXY_HOPS`) and cookie controls applied only after the operation
succeeds, and throws at construction when any router but `admin-tenancy`'s
`auth` declares access. The route registry records a target per registration
and `mountRoutes` receives both pools.

## Verification and evidence

Shared tests prove the new schemas accept valid input and reject wrong
selectors, oversized batches, duplicate identifiers, and non-integer sizes.
API unit tests drive each gate, tenant-input rejection in every location, the
raw body ceiling before the body is read, list parsing and cursor tampering,
record column checks, the SQLSTATE mapping, and router construction refusals
and route order. A conformance test scans `modules/` and `framework/` with the
TypeScript parser for routers not produced by the factory and for repository
reach outside `withTenantTransaction`, and a toolchain test enforces the API
import layers and composition-root exemptions. Integration tests against
disposable PostgreSQL 18 drive every standard route through a fixture model
with row-level security: the denial ladder, unknown filter columns, page
clamping, keyset traversal in both directions, archived selectors and totals,
a disabled route answering byte-identically to an unknown path, batch
refusals that commit nothing, unique conflicts, tenant input in every
location, cross-tenant reads answering not found, extension routes rolling
back, and the export/import round trip. The fixture model registers with the
tenant-isolation harness. Run focused tests first, then lint, typecheck, test,
build, format:check, and licenses on the pinned Node. The roadmap records
actual evidence; Verified requires merged passing delivery.

## Local verification evidence

On 2026-09-07, Node 24.19.0 passed lint, typecheck, all 180 tests (17
toolchain, 146 API, 5 web, 12 shared), build, format:check, and the production
license check (220 package records). The API integration and isolation tests
ran against disposable PostgreSQL 18 fixtures, which need a locale in the
environment.

On 2026-09-07 the amendment's tests passed locally: router construction with
each access mode and the `admin-tenancy` restriction, admin binding and the
dropped tenant requirement, `runInAdmin` failure mapping and dispatch by
target, the conformance scan for access declarations, the layer test with the
admin composition root, and the admin-router integration suite against
disposable PostgreSQL 18: standard routes with no tenant setting, an anonymous
route without a session whose cookie is applied only on success, an
authenticated route with a tenantless session, tenant input refused on both,
and the client address by socket unless proxy hops are trusted.

## Merge and CI evidence

[PR #9](https://github.com/silverstone-i/nap/pull/9) merged on 2026-09-07 with
the `changelog`, `checks`, and `release` workflows passing. On 2026-09-07 every
gate item was matched to a passing test and every repository check was re-run
on `main`; the roadmap records the result.

## Defaults, rollout, and recovery

No migrations, credential changes, or changes to what existing endpoints
answer. Health responses are byte-identical. The route registry is empty and
every framework route refuses without a resolved session, so the deployed
surface is unchanged. Deploy the API artifact as usual; rollback restores the
previous artifact. No feature gates or ordered release units.

Configuration note, 2026-09-12: ADR 0012 supersedes unsuffixed environment-sensitive settings in this historical delivery record. The current variable inventory is apps/api/.env.example.
