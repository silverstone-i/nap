# ADR 0016 — Sticky Dialog Headers

**Status:** Accepted
**Date:** 2026-02-26
**Deciders:** NapSoft Engineering

## Context

Form dialogs (Create Tenant, Create User, etc.) can exceed the viewport height on smaller screens or when many fields are present. When this happens the dialog title bar — which contains the Cancel and Submit buttons — scrolls out of view, forcing users to scroll back up to take action.

## Decision

Make `MuiDialogTitle` sticky at the top of its scroll container via a **theme-level override** in `theme.js`. This applies globally to every dialog without per-component changes.

### Implementation

Added to the existing `MuiDialogTitle` styleOverrides:

| Property | Value | Purpose |
|----------|-------|---------|
| `position` | `sticky` | Pins the title within the dialog's scroll container |
| `top` | `0` | Sticks to the top edge |
| `zIndex` | `1` | Layers above scrolling content |
| `backgroundColor` | `theme.palette.background.paper` | Prevents content bleeding through |

The existing `borderBottom` divider provides a clear visual separator between the pinned header and scrolling content.

### Alternatives Considered

1. **Per-component sticky styles** — Would require updating FormDialog, ConfirmDialog, ChangePasswordDialog, ImpersonateDialog, and any inline Dialog usage. Fragile and easy to miss in new dialogs.
2. **Fixed-height DialogContent with `overflow: auto`** — Requires explicit height calculations and breaks the natural dialog sizing. MUI's default scroll behaviour on the Dialog paper is sufficient.
3. **Move buttons to DialogActions (bottom)** — Conflicts with the existing header-inline-buttons pattern used across most dialogs; would require a larger refactor.

## Consequences

- All dialog headers remain visible during scroll with zero per-component work.
- New dialogs automatically inherit the sticky behaviour.
- The `backgroundColor` must match the dialog paper; using `theme.palette.background.paper` ensures this across light and dark modes.
