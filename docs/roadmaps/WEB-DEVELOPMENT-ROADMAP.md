# NAP web application development roadmap

**Status:** Current planning sequence

**Date:** 2026-08-20

**Architecture:** [PRD 0000 — NAP Platform Architecture](../PRDs/0000-nap-platform-architecture.md)

**Structure:** [NAP project structure](../architecture/PROJECT-STRUCTURE.md)

**Rules:** [RULES — Web shell](../RULES/web-shell.md)

**Companion:** [NAP development roadmap](DEVELOPMENT-ROADMAP.md)

## Purpose

This roadmap defines the build order, the mock-to-real data seam, and the
phase gates for `apps/web`. It does not define URL conventions, theme rules,
component ownership, or API contracts. `RULES/web-shell.md` owns the shell
conventions, `PROJECT-STRUCTURE.md` owns folder ownership, ADR 0003 owns the
web toolchain, and component PRDs own screen behavior.

The web client is a client of the API platform (`ARCH-001`) and an
independently buildable release unit (`ARCH-003`). It can therefore be built
ahead of the server, provided every screen reads its data through a seam that
a real API client can replace without touching the screen.

The API phase suggested for each web phase is a **suggestion**. The
[NAP development roadmap](DEVELOPMENT-ROADMAP.md) is authoritative for API,
database, and isolation sequencing and is not modified by this document. If
the two disagree, the API roadmap wins and this document is corrected.

## Delivery principles

- Every screen reads data through a selector exported from
  `apps/web/src/mocks/data.ts`. Pages never import the seed arrays; that rule
  is owned by `RULES/web-shell.md` and this roadmap only sequences it.
- A selector's **signature** is the contract. Going live means replacing the
  selector body with a call into `apps/web/src/api/`, one selector at a time,
  with no change at any call site. Selectors are asynchronous from the first
  phase so the cutover cannot reshape a component.
- Sample data covers at least two entities and, once tenancy exists, two
  tenants, so entity-scoped URLs, the entity switcher, and foreign-scope
  fallbacks are exercisable before real tenant resolution exists.
- The mock seam expresses intent only. It never becomes an authorization or
  routing source; the server resolves identity, tenancy, and access
  (`ARCH-022`, `ARCH-023`).
- A web phase may be built entirely on mocks. It is not complete until its
  suggested API phase has landed and the selectors it owns are cut over,
  unless the phase is marked mock-terminal below.
- Per `PROJECT-STRUCTURE.md`, the first real web feature module requires an
  accepted web-layering ADR. That ADR gates phase W3, the phase that
  introduces `src/api/`.
- The web client is released independently of the API and must remain
  compatible across the supported deployment window (`ARCH-027`); a screen
  never requires an API build newer than the one it can be deployed beside.

## Dependency path

```text
shell frame and mock seam (W0)
    │
    ▼
mock authentication (W1)
    │
    ▼
entity switcher and scope resolution (W2)
    │
    ▼
live API client seam (W3)
    │
    ▼
entitlement-aware navigation (W4)
    │
    ▼
parties and reference data (W5)
    │
    ▼
projects (W6) ──► cost control (W7)
    │
    ▼
accounting foundation (W8)
    ├────────► accounts payable (W9)
    ├────────► accounts receivable (W10)
    └────────► reporting, catalog, operations (W11)
```

## Phases

Web phases are numbered `W0`–`W11` so they never collide with the API phase
numbers they are aligned to.

### W0 — Shell frame, theme tokens, and the mock seam

**Scope:** The application frame, the theme, URL-derived scope, and the
selector-backed data seam, proved by one real screen.

**Folders:** `theme/`, `shell/`, `mocks/`, `pages/`, `components/`

**Depends on:** Nothing in `apps/web` beyond the accepted toolchain

**Suggested API phase:** Phase 1, in parallel — no API dependency

**Mock data:** All five selectors named in `RULES/web-shell.md`
(`getEntity`, `getProjects`, `getProject`, `getInvoices`, `getInboxItems`),
seeded for two entities.

**PRD and ADR work:** None. The shell frame is governed by
`RULES/web-shell.md` and ADR 0003; no component PRD is required because no
business module is introduced.

**Mock-terminal:** Yes. This phase completes without any API.

**Gate:** `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`,
and `npm run format:check` pass from the repository root. The inbox screen
renders from selectors only. A deep link reproduces screen state exactly and
browser back and forward replay it. No color or font literal appears outside
`theme/tokens.ts`, and gold appears only in the wordmark dot and the active
nav indicator.

### W1 — Mock authentication and the route guard

**Scope:** `/login`, `auth/RequireAuth`, and the `?next=` redirect boundary
against a mock in-memory identity.

