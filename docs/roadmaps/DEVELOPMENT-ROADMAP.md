# NAP development roadmap

**Status:** Current planning sequence

**Date:** 2026-08-19

**Architecture:** [PRD 0000 — NAP Platform Architecture](../PRDs/0000-nap-platform-architecture.md)

**Structure:** [NAP project structure](../architecture/PROJECT-STRUCTURE.md)

## Purpose

This roadmap defines build order, dependencies, and phase gates. It does not
define architecture, table ownership, API contracts, or implementation rules.
Those remain in PRDs, the project-structure document, ADRs, and RULES.

The proposed table inventory is a planning aid only. Before a phase creates a
business module, its component PRDs must convert the relevant inventory into
accepted table definitions, behavior, API contracts, permissions, and success
criteria.

## Delivery principles

- Build thin vertical slices through the real web, API, authorization, and
  database boundaries; do not finish all tables before proving the boundary.
- Establish tenant isolation before adding tenant business data.
- Establish posting and accounting invariants before automating AP or AR.
- Add a deployment unit only when the applicable PRD requirement and ADR allow
  it.
- A phase may start design work early, but implementation does not pass its
  gate until its dependencies and component PRDs are accepted.

## Dependency path

```text
foundation
    │
    ▼
identity and control plane
    │
    ▼
cell provisioning and tenant isolation
    │
    ▼
access control and entitlements
    │
    ▼
parties and reference data
    │
    ├──────────────► catalog
    │
    ▼
projects ──► cost control
    │
    ▼
accounting foundation
    ├────────► accounts payable
    ├────────► accounts receivable
    └────────► reporting
```

## Phases

### Phase 0 — Repository and documentation foundation

**Scope:** Establish the monorepo skeleton, workspace tooling, documentation
contract, continuous checks, and independently buildable web and API shells.

**Requirements:** `ARCH-001`–`ARCH-003`, `ARCH-027`

**Gate:** The repository matches `PROJECT-STRUCTURE.md`; web and API lint,
typecheck, test, and build independently; ADRs 0001–0004 and the governing
RULES are accepted and linked.

### Phase 1 — Database and isolation foundation

**Modules:** Database composition roots and migration registries; no business
module yet.

**Requirements:** `ARCH-004`, `ARCH-013`–`ARCH-020`, `ARCH-024`–`ARCH-026`,
`ARCH-033`, `ARCH-036`, `ARCH-037`

**Gate:** Separate admin and Cell 1 handles and migrations work against
separate databases. A deliberately small tenant-owned test table proves
transaction-local context, forced RLS, tenant-inclusive constraints, runtime
role restrictions, negative isolation tests, and independent handle closure.

### Phase 2 — Identity and central control plane

**Modules:** `identity`, `memberships`, `tenants`, `platform`

**Requirements:** `ARCH-005`–`ARCH-009`, `ARCH-021`–`ARCH-023`, `ARCH-032`

**Depends on:** Phase 1

**PRD work:** Accept component PRDs for authentication and sessions, tenant
registry and membership, cell registry and assignment, and controlled
administration before implementing those components.

**Gate:** A user can authenticate against central authority, list only active
memberships, and express a tenant choice without the client selecting a cell
or database. Revocation and stale cached state cannot increase access.

### Phase 3 — Cell directory and tenant provisioning

**Modules:** `cell-directory` plus provisioning and projection-synchronization
services

**Requirements:** `ARCH-010`–`ARCH-012`, `ARCH-016`, `ARCH-028`, `ARCH-034`–
`ARCH-036`, `ARCH-038`

**Depends on:** Phase 2

**PRD work:** Accept component PRDs for tenant provisioning, enforcement
projections, placement, recovery, and the operator workflow.

**Gate:** The first complete vertical slice proves login, tenant selection,
authoritative cell resolution, tenant-scoped cell transaction, one safe company
read, cross-tenant denial, recoverable provisioning failure, and stable client
addressing. A second-cell test reuses the same build and migration set.

### Phase 4 — Access control and module entitlement

**Modules:** `access-control`

**Requirements:** `ARCH-002`, `ARCH-020`–`ARCH-023`, `ARCH-029`, `ARCH-032`,
`ARCH-033`

**Depends on:** Phase 3

**PRD work:** Accept separate component PRDs for role-based access, module
entitlements, approvals, numbering, preferences, and any state or field scope
that is actually required for the first business release.

**Gate:** Static module registration and request-time authorization are proven
for allowed, denied, disabled, revoked, stale-token, cache-miss, and
cache-outage cases.

### Phase 5 — Reference data and parties

**Modules:** `reference-data`, `parties`

**Depends on:** Phase 4

