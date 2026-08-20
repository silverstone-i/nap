# RULES — Database access and tenant transactions

Governs `apps/api/src/db/`, database use in `apps/api/src/modules/`, migration
scripts, workers, imports, and reporting query entry points.

**Implements:** `ARCH-004`, `ARCH-009`, `ARCH-014`–`ARCH-025`, `ARCH-033`,
`ARCH-037`

**Decision:** [ADR 0004](../ADRs/0004-central-admin-cells-and-rls-tenant-isolation.md)

## Composition roots

Only `db/admin/createAdminDb.ts` creates the central handle. Only
`db/cell/createCellDb.ts` creates a cell handle. Both use `pg-schemata`'s
factory API; feature modules receive an owning handle or transaction and never
initialize a global database connection.

The admin composition root registers only admin-targeted module repositories.
The cell composition root registers only cell-targeted module repositories.
Migration and bootstrap calls always originate from the handle being targeted.

Do not call `pgp.end()` for per-handle shutdown. Use the owning database
handle's `close()` method.

## Tenant transaction entry point

`withTenantTransaction()` is the only general entry point for tenant-owned
queries from HTTP, workers, imports, and reports.

Its contract is structurally equivalent to:

```ts
withTenantTransaction<T>(
  cellDb: CellDatabase,
  tenantId: string,
  work: (tx: CellTransaction) => Promise<T>,
): Promise<T>
```

The implementation must:

1. validate that `tenantId` is a UUID before sending it to PostgreSQL;
2. open a transaction through the supplied cell handle;
3. execute `SET LOCAL nap.tenant_id = $1` using a parameterized value;
4. run `work` with the transaction-bound repositories;
5. commit or roll back before the connection returns to the pool;
6. avoid returning the transaction object or a transaction-bound repository to
   the caller.

Do not use a session-level `SET`, `search_path`, a repository `forSchema()`
call, or a client-provided database address for tenant selection.

## Query boundaries

- Admin repositories may be used outside a tenant transaction only for their
  central control-plane responsibilities.
- Cell repositories that read or write tenant-owned tables require a
  transaction supplied by `withTenantTransaction()`.
- A domain service may accept an existing tenant transaction to avoid nested
  transactions, but may not silently fall back to a root cell handle.
- A repository method does not accept a `tenant_id` as an authorization
  substitute. Explicit tenant values used in inserts must agree with the active
  transaction context and remain protected by RLS `WITH CHECK`.
- Cross-database workflows complete one database operation at a time with
  idempotency, revision, retry, and recovery state. Do not simulate a
  distributed transaction.

## Migration construction

- Every tenant-owned migration adds `tenant_id`, a tenant-inclusive candidate
  key, and tenant-inclusive foreign keys before the table is exposed to the
  runtime role.
- The same migration enables and forces RLS and creates both `USING` and
  `WITH CHECK` policy expressions.
- Grants are applied to the non-owner runtime role after policies exist.
- Admin and cell migration commands require an explicit target configuration.
- Application startup may check readiness but never applies production
  migrations.
- Schema changes follow expand-and-contract sequencing under `ARCH-026`.

## Roles and administrative access

Runtime configuration must fail startup when the application role owns
tenant tables or has `SUPERUSER` or `BYPASSRLS`. Migration credentials are not
available to ordinary request handling.

Controlled cross-tenant jobs use a separate role and a separately reviewed
entry point that records actor, reason, scope, start, outcome, and completion.

## Caches and routing

Redis adapters live behind `db/` or `services/` and expose cache semantics, not
authorization decisions. A miss or error invokes the PostgreSQL-backed loader.
Code must not interpret cache presence as permission or cache absence as
revocation without consulting the owning service contract.

Tenant-to-cell resolution returns a logical cell identifier. Deployment
configuration maps that identifier to an allowed handle or internal route;
tenant records never provide credentials.

## Required tests

The shared isolation test harness is used by every tenant-aware module. It runs
with the real runtime role and covers the attempts required by `ARCH-033`, plus
operation with no tenant context and with an invalid context.

Database-factory tests prove handle-specific repository registration,
migration targeting, bootstrap targeting, audit isolation, and independent
shutdown. Provisioning tests inject a failure between central and cell steps
and prove retry or recovery without premature activation.

