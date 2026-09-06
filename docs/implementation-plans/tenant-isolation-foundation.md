# Tenant isolation foundation implementation plan

## Features included

- UUID-validated tenant transactions with commit, rollback, and pool cleanup.
- Reusable negative isolation harness and disposable RLS probe model.
- Immutable tenant keys, tenant-inclusive relationships and natural keys.
- Security-invoker reporting and deterministic connection-reuse verification.
- Roadmap clarification and explicit deferral of HTTP tenant-input rejection.

## Outcome and design

Implements the [roadmap capability](../roadmaps/DEVELOPMENT-ROADMAP.md#tenant-isolation-foundation)
and the [tenant transaction contract](../specs/nap-platform-specification.md#tenant-transaction-contract):
`ARCH-013`–`ARCH-021`, `ARCH-033`, `ARCH-037`, and the fixture exception in
`ARCH-044`. This is specification-owned architecture; no component PRD is needed.
ADR 0002 governs this plan's filename.

## Work and PR sequence

One implementation PR is the intended review unit. Commit, push, PR creation,
and merge require separate authorization.

1. Add the UUID-validating helper using transaction-local parameterized context,
   actual transaction-bound repositories, and transaction-object escape rejection.
2. Add frozen test-only migrations, a probe model, tenant-inclusive constraints,
   RLS policies, explicit runtime grants, and a security-invoker reporting view.
3. Register model and direct-SQL operations with a shared isolation harness.
4. Verify failures, rollback, concurrent tenants, root-handle isolation, and
   deterministic reuse after commit and rollback. Reconcile the roadmap.

Keep production registries empty. Use existing database factories, migration
runners, role assertions, Zod, and disposable PostgreSQL 18 infrastructure.
Do not introduce authentication, routes, business tables, workers, or admin flows.
Malformed UUIDs fail before opening a transaction; unmatched UUIDs return no rows.
HTTP tenant-input rejection belongs to framework/authentication delivery.

## Tests and evidence

Run focused helper and integration tests using Node 24.19.0, followed by lint,
typecheck, test, build, format:check, and licenses. Test same-tenant success and
cross-tenant read, insert, update, delete, relationship, and reporting failures;
missing/empty/unmatched context; immutable keys; tenant-scoped uniqueness;
callback failure and escape rollback; concurrent transactions; and backend-PID
verified reuse. Confirm safe privileges, repeat migrations, and absence of test
objects from production registries. Missing prerequisites fail rather than skip.
The roadmap owns status and GitHub owns CI/merge evidence.

## Rollout, risks, and recovery

Deploy the additive API code. There are no production data migrations,
backfills, new credentials, or feature gates. Application rollback restores the
previous build; fixture cleanup removes only disposable test resources.
Never weaken RLS or role checks to obtain passing verification. Transaction-bound
objects must not escape callbacks; repository escape remains a caller/review
obligation. Raw malformed SQL context is outside the empty-result guarantee.
