# 0009 — Product shell and navigation

## Features

- Tenant logo and menu control at top left; user, account, and sign-out controls
  at top right; small NAP branding at the navigation rail's bottom left.
- Responsive two-level navigation and page headings/actions.
- Tenant provisioning through tenants, portal_users, and employees, with
  authorized screens and actions for the complete provisioning workflow.
- Tenant Management for tenants and portal users; Accounting → Directories
  for Employees.
- One vendor login workflow: always choose a tenant, even with one membership;
  a persistent Change tenant action returns to the same selection page.
- A static Dashboard as the initial default landing page, reachable from the
  navigation menu.
- Documented user and tenant settings, default resolution, and deferred storage.

**Design:** Accepted (owner approved 2026-09-10). **Implementation:** Implemented (local acceptance passed; merge/CI pending).

## Authority and approval

Derives from ARCH-001, ARCH-003, ARCH-022, ARCH-023, ARCH-029, ARCH-040,
ARCH-043, ARCH-048, ARCH-050, and ARCH-051 in the
[platform specification](../specs/nap-platform-specification.md).
Its web structure and shared behavior govern layering, responsive navigation,
URL state, theme, lazy loading, and transport boundaries.
[ADR 0010](../ADRs/0010-product-shell-and-vendor-selection.md) records the
accepted change in shell establishment and vendor selection.

[PRD 0003](0003-authentication-and-sessions.md) owns authentication;
[PRD 0004](0004-tenant-membership-and-control-plane.md) owns tenant selection
and controlled access; [PRD 0006](0006-role-based-access-control.md) and
[PRD 0007](0007-module-entitlements.md) own authorization and entitlement.
[PRD 0005](0005-core-identity-records.md) retains employee record ownership.
No permission, table, or workflow is redefined by placing its screen in a menu.

Owner approved this PRD and its linked amendments with the
[implementation plan](../implementation-plans/0009-product-shell-and-navigation.md)
on 2026-09-10. Documentation and implementation are delivered together.
Historical verification evidence does not establish shell verification.

## Requirements

For non-binding layout and interaction preferences, consult the
[UI design guidelines](../guides/ui-design-guidelines.md). They supplement design
discussions without changing this PRD's requirements or implementation status.

### SHELL-001 — Application frame

The header spans the application: menu control and tenant logo at the left,
active tenant context alongside, and a circular profile button showing the
first letter of the signed-in email at the right. Its dropdown starts with
Profile and Settings, currently disabled placeholders for personal information
and personal preferences; editable fields and page behavior remain undecided.
These are followed by Mode
(Light, Dark, System), Change password (`/account/password`), and Logout.
Mode uses the existing device-local theme preference. Where no tenant logo is available, show the tenant name; logo upload and
storage are not introduced by this capability. The rail sits below the header
on the left, with a small NAP wordmark at its bottom. Content occupies the
remaining area. No footer or notification subsystem is included.

Each page supplies its heading and permitted page-level actions. Record actions
remain with the record. Implement accessible navigation, visible
focus, and skip-to-content behavior using the specification's responsive rail,
overlay, theme, and focus-restoration contracts.

The management pages provide a compact Header1 with title, relevant filters,
and feature actions. Tenants and Portal users use MUI X DataGrid with row action
menus and no default bulk selection. Search, status, sorting, pagination, and
selected portal-user membership details follow the shared URL-state contract.
Tenant details show provisioning information and reveal existing action forms
on demand. Creation stays routed and explicitly submitted; portal-user creation
returns to Portal users unless initiated for a specific tenant.
Tenant Management expands in the full Navbar and opens a keyboard-accessible
group flyout in the collapsed rail.

### SHELL-002 — Business navigation

The initial shell must support tenant provisioning through `admin.tenants`,
`admin.portal_users`, and `app.employees`. Tenant Management exposes tenants and
portal users; Accounting → Directories exposes Employees. Dashboard is the
application home and has an explicit top-level Dashboard item in the desktop
navigation rail and mobile navigation menu. Selecting it opens the Dashboard
for the active tenant and marks the item active. These destinations must provide the views and actions needed
for provisioning, including where the current UI does not yet provide them.

