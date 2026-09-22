/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import { ApiError } from '../../api/client.js';
import {
  disableCell,
  listCellsOverview,
  retryCellProvisioning,
} from '../../api/endpoints.js';
import { createCursorPageAdapter } from '../../grid/cursorPageAdapter.js';
import { StandardDataGrid } from '../../grid/StandardDataGrid.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { RegisterCellDialog } from './RegisterCellDialog.jsx';

/** Flattens `GET /control/overview`'s `{cell, operation}` row into one grid row. */
function mapRow({ cell, operation }) {
  return {
    id: cell.id,
    environment: cell.environment,
    databaseName: cell.database_name,
    enabled: cell.enabled,
    stage: operation?.stage ?? null,
    status: operation?.status ?? null,
    attempts: operation?.attempts ?? null,
  };
}

const COLUMNS = [
  {
    field: 'environment',
    headerName: 'Environment',
    flex: 1,
    sortable: false,
    priority: 'essential',
  },
  {
    field: 'databaseName',
    headerName: 'Database',
    flex: 2,
    sortable: false,
    priority: 'essential',
  },
  {
    field: 'enabled',
    headerName: 'Enabled',
    flex: 1,
    sortable: false,
    priority: 'essential',
    type: 'boolean',
  },
  { field: 'stage', headerName: 'Stage', flex: 1, sortable: false, priority: 'essential' },
  {
    field: 'status',
    headerName: 'Status',
    flex: 1,
    sortable: false,
    priority: 'essential',
  },
  {
    field: 'attempts',
    headerName: 'Attempts',
    flex: 1,
    sortable: false,
    priority: 'secondary',
    type: 'number',
  },
];

function describeActionError(err) {
  if (err instanceof ApiError && err.code === 'INVALID_STATE')
    return 'This cell cannot perform that action right now.';
  if (err instanceof ApiError && err.code === 'FORBIDDEN')
    return 'You are not authorized to perform that action.';
  if (err instanceof ApiError && err.code === 'NOT_FOUND')
    return 'This cell no longer exists.';
  return 'Something went wrong. Please try again.';
}

/**
 * `/management/cells` (F0002-R003/R004): browse the cell registry and
 * provisioning state; register, retry, and disable a cell.
 */
export function CellsPage() {
  const fetchPage = useMemo(
    () => createCursorPageAdapter(listCellsOverview, { mapRow }),
    []
  );
  const [resetKey, setResetKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionError, setActionError] = useState(null);

  usePageHeader({
    title: 'Cells',
    actions: (
      <Button
        variant="contained"
        size="small"
        onClick={() => setDialogOpen(true)}
      >
        Register cell
      </Button>
    ),
  });

  async function handleRetry(row) {
    setActionError(null);
    try {
      await retryCellProvisioning({ cell: row.id });
      setResetKey(key => key + 1);
    } catch (err) {
      setActionError(describeActionError(err));
    }
  }

  async function handleDisable(row) {
    setActionError(null);
    try {
      await disableCell({ cell: row.id });
      setResetKey(key => key + 1);
    } catch (err) {
      setActionError(describeActionError(err));
    }
  }

  function rowActions(row) {
    const actions = [];
    // Retry is only meaningful from a failed operation (M0001-06 §7); the
    // server enforces this regardless, but hiding it otherwise keeps the
    // menu honest. Disable only makes sense while the cell is enabled.
    if (row.status === 'failed')
      actions.push({ label: 'Retry', onClick: handleRetry });
    if (row.enabled)
      actions.push({
        label: 'Disable',
        destructive: true,
        onClick: handleDisable,
      });
    return actions;
  }

  return (
    <>
      {actionError ? (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          onClose={() => setActionError(null)}
        >
          {actionError}
        </Alert>
      ) : null}
      <StandardDataGrid
        columns={COLUMNS}
        fetchPage={fetchPage}
        resetKey={resetKey}
        rowActions={rowActions}
        emptyMessage="No cells registered yet."
      />
      {dialogOpen ? (
        <RegisterCellDialog
          onClose={() => setDialogOpen(false)}
          onRegistered={() => {
            setDialogOpen(false);
            setResetKey(key => key + 1);
          }}
        />
      ) : null}
    </>
  );
}
