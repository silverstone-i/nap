/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useMemo, useState } from 'react';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { DataGrid, GridActionsCellItem } from '@mui/x-data-grid';
import { ConfirmDialog } from './ConfirmDialog.jsx';
import {
  GRID_PAGE_SIZE_OPTIONS,
  readGridPageSize,
  writeGridPageSize,
} from './gridPreferences.js';

const EMPTY_SELECTION = { type: 'include', ids: new Set() };

/**
 * Shared behavior for ordinary data grids (I0001-R015–R017): server-side
 * pagination with one browser-local page-size preference shared across
 * every grid instance, a leading checkbox column whose selection clears on
 * page/sort/filter/tenant change, and a trailing row-action menu that
 * routes a destructive action through a confirmation dialog.
 *
 * There is no real server-paginated list to back this component within
 * I0001's own scope (entity administration screens are excluded); it is
 * infrastructure for the inter-module workflow PRDs that add those screens, exercised
 * here by its own test's mock `fetchPage`.
 * @param {{
 *   columns: Array<import('@mui/x-data-grid').GridColDef & {priority?: 'essential'|'secondary'}>,
 *   fetchPage: (params: {page: number, pageSize: number, sortModel: object[], filterModel: object}) => Promise<{rows: object[], rowCount: number}>,
 *   getRowId?: (row: object) => string|number,
 *   resetKey?: unknown,
 *   rowActions?: (row: object) => Array<{label: string, icon?: import('react').ReactNode, onClick: (row: object) => void, destructive?: boolean}>,
 *   emptyMessage?: string,
 * }} props
 * @returns {JSX.Element}
 */
export function StandardDataGrid({
  columns,
  fetchPage,
  getRowId,
  resetKey,
  rowActions,
  emptyMessage = 'No rows to show.',
}) {
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));

  const [paginationModel, setPaginationModel] = useState(() => ({
    page: 0,
    pageSize: readGridPageSize(),
  }));
  const [sortModel, setSortModel] = useState([]);
  const [filterModel, setFilterModel] = useState({ items: [] });
  const [rowSelectionModel, setRowSelectionModel] = useState(EMPTY_SELECTION);
  const [rows, setRows] = useState([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [retryTick, setRetryTick] = useState(0);

  // Reset to page 0 whenever the tenant context (resetKey) changes.
  // Adjusted directly during render — React's "adjusting state when a prop
  // changes" pattern — rather than in an effect, since this is derived UI
  // state, not a synchronization with an external system.
  const [pageResetKey, setPageResetKey] = useState(resetKey);
  if (pageResetKey !== resetKey) {
    setPageResetKey(resetKey);
    if (paginationModel.page !== 0)
      setPaginationModel(prev => ({ ...prev, page: 0 }));
  }

  // I0001-R016: page, filter, sort, or tenant context change all clear
  // selection — it applies only to the current grid page. Same
  // render-time-adjustment pattern as above.
  const requestSignature = JSON.stringify([
    paginationModel.page,
    paginationModel.pageSize,
    sortModel,
    filterModel,
    resetKey,
    retryTick,
  ]);
  const [committedSignature, setCommittedSignature] = useState(null);
  if (committedSignature !== requestSignature) {
    setCommittedSignature(requestSignature);
    setRowSelectionModel(EMPTY_SELECTION);
    setLoading(true);
    setError(null);
  }

  // The fetch itself is the one legitimate use of an effect here — it
  // synchronizes with an external system (the server page). Its body sets
  // no state synchronously; every update happens in the async continuation.
  useEffect(() => {
    let cancelled = false;
    fetchPage({
      page: paginationModel.page,
      pageSize: paginationModel.pageSize,
      sortModel,
      filterModel,
    }).then(
      result => {
        if (cancelled) return;
        setRows(result.rows);
        setRowCount(result.rowCount);
        setLoading(false);
      },
      () => {
        if (cancelled) return;
        setError('Could not load data.');
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestSignature]);

  const handlePaginationModelChange = next => {
    if (next.pageSize !== paginationModel.pageSize)
      writeGridPageSize(next.pageSize);
    setPaginationModel(next);
  };

  const columnVisibilityModel = useMemo(() => {
    if (!isPhone) return {};
    const model = {};
    for (const column of columns)
      if (column.priority === 'secondary') model[column.field] = false;
    return model;
  }, [isPhone, columns]);

  const gridColumns = useMemo(() => {
    if (!rowActions) return columns;
    return [
      ...columns,
      {
        field: '__rowActions',
        type: 'actions',
        headerName: '',
        width: 56,
        getActions: params =>
          rowActions(params.row).map((action, index) => (
            <GridActionsCellItem
              key={index}
              icon={action.icon ?? <MoreVertIcon fontSize="small" />}
              label={action.label}
              showInMenu
              onClick={() =>
                action.destructive
                  ? setConfirmAction({ row: params.row, action })
                  : action.onClick(params.row)
              }
            />
          )),
      },
    ];
  }, [columns, rowActions]);

  return (
    <Box>
      {error ? (
        <Alert
          severity="error"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => setRetryTick(tick => tick + 1)}
            >
              Retry
            </Button>
          }
          sx={{ mb: 2 }}
        >
          {error}
        </Alert>
      ) : null}
      <DataGrid
        autoHeight
        rows={rows}
        columns={gridColumns}
        getRowId={getRowId}
        loading={loading}
        rowCount={rowCount}
        paginationMode="server"
        sortingMode="server"
        filterMode="server"
        paginationModel={paginationModel}
        onPaginationModelChange={handlePaginationModelChange}
        pageSizeOptions={GRID_PAGE_SIZE_OPTIONS}
        sortModel={sortModel}
        onSortModelChange={setSortModel}
        filterModel={filterModel}
        onFilterModelChange={setFilterModel}
        checkboxSelection
        checkboxSelectionVisibleOnly
        rowSelectionModel={rowSelectionModel}
        onRowSelectionModelChange={setRowSelectionModel}
        columnVisibilityModel={columnVisibilityModel}
        localeText={{ noRowsLabel: emptyMessage }}
      />
      {confirmAction ? (
        <ConfirmDialog
          open
          title={confirmAction.action.label}
          description="This action cannot be undone."
          confirmLabel={confirmAction.action.label}
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => {
            confirmAction.action.onClick(confirmAction.row);
            setConfirmAction(null);
          }}
        />
      ) : null}
    </Box>
  );
}
