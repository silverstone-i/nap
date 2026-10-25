/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useMemo, useState } from 'react';
import { formatPhone } from '@nap/shared';
import { useEffectiveSettings } from '../../shell/EffectiveSettingsContext.jsx';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import ArchiveIcon from '@mui/icons-material/Archive';
import EditIcon from '@mui/icons-material/Edit';
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash';
import {
  archiveDirectoryRecord,
  getDirectoryRecord,
  listDirectoryPage,
  restoreDirectoryRecord,
} from '../../api/endpoints.js';
import { createCursorPageAdapter } from '../../grid/cursorPageAdapter.js';
import { StandardDataGrid } from '../../grid/StandardDataGrid.jsx';
import { PortalAccessChip } from './PortalAccess.jsx';
import { RecordFormDialog } from './RecordFormDialog.jsx';
import { describeDirectoryError, PORTAL_MESSAGES } from './directoryErrors.js';
import { recordName } from './directoryRecords.js';
import { displayTaxId, useTaxIdFormats } from './useTaxIdFormats.js';

/** R028, I0011-R007: what Archive tells the user before it runs. */
export const ARCHIVE_TEXT = 'Archived records move to the Archived tab.';

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
 * @param {object[]|null} formats The tenant's tax ID formats (M0005-R040).
 * @param {string} country The tenant's default country, for phones (M0005-R046).
 * @returns {object[]}
 */
function columnsFor(collection, onOpen, formats, country) {
  const plain = { sortable: false, filterable: false };
  const columns = [
    {
      ...plain,
      field: 'name',
      headerName: 'Name',
      flex: 2,
      priority: 'essential',
      valueGetter: (_value, row) => recordName(row),
      // I0011-R004: the view says whether a row is archived, so no tag.
      renderCell: ({ row }) => (
        <Button variant="text" size="small" onClick={() => onOpen(row)}>
          {recordName(row)}
        </Button>
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
        withLabel(
          row.primaryPhone && formatPhone(row.primaryPhone, country),
          row.primaryPhoneLabel
        ),
    },
    {
      ...plain,
      field: 'taxIdLast4',
      headerName: 'Tax ID',
      flex: 1,
      priority: 'secondary',
      valueGetter: (_value, row) => displayTaxId(row, formats) ?? '—',
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
 * A directory list as a standard grid (M0005-R027–R028): server pages and a
 * row menu with Edit and Archive or Restore. The bulk actions live with the
 * caller (`useDirectoryBulk`), which places them in the page header or a
 * dialog's toolbar (I0001-R028, R034) and receives the selection through
 * `onSelectionChange`.
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
 *   onSelectionChange?: (ids: Array<string|number>, rows: object[]) => void,
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
  onSelectionChange,
}) {
  const [tick, setTick] = useState(0);
  const [actionError, setActionError] = useState(null);
  const formats = useTaxIdFormats();
  const { defaultCountry } = useEffectiveSettings().settings;
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

  return (
    <Stack spacing={1.5}>
      {actionError ? (
        <Alert severity="error" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      ) : null}
      <StandardDataGrid
        columns={columnsFor(collection, onOpen, formats, defaultCountry)}
        fetchPage={fetchPage}
        resetKey={resetKey}
        rowActions={rowActions}
        onSelectionChange={onSelectionChange}
        selectable={Boolean(onSelectionChange) && abilities.write}
        ariaLabel={ariaLabel}
        emptyMessage={emptyMessage}
        describeError={err => describeDirectoryError(err)}
      />
      {editing ? (
        <RecordFormDialog
          collection={collection}
          record={editing}
          canWriteTaxIds={abilities.writeTaxIds}
          canManagePortal={abilities.write && Boolean(abilities.assignRoles)}
          onClose={() => setEditing(null)}
          onReload={async () => {
            const fresh = await getDirectoryRecord(collection, editing.id);
            setEditing(fresh);
            changed();
            return fresh;
          }}
          onSaved={() => {
            setEditing(null);
            changed();
          }}
        />
      ) : null}
    </Stack>
  );
}