**Folders:** `auth/`, `pages/`

**Depends on:** W0

**Suggested API phase:** Phases 1–2 — build against mocks while API Phase 2
is in design

**Mock data:** A mock session with a small set of identities and memberships.

**PRD and ADR work:** The authentication and session component PRD from API
Phase 2 must be accepted before any real session semantics are implemented;
the mock guard is a placeholder for the redirect boundary only.

**Mock-terminal:** Yes, for the redirect boundary. Session semantics are not
final until W3.

**Gate:** An unauthenticated deep link round-trips through `/login` back to
its original target. The redirect target survives a page reload because it
lives in the URL. No screen state outside the two documented localStorage
preferences is unreconstructable from the URL.

### W2 — Entity switcher and scope resolution

**Scope:** Complete implementation of the scope rules — the entity segment
guard, the switcher, persisted default entity, and foreign-scope handling.

**Folders:** `shell/`

**Depends on:** W1

**Suggested API phase:** Phase 2 — the phase whose gate is a user expressing
a tenant choice without selecting a cell or database

**Mock data:** Two entities with distinct projects and invoices so a foreign
`?project=` is genuinely foreign.

**PRD and ADR work:** Awaits the tenant registry and membership component PRD
from API Phase 2 before the switcher lists anything but mock memberships.

**Gate:** Every scope rule in `RULES/web-shell.md` is covered by a test:
unknown entity ids and `/` redirect to the default entity's inbox; switching
rewrites the segment, keeps the module path, and drops `?project=` and
`?invoice=`; a `?project=` foreign to the entity reads as unset;
`shell/useScope.ts` is the only reader of scope state.

### W3 — Live API client seam and the first cutover

**Scope:** `apps/web/src/api/` transport and response adaptation, loading and
error states, real session handling, and the first selectors backed by the
real API.

**Folders:** `api/`, `auth/`, `shell/`

**Depends on:** W2

**Suggested API phase:** Phase 3 — whose gate is the first complete vertical
slice through login, tenant selection, cell resolution, and a tenant-scoped
read

**Mock data:** `getEntity` and `getInboxItems` move to the API; the remaining
selectors stay mocked and unchanged.

**PRD and ADR work:** **A web-layering ADR must be accepted before
implementation**, as required by `PROJECT-STRUCTURE.md`. The cell registry
and tenant provisioning component PRDs from API Phases 2 and 3 must be
accepted.

**Gate:** One screen runs end to end against the real API, including
cross-tenant denial rendered as a deliberate state. The client addresses the
platform through a stable address and never names a cell or database
(`ARCH-007`, `ARCH-022`). Every remaining selector still compiles and still
serves its screen from mocks.

### W4 — Entitlement- and permission-aware navigation

**Scope:** Rail entries, routes, and actions appear only for entitled modules
and permitted operations, with deliberate states for every denial path.

**Folders:** `shell/`, `auth/`, `components/`

**Depends on:** W3

**Suggested API phase:** Phase 4

**Mock data:** None new; entitlement comes from the API.

**PRD and ADR work:** Awaits the role-based access and module-entitlement
component PRDs from API Phase 4.

**Gate:** Allowed, denied, disabled, revoked, stale-token, and cache-outage
cases each render an intentional state rather than a blank screen or a stale
menu. The client never widens access from a cached or token-carried value
(`ARCH-023`). The rail holds at most two levels.

### W5 — Parties and reference data screens

**Scope:** Company, party, contact, tax, and payment-term screens required by
the first project and accounting slices.

**Folders:** `pages/`, `components/`

**Depends on:** W4

**Suggested API phase:** Phase 5

**Mock data:** `getEntity` gains real backing for company data; party
selectors are introduced already API-backed rather than as new mocks.

**PRD and ADR work:** Awaits the reference-data and party component PRDs.

**Gate:** Every screen matches its accepted component PRD's acceptance
criteria. Lists preview in a right-side drawer keyed by a search param;
record editing is a routed page, never a drawer or a modal.

### W6 — Projects workspace

**Scope:** The smallest usable project lifecycle through the real API —
list, detail with tabs, and creation.

**Folders:** `pages/`, `components/`

**Depends on:** W5

**Suggested API phase:** Phase 6 — whose gate explicitly requires a permitted
user to operate a project through the real API and web client

**Mock data:** `getProjects` and `getProject` are cut over; the project seed
arrays are removed.

**PRD and ADR work:** Awaits the project lifecycle component PRDs.

**Gate:** A permitted user creates and operates a project end to end.
Tenant, permission, state, and relationship failures each render a tested,
intentional state.

