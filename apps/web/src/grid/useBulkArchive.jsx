/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import { ApiError } from '../api/client.js';
import { useNotice } from '../shell/NoticeContext.jsx';
import { ConfirmDialog } from './ConfirmDialog.jsx';

/** Each action's button verb and past tense, unless a screen names its own. */
const VERBS = {
  archive: ['Archive', 'archived'],
  restore: ['Restore', 'restored'],
};

/**
 * What a bulk item's `INVALID_STATE` means where the only state rule is the
 * one R030 adds: the row was already in the requested state.
 */
export const ALREADY_IN_STATE = {
  archive: 'It is already archived.',
  restore: 'It is not archived.',
};

/**
 * Archive selected and Restore selected for the rows chosen on a standard
 * grid's current page (I0001-R028, R032; M0005-R029–R030 and the label and
 * role bulk routes). The list's view decides which one is offered: Archive
 * selected in the Active view, Restore selected in the Archived view
 * (I0011-R005), since a view holds only one kind of row. Each asks
 * for one confirmation naming the count. A bulk request is all or nothing:
 * on `BULK_FAILED` a dialog names each failed row and why, and the
 * selection is kept so the user can change it and try again.
 *
 * Wire `onSelectionChange` to the grid, place `actions` in the header (or a
 * dialog's toolbar, I0001-R034), and render `dialogs`.
 * @param {{
 *   canWrite: boolean,
 *   noun: [string, string],
 *   nameOf: (row: object) => string,
 *   run: (action: 'archive'|'restore', items: Array<{id: string, revision: number}>) => Promise<unknown>,
 *   describeError: (err: unknown) => string,
 *   describeItem: (code: string, action: 'archive'|'restore') => string,
 *   archiveText?: string,
 *   onDone: () => void,
 *   onError?: (err: unknown) => void,
 *   archived: boolean,
 *   verbs?: {archive?: [string, string], restore?: [string, string]},
 * }} options `noun` is the singular and plural, such as `['label', 'labels']`.
 *   `archived` is the list's view: `true` in the Archived view. `verbs` renames an action, such
 *   as Portal Users' `{ archive: ['Deactivate', 'deactivated'] }`
 *   (I0002-R014). `items` carry `revision` only where rows have one.
 * @returns {{
 *   onSelectionChange: (ids: Array<string|number>, rows: object[]) => void,
 *   actions: import('../shell/orderActions.js').ScreenAction[],
 *   dialogs: JSX.Element,
 * }}
 */
export function useBulkArchive({
  canWrite,
  noun,
  nameOf,
  run,
  describeError,
  describeItem,
  archiveText,
  onDone,
  onError,
  archived,
  verbs,
}) {
  const notify = useNotice();
  const verb = { ...VERBS, ...verbs };
  const past = action => verb[action][1];
  const [selectedRows, setSelectedRows] = useState([]);
  const [confirming, setConfirming] = useState(null);
  const [failure, setFailure] = useState(null);

  const count = selectedRows.length;
  const counted = n => `${n} ${n === 1 ? noun[0] : noun[1]}`;

  async function submit(action) {
    const rows = selectedRows;
    try {
      await run(
        action,
        rows.map(row => ({ id: row.id, revision: row.revision }))
      );
      notify(`${counted(rows.length)} ${past(action)}.`);
      onDone();
    } catch (err) {
      onError?.(err);
      setFailure({ action, rows, err });
    }
  }

  const actions =
    canWrite && count > 0
      ? [
          !archived && {
            label: `${verb.archive[0]} selected (${count})`,
            color: 'warning',
            onClick: () => setConfirming('archive'),
          },
          archived && {
            label: `${verb.restore[0]} selected (${count})`,
            onClick: () => setConfirming('restore'),
          },
        ].filter(Boolean)
      : [];

  const details =
    failure?.err instanceof ApiError &&
    failure.err.code === 'BULK_FAILED' &&
    failure.err.details
      ? failure.err.details
      : null;

  const dialogs = (
    <>
      {confirming ? (
        <ConfirmDialog
          open
          title={`${verb[confirming][0]} selected`}
          description={`${counted(count)} will be ${past(confirming)}.${
            confirming === 'archive' && archiveText ? ` ${archiveText}` : ''
          }`}
          confirmLabel={verb[confirming][0]}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const action = confirming;
            setConfirming(null);
            void submit(action);
          }}
        />
      ) : null}
      {failure ? (
        <Dialog
          open
          onClose={() => setFailure(null)}
          aria-labelledby="bulk-failure-title"
        >
          <DialogTitle id="bulk-failure-title">Nothing was changed</DialogTitle>
          <DialogContent>
            {details ? (
              <>
                <DialogContentText>
                  These {noun[1]} could not be {past(failure.action)}:
                </DialogContentText>
                <ul>
                  {details.map(item => {
                    const row = failure.rows.find(r => r.id === item.id);
                    return (
                      <li key={item.id}>
                        {row ? nameOf(row) : item.id}:{' '}
                        {describeItem(item.code, failure.action)}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <DialogContentText>
                {describeError(failure.err)}
              </DialogContentText>
            )}
          </DialogContent>
          <DialogActions>
            <Button
              variant="contained"
              onClick={() => setFailure(null)}
              autoFocus
            >
              Close
            </Button>
          </DialogActions>
        </Dialog>
      ) : null}
    </>
  );

  return {
    onSelectionChange: (_ids, rows) => setSelectedRows(rows),
    actions,
    dialogs,
  };
}
