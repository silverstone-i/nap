/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableRow from '@mui/material/TableRow';
import { ConfirmDialog } from '../../grid/ConfirmDialog.jsx';

/**
 * A Napsoft record's detail (I0001-R038): its values as label and value
 * rows, anything else below them, and the actions that apply as buttons
 * before Close. An action marked `destructive` asks first with its
 * `confirmTitle` and `confirmDescription`, as a grid row action does
 * (I0001-R039). Tenants, Cells, and Portal Users share it (I0006-R020,
 * I0003-R044, I0002-R018).
 * @param {{
 *   id: string,
 *   title: string,
 *   rows: Array<[string, import('react').ReactNode]>,
 *   actions?: Array<{label: string, onClick: () => void, color?: string, destructive?: boolean, confirmTitle?: string, confirmDescription?: string}>,
 *   children?: import('react').ReactNode,
 *   onClose: () => void,
 * }} props `id` names the title element for `aria-labelledby`.
 * @returns {JSX.Element}
 */
export function DetailDialog({
  id,
  title,
  rows,
  actions = [],
  children,
  onClose,
}) {
  const [confirming, setConfirming] = useState(null);
  return (
    <>
      <Dialog
        open
        onClose={onClose}
        aria-labelledby={id}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle id={id}>{title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Table size="small">
              <TableBody>
                {rows.map(([label, value]) => (
                  <TableRow key={label}>
                    <TableCell component="th" scope="row">
                      {label}
                    </TableCell>
                    <TableCell sx={{ wordBreak: 'break-all' }}>
                      {value ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {children}
          </Stack>
        </DialogContent>
        <DialogActions>
          {actions.map(action => (
            <Button
              key={action.label}
              color={action.color}
              onClick={() =>
                action.destructive ? setConfirming(action) : action.onClick()
              }
            >
              {action.label}
            </Button>
          ))}
          <Button variant="contained" onClick={onClose}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
      {confirming ? (
        <ConfirmDialog
          open
          title={confirming.confirmTitle ?? `${confirming.label}?`}
          description={confirming.confirmDescription}
          confirmLabel={confirming.label}
          onConfirm={() => {
            setConfirming(null);
            confirming.onClick();
          }}
          onCancel={() => setConfirming(null)}
        />
      ) : null}
    </>
  );
}
