# Product shell and navigation implementation

Owner approved PRD 0009 and its linked amendments on 2026-09-10.
Implementation: Implemented; local acceptance passed. No merge or CI verification claimed.

## Features

- Responsive header, two-level navigation, breadcrumbs and accessible menu.
- Explicit static Dashboard and session-aware product entry.
- Tenant and portal-user provisioning screens and bounded Employees view.
- Vendor selection after every login, safe deep links and tenant transitions.
- Recoverable access/failure states and existing theme/default settings.

## Delivery order

1. Accept the specification amendments, ADR 0010, PRD 0009 and related registers.
2. Extend checked session/navigation and control-overview contracts using existing permissions.
3. Establish the shared shell and normalized tenant URL reader, then integrate login, account and selection.
4. Deliver provisioning pages and Employees using the existing commands and profile endpoint.
5. Verify SHELL-001–005 and reconcile the capability documentation with local evidence.

## Routes and boundaries

- `/` establishes product entry; `/app/:tenantId/dashboard` is tenant home.
- `/app/:tenantId/accounting/directories?tab=employees` exposes bounded employee identity.
- `/management/tenants` and `/management/portal-users` are central management destinations.
- Login, account and tenant selection remain standalone. Existing operator utilities remain available.
- URL tenant identifiers are intent, never authorization or an implicit switch.
- Employee access retains CID-004; provisioning retains TEN-006/007. No generic employee CRUD, settings persistence, logo storage, migration or new dependency is planned.
- Documentation and implementation ship together. Deferred-code issue requirements do not apply to this combined delivery.
- Preserve existing uncommitted work. No commit, push or PR is authorized.

## Verification

Local evidence, 2026-09-10:

- Full repository suite passed: 28 toolchain, 288 API, 50 web and 13 shared tests.
  Two additional web regressions subsequently passed with the complete web suite
  (52 web tests): password-change/selection deep-link restoration and expired-session clearing.
- The final control-plane suite (19 tests) also passed after adding the
  unavailable-vendor-assignment/central-administration regression. Total coverage
  across suites is 382 tests.
- API coverage includes sole-vendor selection on every login, selected reload,
  safe overview relationships, existing/new identities, failed-job retry,
  activation, controlled access, negative tenant isolation and multi-cell routing.
- Browser acceptance against disposable PostgreSQL: created a tenant, provisioned
  its portal identity and employee, confirmed activation, entered/exited explicit
  controlled employee access, and navigated to Dashboard. A sole vendor selected
  its tenant, reloaded in context and returned through Change tenant.
- Desktop and 390px mobile checks covered two-level navigation, active destination,
  overlay dismissal, Escape/focus restoration, persistent controlled banner,
  Employees breadcrumbs/tab, and light/dark themes. Browser console had no errors.
- Lint, typecheck, production build and production license checks passed.
  Final formatting and `git diff --check` passed.

The initial development-browser transition was interrupted by Vite's first-use
optimization reload; after dependency optimization the actual controlled
transition passed, and a dedicated route regression test also passed.

No migration, dependency, commit, push or pull request was introduced. The
existing bounded overview retains its 200-record cap. General employee CRUD,
settings persistence, logo storage and dashboard widgets remain deferred.

Acceptance behavior remains owned by PRD 0009 SHELL-001–005. Merge and CI evidence
must be reconciled during a separately authorized shipping task before Verified.