**PRD work:** Accept component PRDs in dependency order, beginning with shared
reference values and companies, then the party types and contact, tax, and
payment-term components required by the first project and accounting slices.

**Gate:** Party records satisfy their accepted component contracts, every
tenant relationship passes composite-integrity tests, and no downstream module
needs to invent a second party owner.

### Phase 6 — Projects

**Modules:** `projects`

**Depends on:** Phase 5

**PRD work:** Accept component PRDs for the smallest usable project lifecycle,
then add units, tasks, templates, memberships, and change control only in the
order required by accepted use cases.

**Gate:** A permitted user can create and operate a project through the real
API and web client; tenant, permission, state, and relationship failures are
covered by negative tests.

### Phase 7 — Cost control

**Modules:** `cost-control`

**Depends on:** Phase 6

**PRD work:** Accept component PRDs for budget, activity, deliverable, cost
line, commitment, and actual-cost behavior needed by the release scope.

**Gate:** Budget-to-actual behavior is traceable to approved project scope and
cannot bypass tenant, approval, or immutable-history rules.

### Phase 8 — Accounting foundation

**Modules:** `accounting`

**Depends on:** Phases 5 and 6; Phase 7 where project-cost posting requires it

**PRD work:** Accept component PRDs for ledgers, chart of accounts, periods,
journals, posting, balances, and reversal before any subledger can post.

**Gate:** Balanced entries post atomically, closed periods reject posting,
corrections preserve history, and idempotent retries cannot duplicate financial
effects.

### Phase 9 — Accounts payable

**Modules:** `accounts-payable`

**Depends on:** Phase 8 and the required `parties` components

**PRD work:** Accept component PRDs for invoice, approval, payment, allocation,
and credit behavior in the order required by the first end-to-end AP scenario.

**Gate:** The AP scenario completes from vendor invoice through accounting
effect and settlement with approval, duplicate, reversal, and tenant-isolation
tests.

### Phase 10 — Accounts receivable

**Modules:** `accounts-receivable`

**Depends on:** Phase 8 and the required `parties` and `projects` components

**PRD work:** Accept component PRDs for billing agreements, invoices, receipts,
allocations, credits, and project billing as release scope requires.

**Gate:** The AR scenario completes from billing source through accounting
effect and receipt allocation with reversal and tenant-isolation tests.

### Phase 11 — Accounting completion

**Modules:** `accounting`

**Depends on:** Phases 9 and 10

**PRD work:** Add only evidenced multi-entity, consolidation, intercompany, and
advanced close components; each receives its own accepted PRD.

**Gate:** Cross-company behavior balances, reconciles, audits, and reverses
without weakening the tenant boundary or creating cross-database atomicity
assumptions.

### Phase 12 — Reporting

**Modules:** `reporting`

**Requirements:** `ARCH-020`, `ARCH-031`, `ARCH-037`

**Depends on:** The source components for each report

**PRD work:** Accept one PRD per reporting component, including freshness,
authorization, drill-through, export, and reconciliation requirements.

**Gate:** Reports reconcile to their authoritative transactions and negative
tests prove that views, exports, refreshes, and background execution preserve
tenant and permission scope.

### Phase 13 — Catalog and matching

**Modules:** `catalog`

**Depends on:** Phase 5; accounting or project integrations only when their
accepted PRDs require them

**PRD work:** Accept component PRDs for catalog, BOM, vendor pricing, matching,
and audit behavior before choosing external providers or automation.

**Gate:** Matching is explainable and auditable, and source records retain a
single owner rather than being duplicated across modules.

### Phase 14 — Operational scale units

**Scope:** Additional cells, dedicated cells, workers, optional Redis, object
storage, and tenant movement.

**Requirements:** `ARCH-010`–`ARCH-012`, `ARCH-029`–`ARCH-031`, `ARCH-034`–
`ARCH-038`

**Depends on:** Measured operational need and the component that creates the
workload

**Gate:** The change has an accepted PRD and ADR where required; recovery,
compatibility, observability, and negative-isolation exercises pass before the
new deployment pattern carries production traffic.

## Phase completion contract

A phase is complete only when:

1. Its component PRDs are accepted and their success criteria pass.
2. Relevant PRD 0000 success criteria continue to pass.
3. Code and documentation conform to `PROJECT-STRUCTURE.md`, the accepted ADRs,
   and every applicable RULES document.
4. Migrations and rollback or recovery procedures are tested against their
   explicit database targets.
5. Automated tests cover the component's positive behavior and required
   negative access paths.
6. Operational evidence, runbooks, and monitoring exist for any new deployment
   unit or background process.

Phases describe dependencies, not fixed release boundaries. A release may
contain part of a phase when the included vertical slice has an accepted PRD
and independently satisfies its gates.
