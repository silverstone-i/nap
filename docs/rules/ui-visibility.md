# Business Rules — UI Visibility

**Domain:** Cross-cutting — Frontend permission-driven rendering
**Last Updated:** 2025-02-17
**Status:** Active — add a rule here whenever a UI element is conditionally shown, hidden, or disabled based on permissions, role, or tenant context
**ADR Reference:** ADR-0004 (Three-level RBAC over boolean permissions)

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
| [UI-VIS-001](#ui-vis-001) | "Manage Tenants" sidebar nav item | Hidden unless `isNapsoftEmployee()` | BR-RBAC-006 |

---

## Rules

### UI-VIS-001
**Element:** "Manage Tenants" sidebar navigation item
**Location:** Sidebar — primary navigation group
**Condition:** Rendered only when `isNapsoftEmployee()` returns `true` for the current user
**How determined:** `isNapsoftEmployee()` checks `tenant_code`, company name, or email domain against env vars (`NAPSOFT_TENANT`, `VITE_NAPSOFT_COMPANY`, `VITE_NAPSOFT_EMAIL_DOMAIN`) via `AuthContext`
**When hidden:** All non-NapSoft tenant users — including tenant `admin` roles
**Server enforcement:** `requireNapsoftTenant` middleware on all `/api/tenants/` routes
**Domain rule:** [BR-RBAC-006](./rbac.md#br-rbac-006)

---

## Changelog

| Date | Change | Author |
|---|---|---|
| 2025-02-17 | File created — UI-VIS-001 from BR-RBAC-006 discussion | NapSoft |