### W7 — Cost control views

**Scope:** Budget, activity, deliverable, cost line, commitment, and
actual-cost views in the order the release scope requires.

**Folders:** `pages/`, `components/`

**Depends on:** W6

**Suggested API phase:** Phase 7

**PRD and ADR work:** Awaits the cost-control component PRDs.

**Gate:** Budget-to-actual figures displayed on screen reconcile to the API's
authoritative values; the client performs no independent financial arithmetic
that could disagree with the server.

### W8 — Accounting foundation screens

**Scope:** Chart of accounts, periods, journals, and posting review.

**Folders:** `pages/`, `components/`

**Depends on:** W6

**Suggested API phase:** Phase 8

**PRD and ADR work:** Awaits the ledger, period, journal, and posting
component PRDs.

**Gate:** Posting, closed-period rejection, and correction flows each surface
the server's outcome without the client inferring one. Retried submissions
cannot present a duplicated financial effect (`ARCH-032`).

### W9 — Accounts payable

**Scope:** Vendor invoice entry, approval, payment, and allocation screens.

**Folders:** `pages/`, `components/`

**Depends on:** W8

**Suggested API phase:** Phase 9

**Mock data:** `getInvoices` is cut over; the invoice seed arrays are removed
and the mock module is reduced to whatever still has no API.

**PRD and ADR work:** Awaits the AP component PRDs.

**Gate:** The first end-to-end AP scenario completes through the web client.
The invoice drawer's final-total rule is the only gold in the screen.

### W10 — Accounts receivable

**Scope:** Billing agreement, customer invoice, receipt, and allocation
screens.

**Folders:** `pages/`, `components/`

**Depends on:** W8

**Suggested API phase:** Phase 10

**PRD and ADR work:** Awaits the AR component PRDs.

**Gate:** The first end-to-end AR scenario completes through the web client,
including reversal.

### W11 — Reporting, catalog, and operational surfaces

**Scope:** Report views with drill-through and export, catalog and matching
screens, and any operator surface an accepted PRD requires.

**Folders:** `pages/`, `components/`

**Depends on:** The web phase that owns each report's source screens

**Suggested API phase:** Phases 12–14

**Mock data:** None. By this phase `mocks/` exists only if a screen has no
accepted API contract yet.

**PRD and ADR work:** Awaits the reporting, catalog, and any operational
component PRDs. A new deployment surface additionally requires its ADR.

**Gate:** Reported figures reconcile to their authoritative transactions;
views, exports, and refreshes preserve tenant and permission scope
(`ARCH-037`). Matching results are explainable on screen.

## API phase alignment

| Web phase | Title                                    | Suggested API phase |
| --------- | ---------------------------------------- | ------------------- |
| W0        | Shell frame, theme tokens, mock seam     | 1 (parallel)        |
| W1        | Mock authentication and route guard      | 1–2                 |
| W2        | Entity switcher and scope resolution     | 2                   |
| W3        | Live API client seam and first cutover   | 3                   |
| W4        | Entitlement-aware navigation             | 4                   |
| W5        | Parties and reference data screens       | 5                   |
| W6        | Projects workspace                       | 6                   |
| W7        | Cost control views                       | 7                   |
| W8        | Accounting foundation screens            | 8                   |
| W9        | Accounts payable                         | 9                   |
| W10       | Accounts receivable                      | 10                  |
| W11       | Reporting, catalog, operational surfaces | 12–14               |

These alignments are suggestions for scheduling, not gates owned by this
document. The [NAP development roadmap](DEVELOPMENT-ROADMAP.md) is unchanged
by this roadmap and remains authoritative for API sequencing.

A web phase may begin on mock data before its suggested API phase begins;
that is the reason the mock seam exists. A web phase may not _complete_
before the component PRDs it names are accepted.

## Phase completion contract

A web phase is complete only when:

1. Every component PRD the phase names is accepted and its acceptance
   criteria pass through the web client.
2. The phase conforms to `RULES/web-shell.md`, `PROJECT-STRUCTURE.md`, and
   every applicable ADR, including the web-layering ADR once W3 requires it.
3. `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and
   `npm run format:check` pass from the repository root.
4. Every selector the phase owns is either cut over to `apps/web/src/api/` or
   explicitly recorded here as still mocked, with the phase that will replace
   it.
5. Screen state is reconstructable from the URL, except the two persisted
   preferences `RULES/web-shell.md` documents.
6. Denial, failure, and empty paths are covered by tests, not only the
   successful path.

Phases describe dependencies, not fixed release boundaries. A release may
contain part of a web phase when the included screens have accepted component
PRDs and independently satisfy their gates.
