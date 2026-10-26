/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import BlockIcon from '@mui/icons-material/Block';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RefreshIcon from '@mui/icons-material/Refresh';
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
import { useNotice } from '../../shell/NoticeContext.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { RegisterCellDialog } from './RegisterCellDialog.jsx';
import { CellDetailDialog } from './CellDetailDialog.jsx';

/** I0003-R033: what Disable says before it runs. */
const DISABLE_TEXT = 'The cell stops serving until you activate it again.';

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

/**
 * The grid's columns (I0003-R044). Selecting a cell's database name opens
 * its detail, which holds the job and reference data.
 * @param {(row: object) => void} onOpen
 * @returns {object[]}
 */
function columnsFor(onOpen) {
  const plain = { sortable: false, filterable: false };
  return [
    {
      ...plain,
      field: 'environment',
      headerName: 'Environment',
      flex: 1,
      priority: 'essential',
    },
    {
      ...plain,
      field: 'databaseName',
      headerName: 'Database',
      flex: 2,
      priority: 'essential',
      renderCell: ({ row }) => (
        <Button variant="text" size="small" onClick={() => onOpen(row)}>
          {row.databaseName}
        </Button>
      ),
    },
    {
      ...plain,
      field: 'enabled',
      headerName: 'Enabled',
      flex: 1,
      priority: 'essential',
      type: 'boolean',
    },
    {
      ...plain,
      field: 'status',
      headerName: 'Status',
      flex: 1,
      priority: 'essential',
    },
  ];
}

/** `1 cell`, `2 cells`. */
function cells(count) {
  return `${count} ${count === 1 ? 'cell' : 'cells'}`;
}

/** I0007-R011: show the rollout panel only when a cell is not current. */
function hasRolloutWork(seed) {
  return seed.missing + seed.queued + seed.running + seed.failed > 0;
}

/** I0007-R021: the panel names only the counts above zero. */
function rolloutCounts(seed) {
  return [
    ['Current', seed.current],
    ['Missing', seed.missing],
    ['Queued', seed.queued],
    ['Running', seed.running],
    ['Failed', seed.failed],
  ]
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label} ${count}`)
    .join(' · ');
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
 * provisioning state; add, retry, activate, and disable a cell from its row
 * or its detail (I0003-R029–R033, R044–R046); roll out reference data from
 * the header (I0007-R011–R015, R021, R022).
 */
export function CellsPage() {
  const [active, setActive] = useState(false);
  const [seed, setSeed] = useState(null);
  const [confirmRollout, setConfirmRollout] = useState(false);
  const notify = useNotice();
  // The rows of the page last fetched, so an open detail follows the
  // refresh (I0001-R038) instead of showing the row as it was when opened.
  const [pageRows, setPageRows] = useState([]);
  const fetchPage = useMemo(() => {
    const adapter = createCursorPageAdapter(
      async page => {
        const result = await listCellsOverview(page);
        setActive(result.anyActive);
        setSeed(result.referenceSeed);
        return result;
      },
      { mapRow }
    );
    return async params => {
      const page = await adapter(params);
      setPageRows(page.rows);
      return page;
    };
  }, []);
  const [resetKey, setResetKey] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  // The open record as of the latest refresh.
  const current =
    selected && (pageRows.find(row => row.id === selected.id) ?? selected);
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
    actions: [
      // I0007-R021: the rollout is a header action.
      canWrite &&
        seed?.missing > 0 && {
          label: 'Roll out reference data',
          onClick: () => setConfirmRollout(true),
        },
      // I0003-R045
      canWrite && {
        label: 'New cell',
        create: true,
        onClick: () => setDialogOpen(true),
      },
    ],
  });

  /**
   * Run one cell action, then report it as a notice (I0003-R046) and
   * refresh, or report the failure.
   */
  async function run(action, row, done) {
    setActionError(null);
    try {
      await action({ cell: row.id });
      notify(`${row.databaseName} ${done}.`);
      setSelected(null);
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
      const result = await rolloutReferenceData();
      // I0007-R022
      notify(
        `Queued ${cells(result.queued.length)}.${
          result.skipped.length ? ` Skipped ${result.skipped.length}.` : ''
        }`
      );
      setResetKey(key => key + 1);
    } catch (err) {
      onError(err);
      setActionError(describeActionError(err));
    }
  }

  /**
   * The actions that apply to a cell, for its row menu and its detail
   * (I0003-R044).
   * @param {object} row
   * @returns {object[]}
   */
  function actionsFor(row) {
    if (!canWrite) return [];
    const actions = [];
    // Retry is only meaningful from a failed operation (M0001-06 §7); the
    // server enforces this regardless, but hiding it otherwise keeps the
    // menu honest. Disable only makes sense while the cell is enabled.
    if (row.status === 'failed')
      actions.push({
        label: 'Retry',
        icon: <RefreshIcon fontSize="small" />,
        onClick: target => run(retryCellProvisioning, target, 'retry queued'),
      });
    // I0003-R032: Activate re-enables a disabled cell whose last job
    // completed; the server rejects every other state.
    if (!row.enabled && row.status === 'completed')
      actions.push({
        label: 'Activate',
        icon: <PlayArrowIcon fontSize="small" />,
        onClick: target => run(activateCell, target, 'activation queued'),
      });
    // I0007-R013: only a cell missing the declared seed can load it.
    if (row.seedState === 'missing')
      actions.push({
        label: 'Load reference data',
        icon: <CloudDownloadIcon fontSize="small" />,
        onClick: target => run(seedCell, target, 'reference data queued'),
      });
    // I0003-R033: Disable asks first. It is reversible, so it says so.
    if (row.enabled)
      actions.push({
        label: 'Disable',
        icon: <BlockIcon fontSize="small" />,
        destructive: true,
        confirmTitle: 'Disable cell?',
        confirmDescription: DISABLE_TEXT,
        onClick: target => run(disableCell, target, 'disabled'),
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
        <Alert severity={seed.failed ? 'warning' : 'info'} sx={{ mb: 2 }}>
          <AlertTitle>Reference data version {seed.declaredVersion}</AlertTitle>
          {rolloutCounts(seed)}
        </Alert>
      ) : null}
      <ConfirmDialog
        open={confirmRollout}
        title="Roll out reference data?"
        description={`Version ${seed?.declaredVersion} loads into ${cells(seed?.missing ?? 0)}.`}
        confirmLabel="Roll out"
        onConfirm={handleRollout}
        onCancel={() => setConfirmRollout(false)}
      />
      <StandardDataGrid
        columns={columnsFor(setSelected)}
        fetchPage={fetchPage}
        resetKey={resetKey}
        rowActions={actionsFor}
        selectable={false}
        emptyMessage="No cells registered yet."
      />
      {current ? (
        <CellDetailDialog
          row={current}
          actions={actionsFor(current).map(action => ({
            ...action,
            onClick: () => action.onClick(current),
          }))}
          onClose={() => setSelected(null)}
        />
      ) : null}
      {dialogOpen ? (
        <RegisterCellDialog
          onClose={() => setDialogOpen(false)}
          onRegistered={() => {
            setDialogOpen(false);
            notify('Cell registered.');
            setResetKey(key => key + 1);
          }}
        />
      ) : null}
    </>
  );
}
