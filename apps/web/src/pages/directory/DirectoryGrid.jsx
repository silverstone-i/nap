/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import ArchiveIcon from '@mui/icons-material/Archive';
import EditIcon from '@mui/icons-material/Edit';
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash';
import { ApiError } from '../../api/client.js';
import {
  archiveDirectoryRecord,
  bulkDirectoryAction,
  getDirectoryRecord,
  listDirectoryPage,
  restoreDirectoryRecord,
} from '../../api/endpoints.js';
import { ConfirmDialog } from '../../grid/ConfirmDialog.jsx';
import { createCursorPageAdapter } from '../../grid/cursorPageAdapter.js';
import { StandardDataGrid } from '../../grid/StandardDataGrid.jsx';
import { PortalAccessChip } from './PortalAccess.jsx';
import { RecordFormDialog } from './RecordFormDialog.jsx';
import { describeDirectoryError, PORTAL_MESSAGES } from './directoryErrors.js';
import { recordName } from './directoryRecords.js';

/** R028: what Archive tells the user before it runs. */
export const ARCHIVE_TEXT =
  'Archived records are hidden from lists until restored.';

/**
 * A contact value followed by its label, such as `a@b.com (Work)`.
 * @param {string|null} value
 * @param {string|null|undefined} label
 * @returns {string}
 */
function withLabel(value, label) {
  if (!value) return '—';
  return label ? `${value} (${label})` : value;
}

/**
 * The grid's columns for a collection.
 * @param {string} collection
 * @param {(row: object) => void} onOpen
 * @returns {object[]}
 */
function columnsFor(collection, onOpen) {
  const plain = { sortable: false, filterable: false };
  const columns = [
    {
      ...plain,
      field: 'name',
      headerName: 'Name',
      flex: 2,
      priority: 'essential',
      valueGetter: (_value, row) => recordName(row),
      renderCell: ({ row }) => (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Button variant="text" size="small" onClick={() => onOpen(row)}>
            {recordName(row)}
          </Button>
          {row.archived ? <Chip size="small" label="Archived" /> : null}
        </Stack>
      ),
    },
    {
      ...plain,
      field: 'primaryEmail',
      headerName: 'Email',
      flex: 2,
      priority: 'essential',
      valueGetter: (_value, row) =>
        withLabel(row.primaryEmail, row.primaryEmailLabel),
    },
    {
      ...plain,
      field: 'primaryPhone',
      headerName: 'Phone',
      flex: 1,
      priority: 'secondary',
      valueGetter: (_value, row) =>
        withLabel(row.primaryPhone, row.primaryPhoneLabel),
    },
    {
      ...plain,
      field: 'taxIdLast4',
      headerName: 'Tax ID',
      flex: 1,
      priority: 'secondary',
      valueGetter: value => (value ? `•••••${value}` : '—'),
    },
  ];
  if (collection === 'organization-contacts')
    columns.push({
      ...plain,
      field: 'flags',
      headerName: 'Role',
      flex: 2,
      priority: 'secondary',
      valueGetter: (_value, row) =>
        [
          row.isPrimaryContact ? 'Primary contact' : null,
          row.isBillingContact ? 'Billing contact' : null,
          row.isPrimaryTaxContact ? 'Primary tax contact' : null,
        ]
          .filter(Boolean)
          .join(' · ') || '—',
    });
  if (collection !== 'organizations')
    columns.push({
      ...plain,
      field: 'portalAccess',
      headerName: 'Portal access',
      flex: 1,
      priority: 'secondary',
      renderCell: ({ value }) =>
        value ? <PortalAccessChip portalAccess={value} /> : null,
    });
  return columns;
}

/**
 * A directory list as a standard grid (M0005-R027–R030): server pages, a row
 * menu with Edit and Archive or Restore, and Archive selected or Restore
 * selected for the current page. A bulk request is all or nothing; when it
 * fails, the grid lists each record that failed and why, and keeps the
 * selection so the user can change it and try again.
 * @param {{
 *   collection: 'people'|'organizations'|'organization-contacts',
 *   filters: object,
 *   ariaLabel: string,
 *   emptyMessage: string,
 *   abilities: {write: boolean, writeTaxIds: boolean, assignRoles?: boolean, onError?: (err: unknown) => void},
 *   onOpen: (row: object) => void,
 *   onChanged?: () => void,
 *   refreshKey?: unknown,
 *   extraActions?: (row: object, run: (action: () => Promise<unknown>) => void) => object[],
 * }} props
 * @returns {JSX.Element}
 */
