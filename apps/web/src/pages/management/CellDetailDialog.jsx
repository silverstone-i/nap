/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { DetailDialog } from './DetailDialog.jsx';

/**
 * The next thing an operator can do for a cell, from its job and enabled
 * state (I0003-R031).
 * @param {{enabled: boolean, status: string|null, failureCode: string|null, seedState?: string}} row
 * @returns {string}
 */
function nextAction(row) {
  if (row.status === 'queued' || row.status === 'running')
    return 'Wait. Provisioning is in progress.';
  if (row.status === 'failed')
    return 'Fix the cause of the failure, then choose Retry.';
  if (row.status === 'completed' && row.failureCode === 'NAPSOFT_SETUP_FAILED')
    return 'Wait. Napsoft tenant setup is retried automatically.';
  if (row.status === 'completed' && !row.enabled) return 'Choose Activate.';
  if (row.seedState === 'missing') return 'Choose Load reference data.';
  if (row.status === 'completed') return 'None. The cell is serving.';
  return 'None.';
}

/**
 * A cell's detail (I0003-R044), in place of View progress: its job, its
 * reference data (I0007-R013), the next action, and the actions that apply.
 * @param {{row: object, actions: Array<{label: string, onClick: () => void, color?: string}>, onClose: () => void}} props
 * @returns {JSX.Element}
 */
export function CellDetailDialog({ row, actions, onClose }) {
  return (
    <DetailDialog
      id="cell-detail-title"
      title={row.databaseName}
      rows={[
        ['Cell ID', row.id],
        ['Environment', row.environment],
        ['Enabled', row.enabled ? 'Yes' : 'No'],
        ['Stage', row.stage],
        ['Status', row.status],
        ['Attempts', row.attempts],
        ['Failure code', row.failureCode],
        ['Reference data', row.seedState],
        ['Next action', nextAction(row)],
      ]}
      actions={actions}
      onClose={onClose}
    />
  );
}