The authorized operator can create a pending tenant, create or link its portal
user and initial employee administrator, inspect provisioning status, retry
failed work, and activate the tenant when the existing prerequisites are met.
TEN-006/007 in PRD 0004 own the provisioning workflow and activation gates;
CID-001–004 in PRD 0005 own employee records and access. Memberships, cell
projections, jobs, and role seeding remain supporting parts of that workflow,
not additional standalone table-management requirements.

Expose these operations under their existing server permissions. A tenant
administrator does not thereby gain platform provisioning authority. Record
visibility retains central and tenant access boundaries. Navigation does not
create permissions or provide unrestricted table editing.

Companies, Projects, other directories, and standalone access-administration
integration are outside the initial shell scope. Existing independent screens
do not determine this capability's requirements.

### SHELL-003 — Entry and tenant transitions

The root becomes product entry. Ordinary eligible users enter their established
tenant. Vendors always use the tenant-selection workflow after login, including
vendors with exactly one eligible tenant. Required password change precedes
selection. Zero eligible memberships and platform-only sessions retain the
existing refusal and central-administration behavior owned by PRD 0004.

After selection, open Dashboard unless restoring an authorized deep link for
that selected tenant. Vendor application pages keep a visible active tenant and
Change tenant control in the shared header; it returns to the same selection
page. Switching clears the previous tenant's records and pending responses,
then opens the selected tenant's Dashboard. Reload within an already selected
session does not count as another login.

A bookmarked route cannot silently switch tenants or start controlled access.
A target for a different tenant returns the vendor to selection; continue only
if the server confirms the matching selection. An ineligible target renders an
unavailable state without disclosing other-tenant details. Non-vendor users
retain their single-tenant boundary. Login preserves safe local deep links using
the existing next-target policy. Account and login remain outside the product
frame. Controlled-access identity/reason and the existing exit action remain
visible wherever controlled tenant content is rendered; no nested access or
membership switch bypasses that existing flow.

### SHELL-004 — Dashboard and settings

Dashboard is a static authenticated landing page displaying “Dashboard widgets
are under construction.” It introduces no metrics, queries, customizable layout,
or mock widgets. Full dashboard layout and content are the final planned
roadmap capability. Configurable landing destinations are deferred.

The [user settings register](../settings/user-settings.md) and
[tenant settings register](../settings/tenant-settings.md) own the settings
inventory and defaults. Future shell code reads settings through a small lookup
that returns the documented default when an override is absent; it does not
call a nonexistent endpoint or table. Persistence and management screens are
not part of this shell delivery. Preserve the current theme selector and its
working local preference until tenant-specific persistence is adopted.

### SHELL-005 — Routing, authorization, and recovery

Apply the specification's shared URL-state contract to the implemented page
state, including the active Directories tab. Back, forward,
and reload restore that state. Pages consume the shared normalized scope rather
than independently interpreting tenant or resource input. Do not introduce
company/project selectors, preview drawers, filters, or tabs solely to exercise
future URL features. Route strings are recorded in the approved implementation plan.

Navigation requires a real destination, applicable entitlement, and current
actor permission. API authorization remains authoritative, including scope and
field restrictions. Refusals clear affected content and reevaluate access;
stale client state never retains access. Loading, no access, expired session,
unavailable service, and chunk-load failure have intentional recoverable views.
Respect the existing safe-error disclosure boundary. Keep shell/session context
eager and routed major pages lazy under the specification's conventions.

## Provisioning delivery inventory

Current code supplies provisioning through `/control` and the admin-tenancy
control APIs. PRD 0009 requires the following shell integration; existing route
availability does not limit the required scope.