export function DirectoryGrid({
  collection,
  filters,
  ariaLabel,
  emptyMessage,
  abilities,
  onOpen,
  onChanged,
  refreshKey,
  extraActions,
}) {
  const [tick, setTick] = useState(0);
  const [selectedRows, setSelectedRows] = useState([]);
  const [confirming, setConfirming] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [editing, setEditing] = useState(null);

  // Keyed by value, so a caller passing a fresh but equal filter object
  // keeps the adapter and its cached page cursors.
  const filterKey = JSON.stringify(filters);
  const fetchPage = useMemo(
    () =>
      createCursorPageAdapter(page =>
        listDirectoryPage(collection, { ...page, ...JSON.parse(filterKey) })
      ),
    [collection, filterKey]
  );
  const resetKey = `${filterKey}:${String(refreshKey)}:${tick}`;

  const changed = () => {
    setTick(value => value + 1);
    onChanged?.();
  };

  /** Run one action, then refresh the page or report the failure. */
  async function run(action, messages = {}) {
    setActionError(null);
    try {
      await action();
      changed();
    } catch (err) {
      abilities.onError?.(err);
      setActionError(describeDirectoryError(err, messages));
    }
  }

  async function runBulk(action) {
    setActionError(null);
    const rows = selectedRows;
    try {
      await bulkDirectoryAction(
        collection,
        action,
        rows.map(row => ({ id: row.id, revision: row.revision }))
      );
      changed();
    } catch (err) {
      abilities.onError?.(err);
      if (err instanceof ApiError && err.code === 'BULK_FAILED' && err.details)
        setActionError(
          <>
            Nothing was changed. These records could not be{' '}
            {action === 'archive' ? 'archived' : 'restored'}:
            <ul style={{ margin: 0 }}>
              {err.details.map(item => {
                const row = rows.find(r => r.id === item.id);
                return (
                  <li key={item.id}>
                    {row ? recordName(row) : item.id}:{' '}
                    {describeDirectoryError(
                      new ApiError(item.code, 409),
                      action === 'archive' ? PORTAL_MESSAGES.archive : {}
                    )}
                  </li>
                );
              })}
            </ul>
          </>
        );
      else setActionError(describeDirectoryError(err));
    }
  }

  async function edit(row) {
    setActionError(null);
    try {
      setEditing(await getDirectoryRecord(collection, row.id));
    } catch (err) {
      abilities.onError?.(err);
      setActionError(describeDirectoryError(err));
    }
  }

  function rowActions(row) {
    if (!abilities.write) return [];
    const actions = row.archived
      ? [
          {
            label: 'Restore',
            icon: <RestoreFromTrashIcon fontSize="small" />,
            onClick: target =>
              run(() =>
                restoreDirectoryRecord(collection, target.id, target.revision)
              ),
          },
        ]
      : [
          {
            label: 'Edit',
            icon: <EditIcon fontSize="small" />,
            onClick: edit,
          },
          ...(extraActions?.(row, run) ?? []),
          {
            label: 'Archive',
            icon: <ArchiveIcon fontSize="small" />,
            destructive: true,
            confirmDescription: ARCHIVE_TEXT,
            onClick: target =>
              run(
                () =>
                  archiveDirectoryRecord(
                    collection,
                    target.id,
                    target.revision
                  ),
                PORTAL_MESSAGES.archive
              ),
          },
        ];
    return actions;
  }

  const count = selectedRows.length;
  const allActive = count > 0 && selectedRows.every(row => !row.archived);
  const allArchived = count > 0 && selectedRows.every(row => row.archived);

  return (
    <Stack spacing={1.5}>
      {abilities.write && (allActive || allArchived) ? (
        <Stack direction="row" spacing={1}>
          {allActive ? (
            <Button
              variant="outlined"
              size="small"
              color="warning"
              onClick={() => setConfirming('archive')}
            >
              Archive selected ({count})
            </Button>
          ) : null}
          {allArchived ? (
            <Button
              variant="outlined"
              size="small"
              onClick={() => setConfirming('restore')}
            >
              Restore selected ({count})
            </Button>
          ) : null}
        </Stack>
      ) : null}
      {actionError ? (
        <Alert severity="error" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      ) : null}
      <StandardDataGrid
        columns={columnsFor(collection, onOpen)}
        fetchPage={fetchPage}
        resetKey={resetKey}
        rowActions={rowActions}
        onSelectionChange={(_ids, rows) => setSelectedRows(rows)}
        ariaLabel={ariaLabel}
        emptyMessage={emptyMessage}
        describeError={err => describeDirectoryError(err)}
      />
      {confirming ? (
        <ConfirmDialog
          open
          title={
            confirming === 'archive' ? 'Archive selected' : 'Restore selected'
          }
          description={`${count} record${count === 1 ? '' : 's'} will be ${
            confirming === 'archive' ? 'archived' : 'restored'
          }.${confirming === 'archive' ? ` ${ARCHIVE_TEXT}` : ''}`}
          confirmLabel={confirming === 'archive' ? 'Archive' : 'Restore'}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            const action = confirming;
            setConfirming(null);
            void runBulk(action);
          }}
        />
      ) : null}
      {editing ? (
        <RecordFormDialog
          collection={collection}
          record={editing}
          canWriteTaxIds={abilities.writeTaxIds}
          canManagePortal={abilities.write && Boolean(abilities.assignRoles)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            changed();
          }}
        />
      ) : null}
    </Stack>
  );
}
