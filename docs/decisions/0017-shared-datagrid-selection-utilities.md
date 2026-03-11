# ADR 0017 — Shared DataGrid Selection & Archive/Restore Utilities

**Status:** Accepted
**Date:** 2026-02-28
**Deciders:** NapSoft Engineering

## Context

All 22 DataGrid CRUD pages share an identical pattern: selection state management, derived booleans (`isSingle`, `hasSelection`, `allActive`, `allArchived`), archive/restore confirm dialogs, bulk action toolbar buttons, and plural toast messages. Before extraction, each page duplicated ~40-60 lines of boilerplate for this logic — over 1,000 lines total.

MUI X DataGrid v6 natively supports multi-select (shift+click range, cmd/ctrl+click toggle) when `disableMultipleRowSelection` is not set. Enabling multi-select across all pages required consistent derived state and bulk operation handlers.

## Decision

Extract three composable utilities that eliminate per-page duplication while keeping page-specific customisation possible:

### 1. `selectionUtils.js` — Pure functions

| Export | Purpose |
|--------|---------|
| `deriveSelectionState(selectionModel, rows, entityType?)` | Returns `{ selectedRows, selected, isSingle, hasSelection, hasRootSelected, allActive, allArchived }` |
| `buildMutualExclusionHandler(opts)` | Returns an `onRowSelectionModelChange` handler that enforces root-entity mutual exclusion (tenant/user pages only) |
| `buildBulkActions(opts)` | Returns `[{ label, variant, color, disabled, onClick }]` for Archive/Restore toolbar buttons with count labels and correct disabled states |
| `isRootEntity(row, entityType)` | Checks if a row is the root tenant (NAP) entity |

### 2. `useDataGridSelection(rows, entityType?)` — State hook

Encapsulates `useState([])` for `selectionModel` plus `deriveSelectionState()`. When `entityType` is passed, `onSelectionChange` automatically uses `buildMutualExclusionHandler` for root-entity protection.

### 3. `useArchiveRestore(opts)` — Handler hook

Encapsulates archive/restore dialog open state, async handlers (loop over `selectedRows`, plural toasts, selection clearing), and ready-to-spread `ConfirmDialog` props. `restoreMut` is optional for archive-only pages (Budget, Cost Tracking). Custom `getLabel` function personalises single-record confirm messages.

### Usage pattern

```jsx
// Selection
const { selectionModel, setSelectionModel, onSelectionChange,
        selectedRows, selected, isSingle, hasSelection, allActive, allArchived } =
  useDataGridSelection(rows);

// Archive/Restore
const { setArchiveOpen, setRestoreOpen, archiveConfirmProps, restoreConfirmProps } =
  useArchiveRestore({
    selectedRows, archiveMut, restoreMut,
    entityName: 'vendor', setSelectionModel, toast, errMsg,
    getLabel: (r) => r.name,
  });

// Toolbar (inside useMemo)
primaryActions: [
  { label: 'Create', ... },
  { label: 'Edit', disabled: !isSingle, ... },
  ...buildBulkActions({ selectedRows, hasSelection, allActive, allArchived,
    onArchive: () => setArchiveOpen(true),
    onRestore: () => setRestoreOpen(true) }),
],

// DataGrid
<DataGrid onRowSelectionModelChange={onSelectionChange} ... />

// Dialogs
<ConfirmDialog {...archiveConfirmProps} />
{restoreConfirmProps && <ConfirmDialog {...restoreConfirmProps} />}
```

### Critical: `useMemo` dependency stability

The toolbar `useMemo` dependency array **must** use `selectedRows.length` (primitive), NOT `selectedRows` (array reference). Since `deriveSelectionState` creates a new array every render, using the array reference causes infinite re-renders through the `ModuleActionsContext` registration cycle:

```
new selectedRows ref → useMemo recomputes toolbar → useModuleToolbarRegistration
detects new config → register() → setActions() → provider re-render → repeat
```

### Alternatives Considered

1. **Single monolithic hook** — Would combine selection, archive/restore, and toolbar into one hook. Rejected because pages have varying needs (archive-only, custom handlers, sub-grids) and a monolithic hook forces unused state/handlers.
2. **HOC / render-props wrapper** — Higher-order component wrapping each page. Rejected as overly complex for what is straightforward state composition.
3. **Keep duplication** — Each page manages its own selection state. Rejected due to maintenance burden and inconsistency risk across 22 pages.

## Consequences

- ~1,000 lines of duplicated boilerplate removed across 22 pages.
- New DataGrid pages get multi-select, bulk archive/restore, and toolbar integration by composing three imports.
- Pages requiring custom behaviour (ManageTenantsPage cascade warnings, ManageUsersPage self-archive prevention) use `useDataGridSelection` + `buildBulkActions` but keep their own archive/restore handlers.
- The `selectedRows.length` dependency pattern must be followed in all toolbar `useMemo` arrays — failure causes infinite render loops.

### Evolution: DataTable + useListSelection (current standard)

All list pages have since migrated to a `DataTable` component paired with a `useListSelection` hook. The original utilities (`selectionUtils.js`, `useDataGridSelection`, `useArchiveRestore`) remain available but `useListSelection` + `DataTable` is the standard for new pages:

```jsx
const selection = useListSelection(rows);
<DataTable rows={rows} columns={columns} selection={selection} ... />
```

`DataTable` integrates checkbox selection, row click handling (Ctrl/Shift support), archived-row styling, and per-row kebab actions. `useListSelection` encapsulates selection state and exposes `{ selectionModel, selectedRows, allActive, allArchived, clearSelection }`. Pages continue to compose `useArchiveRestore` for archive/restore dialogs.
