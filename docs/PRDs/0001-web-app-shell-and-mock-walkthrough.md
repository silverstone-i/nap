# PRD 0001 — Web app shell and mock walkthrough

- **Status:** Approved
- **Date:** 2026-08-01
- **Related:** [ADR-0003](../ADRs/0003-web-toolchain-vite-and-bundler-mode-typescript.md), [RULES/web-shell.md](../RULES/web-shell.md), [branding/BRAND.md](../branding/BRAND.md)

## Problem

NAP has no client. Before any real module ships, the shell and its
interaction idioms — how scope is chosen, how lists are browsed, how records
are opened — must exist and be demonstrable, so that every future module
lands into an established layout instead of inventing its own. Building the
shell against mock data lets the interface be evaluated and corrected while
changes are still cheap.

## Users and scenarios

- **Project manager** starts their day in the Inbox, triaging approvals and
  tasks, and jumps from an inbox item straight to the record it references.
- **Controller** reviews AP invoices across projects for one entity,
  filtering by project and previewing an invoice without leaving the list.
- **Any user** at a multi-entity contractor switches the active entity and
  every screen — inbox, projects, invoices — rescopes to that entity's data.

## Scope

This release will deliver, in `apps/web`, mock-data-driven and read-only:

- **App shell** — top bar (wordmark, entity switcher, project switcher,
  inert search placeholder, user menu) and a collapsible left nav rail with
  at most two levels of navigation.
- **Inbox** — the landing view: an approvals/tasks queue for the active
  entity, each item deep-linking to the record it references.
- **Projects** — a data-grid list; row click opens a dedicated detail page
  with tabs (Overview, Line items, Documents, Activity).
- **AP Invoices** — a data-grid list filterable by project; row click opens
  a right-side preview drawer with line items and total.
- **URL as scope** — entity is a path segment (`/:entityId/:module`);
  project filter, open drawer, and active tab are search params
  (`?project=`, `?invoice=`, `?tab=`). Deep links and back/forward replay
  any screen state.
- **Mock data module** — typed seed data for three entities of differing
  size, accessed only through selector functions whose signatures are the
  seam a future API client replaces.

## Out of scope

Real API wiring, authentication, working command palette / search, Change
Orders, AR, GL, saved grid views, editing of any record, and mobile
layout. (Dark mode was originally out of scope here but was pulled into
the shell — see [RULES/web-shell.md](../RULES/web-shell.md).) The third seed entity is deliberately sparse so near-empty
states are visible, but designed empty-state components are also out of
scope.

## UX requirements

- Grid → drawer for glance, page for work: lists preview in a drawer;
  records that carry deep work get a routed, tabbed page.
- The Inbox is a first-class destination and the default landing view.
- Navigation depth never exceeds two levels in the rail.
- Full [BRAND.md](../branding/BRAND.md) compliance: Inter/JetBrains Mono,
  the light-mode token set, and gold discipline — gold appears only as the
  wordmark dot, the single active-nav indicator, and the final-total rule.

## Success criteria

- `/` redirects to the default entity's inbox; fonts and favicons load.
- Switching entity rewrites the URL segment and visibly rescopes the
  Inbox, Projects, and Invoices screens; the sparse entity shows near-empty
  grids. The project switcher filters invoices via `?project=`.
- Projects row click opens the tabbed detail page (`?tab=` in the URL);
  invoices row click opens the preview drawer (`?invoice=`); inbox items
  deep-link to their referenced records.
- The rail collapses to icons; no screen shows more than three gold
  elements; unknown entity ids redirect to the default entity; browser
  back/forward replays drawer and tab state.
- Root `lint`, `format:check`, `typecheck`, `test`, and `build` all pass
  with the web workspace included.
