/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import { ApiError } from '../../api/client.js';
import { denialMessage } from '../../auth/capabilities.js';
import { useCapabilities } from '../../auth/useCapabilities.js';
import {
  activateCell,
  disableCell,
  listCellsOverview,
  retryCellProvisioning,
  rolloutReferenceData,
  seedCell,
} from '../../api/endpoints.js';
import { ConfirmDialog } from '../../grid/ConfirmDialog.jsx';
import { createCursorPageAdapter } from '../../grid/cursorPageAdapter.js';
import { StandardDataGrid } from '../../grid/StandardDataGrid.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { RegisterCellDialog } from './RegisterCellDialog.jsx';
import { CellProgressDialog } from './CellProgressDialog.jsx';

/** I0003-R030: how often the list refreshes while any job is active. */
export const REFRESH_MS = 2000;

/** Flattens `GET /control/overview`'s `{cell, operation}` row into one grid row. */
function mapRow({ cell, operation, seedState }) {
  return {
    id: cell.id,
    environment: cell.environment,
    databaseName: cell.database_name,
    enabled: cell.enabled,
    stage: operation?.stage ?? null,
    status: operation?.status ?? null,
    attempts: operation?.attempts ?? null,
    failureCode: operation?.failure_code ?? null,
    seedState,
  };
}

const COLUMNS = [
  {
    field: 'environment',
    headerName: 'Environment',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'essential',
  },
  {
    field: 'databaseName',
    headerName: 'Database',
    flex: 2,
    sortable: false,
    filterable: false,
    priority: 'essential',
  },
  {
    field: 'enabled',
    headerName: 'Enabled',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'essential',
    type: 'boolean',
  },
  {
    field: 'stage',
    headerName: 'Stage',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'essential',
  },
  {
    field: 'status',
    headerName: 'Status',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'essential',
  },
  {
    field: 'attempts',
    headerName: 'Attempts',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'secondary',
    type: 'number',
  },
  {
    // I0007-R013.
    field: 'seedState',
    headerName: 'Reference data',
    flex: 1,
    sortable: false,
    filterable: false,
    priority: 'secondary',
  },
  {
    field: 'failureCode',
    headerName: 'Failure code',
    flex: 2,
    sortable: false,
    filterable: false,
    priority: 'essential',
  },
];

/** `1 cell`, `2 cells`. */
function cells(count) {
  return `${count} ${count === 1 ? 'cell' : 'cells'}`;
}

/** I0007-R011: show the rollout panel only when a cell is not current. */
function hasRolloutWork(seed) {
  return seed.missing + seed.queued + seed.running + seed.failed > 0;
}

function describeActionError(err) {
  if (err instanceof ApiError && err.code === 'INVALID_STATE')
    return 'This cell cannot perform that action right now.';
  if (err instanceof ApiError && err.code === 'FORBIDDEN')
    return denialMessage(err);
  if (err instanceof ApiError && err.code === 'NOT_FOUND')
    return 'This cell no longer exists.';
  return 'Something went wrong. Please try again.';
}

/**
 * `/management/cells` (I0002-R003/R004): browse the cell registry and
 * provisioning state; register, retry, activate, and disable a cell, and
 * view a cell's progress (I0003-R029–R033); roll out reference data
 * (I0007-R011–R015).
 */
