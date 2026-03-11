/**
 * @file DataTable — standardised DataGrid wrapper with selection, row actions, and toolbar
 * @module nap-client/components/shared/DataTable
 *
 * Wraps MUI X DataGrid v6 with:
 *   - Integrated selection (useListSelection) — Click / Ctrl+Click / Shift+Click
 *   - Per-row kebab (⋮) actions column (RowActionsMenu)
 *   - Selection-count toolbar (ListToolbar) via DataGrid slots.toolbar
 *   - Default archived-row className and pagination
 *
 * Bulk actions (Archive / Restore) live in the page-level ModuleBar — this
 * component only handles row-level actions and selection feedback.
 *
 * No sx props — all styling via theme overrides and className.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { useMemo } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import RowActionsMenu from './RowActionsMenu.jsx';
import ListToolbar from './ListToolbar.jsx';

/**
 * @param {Object}   props
 * @param {Array}    props.rows                - data rows (each must have `id`)
 * @param {Array}    props.columns             - DataGrid column definitions
 * @param {boolean}  [props.loading]
 * @param {Object}   props.selection           - return value from useListSelection
 * @param {Function} [props.onView]            - (row) => void; adds View to row actions
 * @param {Function} [props.onEdit]            - (row) => void; adds Edit to row actions
 * @param {Array|Function} [props.rowActions] - static [{ label, icon?, onClick(row) }] or (row) => actions[]
 * @param {Array}    [props.extraToolbarActions] - extra ListToolbar actions
 * @param {Function} [props.getRowClassName]   - custom className builder (merged with archived default)
 * @param {Object}   [props.dataGridProps]     - pass-through props for DataGrid
 */
export default function DataTable({
  rows,
  columns,
  loading,
  selection,
  onView,
  onEdit,
  rowActions = [],
  extraToolbarActions,
  getRowClassName,
  dataGridProps = {},
}) {
  // Base actions (static across all rows)
  const baseActions = useMemo(() => {
    const actions = [];
    if (onView) actions.push({ label: 'View', icon: <VisibilityOutlinedIcon fontSize="small" />, onClick: onView });
    if (onEdit) actions.push({ label: 'Edit', icon: <EditOutlinedIcon fontSize="small" />, onClick: onEdit });
    return actions;
  }, [onView, onEdit]);

  const isRowActionsFn = typeof rowActions === 'function';
  const hasAnyActions = baseActions.length > 0 || (isRowActionsFn || rowActions.length > 0);

  // Append actions column
  const mergedColumns = useMemo(() => {
    if (!hasAnyActions) return columns;

    const actionsCol = {
      field: '__actions',
      headerName: '',
      width: 48,
      sortable: false,
      filterable: false,
      disableColumnMenu: true,
      disableReorder: true,
      cellClassName: 'row-actions-cell',
      renderCell: (params) => {
        const extra = isRowActionsFn ? rowActions(params.row) : rowActions;
        const actions = [...baseActions, ...extra];
        return <RowActionsMenu row={params.row} actions={actions} />;
      },
    };

    return [...columns, actionsCol];
  }, [columns, baseActions, rowActions, isRowActionsFn, hasAnyActions]);

  // Merge archived className with custom
  const mergedGetRowClassName = useMemo(() => {
    return (params) => {
      const archived = params.row.deactivated_at ? 'row-archived' : '';
      const custom = getRowClassName ? getRowClassName(params) : '';
      return [archived, custom].filter(Boolean).join(' ');
    };
  }, [getRowClassName]);

  // Toolbar slot props — selection count + clear + optional extras
  const toolbarSlotProps = useMemo(() => ({
    selectedCount: selection.selectedRows.length,
    extraActions: extraToolbarActions,
    onClear: selection.clearSelection,
  }), [
    selection.selectedRows.length,
    selection.clearSelection,
    extraToolbarActions,
  ]);

  return (
    <DataGrid
      rows={rows}
      columns={mergedColumns}
      getRowId={(r) => r.id}
      loading={loading}
      checkboxSelection
      disableRowSelectionOnClick
      rowSelectionModel={selection.selectionModel}
      onRowSelectionModelChange={selection.handleSelectionModelChange}
      onRowClick={selection.handleRowClick}
      pageSizeOptions={[25, 50, 100]}
      initialState={{ pagination: { paginationModel: { pageSize: 25 } } }}
      getRowClassName={mergedGetRowClassName}
      slots={{ toolbar: ListToolbar }}
      slotProps={{ toolbar: toolbarSlotProps }}
      {...dataGridProps}
    />
  );
}