| Records              | Current contract                                                                                        | Required shell delivery                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `admin.tenants`      | PRD 0004 registry, provisioning status/retry, and activation                                            | Tenant Management: expose tenant creation and provisioning progress through activation                                               |
| `admin.portal_users` | PRDs 0003/0004 portal identity and membership provisioning                                              | Tenant Management: expose creation or linking of the portal user for provisioning, preserving credential and membership rules        |
| `app.employees`      | PRD 0005 employee model, provisioning writes, and bounded identity reads; no standalone Employees route | Accounting → Directories → Employees: expose the provisioned employee and the employee actions required by the provisioning workflow |

Reuse the existing provisioning services and contracts. Supply the missing
presentation and any bounded API support needed to complete this workflow;
do not replace it with generic CRUD. The existing tenant picker, account,
login, and controlled-access banner/exit remain shared utilities.

Evidence: `apps/web/src/routes.ts`, `apps/web/src/pages/ControlPage.tsx`,
`apps/api/src/modules/admin-tenancy/apiRoutes/v1/`, and the Core identity model
and API. Current code is not verification of the future shell.

## Acceptance criteria

| Scenario                                            | Required result                                                                                                                                                                             |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop/mobile and keyboard navigation              | Correct branding, two rail levels, accessible overlay dismissal/focus return, active tab                                                                                                    |
| Ordinary login; vendor with one or multiple tenants | Ordinary tenant established; every vendor chooses; password restrictions run first                                                                                                          |
| Vendor reload and Change tenant                     | Selected-session reload remains in context; Change tenant reuses selection and clears prior content                                                                                         |
| Deep link, back/forward, mismatched tenant          | Safe target retained; implemented URL state restored; no silent switch or cross-tenant data                                                                                                 |
| Platform-only and controlled sessions               | Existing central authority and audit boundaries preserved; controlled banner and exit remain available                                                                                      |
| Entitlement/role/session revocation                 | API refuses; stale navigation/content cannot preserve access                                                                                                                                |
| Tenant provisioning                                 | Authorized operator creates a tenant, creates or links its portal user and initial employee administrator, checks/retries provisioning, and activates only after TEN-006 prerequisites pass |
| Required record exposure                            | Tenants and portal users are accessible through Tenant Management; Employees through Accounting → Directories; unauthorized actors cannot read or mutate them                               |
| Defaults and missing settings                       | Documented defaults used without nonexistent storage calls; existing theme override continues working                                                                                       |
| Dashboard navigation                                | From any page within the shell, the desktop or mobile navigation menu opens the active tenant’s Dashboard; the item is keyboard accessible and shows its active state                       |
| Dashboard and failure states                        | Static text only; intentional loading, empty/denied, service, session, and lazy-load recovery                                                                                               |

The implementation plan records current verification evidence.

## Revisions

| Date       | Change                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-09 | Drafted the owner-discussed shell, navigation, vendor workflow, and deferred settings for review; no application implementation. |

| 2026-09-09 | Corrected initial shell scope to tenant provisioning through tenants, portal_users, and employees; removed unrelated directory integration and redundant draft language. |

| 2026-09-09 | Required an explicit Dashboard item in desktop and mobile navigation, with navigation acceptance coverage. |

| 2026-09-10 | Owner accepted this design and linked amendments with the implementation plan. |

| 2026-09-10 | Implemented SHELL-001–005 with local API, web and browser acceptance; evidence is in the delivery plan, with merge/CI verification pending. |

| 2026-09-10 | Replaced separate header account, sign-out, and theme controls with an initial avatar and profile menu under SHELL-001. |

| 2026-09-10 | Added disabled Profile and Settings menu placeholders; their pages and editable data are deferred. |

| 2026-09-10 | Linked non-authoritative UI design guidelines; accepted behavior and implementation status are unchanged. |

| 2026-09-11 | Applied owner-requested management UI guidelines: focused Header1, MUI X DataGrid, record actions, and Tenant Management collapse/flyout navigation. |