export function CellsPage() {
  const [active, setActive] = useState(false);
  const [seed, setSeed] = useState(null);
  const [confirmRollout, setConfirmRollout] = useState(false);
  const [rolloutResult, setRolloutResult] = useState(null);
  // I0003-R030: `anyActive` covers every page, not just the one shown.
  const fetchPage = useMemo(
    () =>
      createCursorPageAdapter(
        async page => {
          const result = await listCellsOverview(page);
          setActive(result.anyActive);
          setSeed(result.referenceSeed);
          return result;
        },
        { mapRow }
      ),
    []
  );
  const [resetKey, setResetKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [progressRow, setProgressRow] = useState(null);
  const [actionError, setActionError] = useState(null);
  const { can, onError } = useCapabilities();
  const canWrite = can('admin-tenancy::control::write', 'napsoft');

  // I0003-R030: refresh while any cell is queued or running, and stop when
  // none is.
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setResetKey(key => key + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, [active]);

  usePageHeader({
    title: 'Cells',
    actions: canWrite ? (
      <Button
        variant="contained"
        size="small"
        onClick={() => setDialogOpen(true)}
      >
        Register cell
      </Button>
    ) : null,
  });

  async function handleRetry(row) {
    setActionError(null);
    try {
      await retryCellProvisioning({ cell: row.id });
      setResetKey(key => key + 1);
    } catch (err) {
      onError(err);
      setActionError(describeActionError(err));
    }
  }

  async function handleDisable(row) {
    setActionError(null);
    try {
      await disableCell({ cell: row.id });
      setResetKey(key => key + 1);
    } catch (err) {
      onError(err);
      setActionError(describeActionError(err));
    }
  }

  async function handleActivate(row) {
    setActionError(null);
    try {
      await activateCell({ cell: row.id });
      setResetKey(key => key + 1);
    } catch (err) {
      onError(err);
      setActionError(describeActionError(err));
    }
  }

  async function handleSeed(row) {
    setActionError(null);
    try {
      await seedCell({ cell: row.id });
      setResetKey(key => key + 1);
    } catch (err) {
      onError(err);
      setActionError(describeActionError(err));
    }
  }

  async function handleRollout() {
    setConfirmRollout(false);
    setActionError(null);
    try {
      setRolloutResult(await rolloutReferenceData());
      setResetKey(key => key + 1);
    } catch (err) {
      onError(err);
      setActionError(describeActionError(err));
    }
  }

  function rowActions(row) {
    const actions = [{ label: 'View progress', onClick: setProgressRow }];
    if (!canWrite) return actions;
    // Retry is only meaningful from a failed operation (M0001-06 §7); the
    // server enforces this regardless, but hiding it otherwise keeps the
    // menu honest. Disable only makes sense while the cell is enabled.
    if (row.status === 'failed')
      actions.push({ label: 'Retry', onClick: handleRetry });
    // I0003-R032: Activate re-enables a disabled cell whose last job
    // completed; the server rejects every other state.
    if (!row.enabled && row.status === 'completed')
      actions.push({ label: 'Activate', onClick: handleActivate });
    // I0007-R013: only a cell missing the declared seed can load it.
    if (row.seedState === 'missing')
      actions.push({ label: 'Load reference data', onClick: handleSeed });
    // I0003-R033: `destructive` routes Disable through the grid's
    // confirmation dialog.
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
      {seed && hasRolloutWork(seed) ? (
        <Alert
          severity={seed.failed ? 'warning' : 'info'}
          sx={{ mb: 2 }}
          action={
            canWrite && seed.missing > 0 ? (
              <Button
                color="inherit"
                size="small"
                onClick={() => setConfirmRollout(true)}
              >
                Roll out reference data
              </Button>
            ) : null
          }
        >
          <AlertTitle>Reference data version {seed.declaredVersion}</AlertTitle>
          {`Current ${seed.current} · Missing ${seed.missing} · Queued ${seed.queued} · Running ${seed.running} · Failed ${seed.failed}`}
        </Alert>
      ) : null}
      {rolloutResult ? (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          onClose={() => setRolloutResult(null)}
        >
          {`Queued ${cells(rolloutResult.queued.length)}; skipped ${rolloutResult.skipped.length}.`}
        </Alert>
      ) : null}
      <ConfirmDialog
        open={confirmRollout}
        title="Roll out reference data"
        description={`Load reference data version ${seed?.declaredVersion} into ${cells(seed?.missing ?? 0)}?`}
        confirmLabel="Roll out"
        onConfirm={handleRollout}
        onCancel={() => setConfirmRollout(false)}
      />
      <StandardDataGrid
        columns={COLUMNS}
        fetchPage={fetchPage}
        resetKey={resetKey}
        rowActions={rowActions}
        emptyMessage="No cells registered yet."
      />
      {progressRow ? (
        <CellProgressDialog
          row={progressRow}
          onClose={() => setProgressRow(null)}
        />
      ) : null}
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
