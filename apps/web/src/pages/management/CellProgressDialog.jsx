/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';

/**
 * The next thing an operator can do for a cell, from its job and enabled
 * state (I0003-R031).
 * @param {{enabled: boolean, status: string|null, failureCode: string|null}} row
 * @returns {string}
 */
function nextAction(row) {
  if (row.status === 'queued' || row.status === 'running')
    return 'Wait. Provisioning is in progress.';
  if (row.status === 'failed')
    return 'Fix the cause of the failure, then choose Retry.';
  if (row.status === 'completed' && row.failureCode === 'ROOT_SETUP_FAILED')
    return 'Wait. Root tenant setup is retried automatically.';
  if (row.status === 'completed' && !row.enabled) return 'Choose Activate.';
  if (row.status === 'completed') return 'None. The cell is serving.';
  return 'None.';
}

/**
 * I0003-R031: a cell's provisioning progress and the next action.
 * @param {{row: object, onClose: () => void}} props
 */
export function CellProgressDialog({ row, onClose }) {
  const details = [
    ['Cell ID', row.id],
    ['Stage', row.stage ?? '—'],
    ['Status', row.status ?? '—'],
    ['Attempts', row.attempts ?? '—'],
    ['Failure code', row.failureCode ?? '—'],
    ['Next action', nextAction(row)],
  ];
  return (
    <Dialog
      open
      onClose={onClose}
      aria-labelledby="cell-progress-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id="cell-progress-title">Provisioning progress</DialogTitle>
      <DialogContent>
        <Table size="small">
          <TableBody>
            {details.map(([label, value]) => (
              <TableRow key={label}>
                <TableCell component="th" scope="row">
                  {label}
                </TableCell>
                <TableCell sx={{ wordBreak: 'break-all' }}>{value}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
