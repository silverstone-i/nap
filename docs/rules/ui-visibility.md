# Business Rules — UI Visibility

**Domain:** Cross-cutting — Frontend permission-driven rendering
**Last Updated:** 2026-02-21
**Status:** Active — add a rule here whenever a UI element is conditionally shown, hidden, or disabled based on permissions, role, or tenant context
**ADR Reference:** [ADR-0013](../decisions/0013-four-layer-scoped-rbac.md) (supersedes [ADR-0004](../decisions/0004-three-level-rbac.md))

---

## Purpose

UI visibility rules document when and why navigation items, buttons, pages, and form
fields are conditionally rendered or disabled in the frontend. These rules are business
rules — not implementation details — because they define what users are allowed to *see*,
not just what the server will accept.

Every permission-driven UI behavior should have an entry here so that:
- Frontend developers know the intended behavior before touching a component
- Backend developers understand the full surface area of a permission change
- QA can verify both the server enforcement and the UI enforcement independently

---

## Visibility vs. Access

UI visibility is a UX concern — hiding elements the user cannot use reduces confusion.
It is **not** a security control. The server enforces access via middleware on every
request regardless of what the UI renders. Never rely on hidden UI as the sole enforcement
of a permission rule — always pair a UI-VIS rule with its corresponding BR-RBAC rule.

---

## Rule Index

| ID | Element | Condition | Domain Rule |
|---|---|---|---|
| [UI-VIS-001](#ui-vis-001) | "Settings" sidebar nav item | Hidden unless `isNapSoftUser` | BR-RBAC-006 |
| [UI-VIS-002](#ui-vis-002) | TenantPicker dropdown in TenantBar | Shown only for NapSoft users (`isNapSoftUser`) | BR-RBAC-043 |
| [UI-VIS-003](#ui-vis-003) | "Impersonate User..." menu item in TenantBar | Shown only for NapSoft users, hidden during active impersonation | BR-RBAC-044 |
| [UI-VIS-004](#ui-vis-004) | ImpersonationBanner above TenantBar | Shown only during active impersonation session | BR-RBAC-044, BR-RBAC-048 |

---

## Rules

### UI-VIS-001
**Element:** "Settings" sidebar navigation item
**Location:** Sidebar — primary navigation group
**Condition:** Rendered only when `isNapSoftUser` is `true` in `AuthContext`
**How determined:** `isNapSoftUser` is a computed flag in `AuthContext` — checks user's `tenant_code` against `import.meta.env.VITE_NAPSOFT_TENANT`
**When hidden:** All non-NapSoft tenant users — including tenant `admin` roles
**Server enforcement:** `requireNapsoftTenant` middleware on all `/api/tenants/` routes; RBAC middleware requires `tenants::tenants` capability
**Domain rule:** [BR-RBAC-006](./rbac.md#br-rbac-006), [BR-RBAC-045](./rbac.md#br-rbac-045)

---

### UI-VIS-002
**Element:** TenantPicker dropdown in TenantBar
**Location:** TenantBar — left side, replaces the static tenant code chip
**Condition:** Rendered only when `isNapSoftUser` is `true` in `AuthContext` AND no impersonation session is active
**How determined:** `isNapSoftUser` is a computed flag in `AuthContext` — checks user's `tenant_code` against `import.meta.env.VITE_NAPSOFT_TENANT`
**When hidden:** All non-NapSoft users see a static `<Chip>` with their tenant code. During active impersonation, NapSoft users also see the static chip (picker is replaced).
**Behavior:** Fetches the list of active tenants from `GET /tenants/v1/admin/schemas`. Selecting a tenant calls `assumeTenant()` in `AuthContext`, which sets the `x-tenant-code` header on subsequent API requests. Selecting "Exit" resets to the user's home tenant.
**Server enforcement:** `requireNapsoftTenant` middleware on `/admin/schemas`; `authRedis` validates that only NapSoft users may send a cross-tenant `x-tenant-code` header — non-NapSoft users' headers are silently ignored
**Domain rule:** [BR-RBAC-043](./rbac.md#br-rbac-043)

---

### UI-VIS-003
**Element:** "Impersonate User..." menu item in TenantBar user dropdown
**Location:** TenantBar → Avatar dropdown menu, below "Change Password", above "Sign Out"
**Condition:** Rendered only when `isNapSoftUser` is `true` AND `impersonation?.active` is `false`
**How determined:** Both flags come from `AuthContext`. `isNapSoftUser` checks the home tenant; `impersonation.active` is hydrated from the `/auth/me` response.
**When hidden:** All non-NapSoft users never see this menu item. NapSoft users in an active impersonation session also do not see it (they must exit impersonation via the `ImpersonationBanner` first).
**Behavior:** Opens `<ImpersonateDialog>` — a two-step modal: (1) select target tenant via Autocomplete, (2) select target user within that tenant, optionally enter a reason. Submitting calls `POST /tenants/v1/admin/impersonate` and refreshes the auth context.
**Server enforcement:** `requireNapsoftTenant` middleware on `/admin/impersonate`; impersonation state stored in Redis (`imp:{userId}`) and audited in `admin.impersonation_logs`
**Domain rule:** [BR-RBAC-044](./rbac.md#br-rbac-044)

---

### UI-VIS-004
**Element:** ImpersonationBanner above TenantBar
**Location:** Top of `LayoutShell`, rendered above `<TenantBar>`
**Condition:** Rendered only when `impersonation?.active` is `true` in `AuthContext`
**How determined:** The `/auth/me` response includes an `impersonation` object with `{ active: true, impersonated_by }` when an impersonation session is live. `AuthContext` hydrates this on login and after `refreshUser()`.
**When hidden:** Hidden for all users when no impersonation session is active — including NapSoft users who are not currently impersonating anyone.
**Behavior:** Displays an amber/warning banner showing "Impersonating: {email} ({tenant_code})" with an "Exit Impersonation" button. Clicking the button calls `POST /tenants/v1/admin/exit-impersonation`, which clears the Redis key and timestamps the audit log, then refreshes the auth context to restore the original user identity.
**Server enforcement:** Impersonation session uniqueness enforced by partial index on `impersonation_logs (impersonator_id) WHERE ended_at IS NULL`; exit endpoint validates the Redis key exists before clearing
**Domain rule:** [BR-RBAC-044](./rbac.md#br-rbac-044), [BR-RBAC-048](./rbac.md#br-rbac-048)

---

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-02-17 | File created — UI-VIS-001 from BR-RBAC-006 discussion | NapSoft |
| 2026-02-21 | Updated UI-VIS-001 label from "Manage Tenants" to "Settings", added BR-RBAC-045 reference | NapSoft |
| 2026-02-21 | Added UI-VIS-002 (TenantPicker), UI-VIS-003 (Impersonate menu), UI-VIS-004 (ImpersonationBanner) | NapSoft |
