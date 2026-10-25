/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useMemo, useState } from 'react';
import { formatTaxId, isValidMask, maskSlots } from '@nap/shared';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ArchiveIcon from '@mui/icons-material/Archive';
import EditIcon from '@mui/icons-material/Edit';
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash';
import { ApiError } from '../../api/client.js';
import {
  archiveTaxIdFormat,
  bulkTaxIdFormatAction,
  createTaxIdFormat,
  listTaxIdFormats,
  restoreTaxIdFormat,
  updateTaxIdFormat,
} from '../../api/endpoints.js';
import { useSession } from '../../auth/SessionContext.jsx';
import { CountrySelect } from '../../components/CountrySelect.jsx';
import { ArchivedConflictMessage } from '../../grid/ArchivedConflictMessage.jsx';
import {
  archivedSearchPath,
  isArchivedConflict,
} from '../../grid/archivedConflict.js';
import { ArchiveViewTabs } from '../../grid/ArchiveViewTabs.jsx';
import { createListPageAdapter } from '../../grid/listPageAdapter.js';
import { useArchiveView } from '../../grid/useArchiveView.js';
import { useSearchFromUrl } from '../../grid/useSearchFromUrl.js';
import { StandardDataGrid } from '../../grid/StandardDataGrid.jsx';
import {
  ALREADY_IN_STATE,
  useBulkArchive,
} from '../../grid/useBulkArchive.jsx';
import { useNotice } from '../../shell/NoticeContext.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { useDebouncedValue } from '../../shell/useDebouncedValue.js';
import { describeDirectoryError, isStaleRevision } from './directoryErrors.js';
import { useDirectoryAbilities } from './useDirectoryAbilities.js';

const PATH = '/settings/tax-id-formats';

const ARCHIVE_TEXT =
  'Archived formats move to the Archived tab and are not offered for new tax IDs. Tax IDs that use a format keep it.';

/** R041: the server refuses a slot change to a format a record uses. */
const IN_USE_TEXT =
  'Records use this format, so only its name and separators can change. Archive it and add a new format instead.';

const COLUMNS = [
  {
    field: 'country',
    headerName: 'Country',
    flex: 1,
    minWidth: 90,
    sortable: false,
    filterable: false,
    priority: 'essential',
  },
  {
    field: 'name',
    headerName: 'Name',
    flex: 2,
    sortable: false,
    filterable: false,
    priority: 'essential',
  },
  {
    field: 'mask',
    headerName: 'Mask',
    flex: 2,
    sortable: false,
    filterable: false,
  },
];

/**
 * A sample tax ID laid out in a mask, so the user sees what the mask means.
 * @param {string} mask
 * @returns {string}
 */
function example(mask) {
  const sample = [...maskSlots(mask)]
    .map((slot, i) => (slot === '#' ? String((i + 1) % 10) : 'X'))
    .join('');
  return formatTaxId(sample, mask);
}

/**
 * Add format or Edit (M0005-R042). A name is unique within its country, so
 * a clash is reported in the dialog, with a link to the archived format when
 * one holds the name (I0011-R008). The country cannot change. On
 * `STALE_REVISION`, `onReload` fetches the format, and the form starts over
 * from it.
 * @param {{format: object|null, onClose: () => void, onSaved: (saved: object) => void, onReload: () => Promise<object>}} props
 *   `format` is the one to edit, or null to add one.
 * @returns {JSX.Element}
 */
function TaxIdFormatDialog({
  format: initialFormat,
  onClose,
  onSaved,
  onReload,
}) {
  const [format, setFormat] = useState(initialFormat);
  const [country, setCountry] = useState(format?.country ?? 'US');
  const [name, setName] = useState(format?.name ?? '');
  const [mask, setMask] = useState(format?.mask ?? '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const maskValid = isValidMask(mask);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onSaved(
        format
          ? await updateTaxIdFormat(format.id, {
              name,
              mask,
              revision: format.revision,
            })
          : await createTaxIdFormat({ country, name, mask })
      );
    } catch (err) {
      setError(
        isArchivedConflict(err) ? (
          <ArchivedConflictMessage
            message="An archived format in this country already uses this name."
            to={archivedSearchPath(PATH, name.trim())}
            onFollow={onClose}
          />
        ) : err instanceof ApiError && err.code === 'INVALID_STATE' ? (
          IN_USE_TEXT
        ) : (
          describeDirectoryError(err)
        )
      );
      if (format && isStaleRevision(err)) {
        try {
          const fresh = await onReload();
          setFormat(fresh);
          setName(fresh.name);
          setMask(fresh.mask);
        } catch (reloadErr) {
          setError(describeDirectoryError(reloadErr));
        }
      }
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      aria-labelledby="tax-id-format-dialog-title"
      fullWidth
      maxWidth="xs"
    >
      <form onSubmit={save}>
        <DialogTitle id="tax-id-format-dialog-title">
          {format ? 'Edit format' : 'Add format'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <CountrySelect
              value={country}
              onChange={code => setCountry(code ?? '')}
              disabled={Boolean(format)}
              required
            />
            <TextField
              label="Name"
              value={name}
              onChange={event => setName(event.target.value)}
              size="small"
              required
              autoFocus
            />
            <TextField
              label="Mask"
              value={mask}
              onChange={event => setMask(event.target.value)}
              size="small"
              required
              error={mask !== '' && !maskValid}
              helperText={
                mask !== '' && maskValid
                  ? `Example: ${example(mask)}`
                  : '# is a digit and A is a letter, 4 to 32 in all; anything else is a separator.'
              }
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={saving || !maskValid || !country}
          >
            Save
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/**
 * `/settings/tax-id-formats` (M0005-R036–R042): the tenant's tax ID formats
 * in a standard grid. The header holds the name search, the bulk actions,
 * and Add format, with Active and Archived tabs below that switch the view,
 * kept in the URL (I0011-R001–R005). A name is unique within its country.
 * @returns {JSX.Element}
 */
export function TaxIdFormatsPage() {
  const session = useSession();
  const tenant = session.selectedTenant;
  const abilities = useDirectoryAbilities();
  const { onError } = abilities;
  const notify = useNotice();
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useArchiveView();
  useSearchFromUrl(setSearch);
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(key => key + 1);

  const needle = useDebouncedValue(search.trim().toLowerCase());
  // The route returns every format; the view and search filter in the browser.
  const adapter = useMemo(
    () => createListPageAdapter(() => listTaxIdFormats()),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a reload or a new tenant loads afresh
    [reloadKey, tenant?.id]
  );
  const fetchPage = useMemo(
    () => params =>
      adapter({
        ...params,
        keep: row =>
          row.archived === archived && row.name.toLowerCase().includes(needle),
      }),
    [adapter, archived, needle]
  );
  // I0011-R006: a view switch clears the selection and returns to page one.
  const resetKey = `${tenant?.id}:${archived}:${needle}:${reloadKey}`;

  const bulk = useBulkArchive({
    canWrite: abilities.taxIdFormats,
    noun: ['format', 'formats'],
    nameOf: row => `${row.country} ${row.name}`,
    run: bulkTaxIdFormatAction,
    describeError: err => describeDirectoryError(err),
    describeItem: (code, action) =>
      code === 'INVALID_STATE'
        ? ALREADY_IN_STATE[action]
        : describeDirectoryError(new ApiError(code, 409)),
    archiveText: ARCHIVE_TEXT,
    onDone: reload,
    onError,
    archived,
  });

  async function run(action, message) {
    setError(null);
    try {
      await action();
      notify(message);
      reload();
    } catch (err) {
      onError(err);
      setError(describeDirectoryError(err));
    }
  }

  function rowActions(row) {
    if (!abilities.taxIdFormats) return [];
    return row.archived
      ? [
          {
            label: 'Restore',
            icon: <RestoreFromTrashIcon fontSize="small" />,
            onClick: target =>
              run(
                () => restoreTaxIdFormat(target.id, target.revision),
                `Restored ${target.name}.`
              ),
          },
        ]
      : [
          {
            label: 'Edit',
            icon: <EditIcon fontSize="small" />,
            onClick: target => setDialog({ format: target }),
          },
          {
            label: 'Archive',
            icon: <ArchiveIcon fontSize="small" />,
            destructive: true,
            confirmDescription: ARCHIVE_TEXT,
            onClick: target =>
              run(
                () => archiveTaxIdFormat(target.id, target.revision),
                `Archived ${target.name}.`
              ),
          },
        ];
  }

  usePageHeader({
    title: 'Tax ID Formats',
    search: tenant
      ? {
          value: search,
          onChange: setSearch,
          placeholder: 'Search formats',
          label: 'Search formats',
        }
      : null,
    tabs: tenant ? (
      <ArchiveViewTabs archived={archived} onChange={setArchived} />
    ) : null,
    actions: tenant
      ? [
          ...bulk.actions,
          abilities.taxIdFormats &&
            !archived && {
              label: 'Add format',
              create: true,
              onClick: () => setDialog({ format: null }),
            },
        ]
      : null,
  });

  if (!tenant)
    return (
      <Alert severity="info">Select a tenant to see its tax ID formats.</Alert>
    );

  return (
    <Stack spacing={1.5}>
      {error ? (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}
      <StandardDataGrid
        columns={COLUMNS}
        fetchPage={fetchPage}
        resetKey={resetKey}
        rowActions={rowActions}
        onSelectionChange={bulk.onSelectionChange}
        selectable={abilities.taxIdFormats}
        ariaLabel="Tax ID formats"
        emptyMessage="No formats match."
        describeError={err => describeDirectoryError(err)}
      />
      {bulk.dialogs}
      {dialog ? (
        <TaxIdFormatDialog
          format={dialog.format}
          onClose={() => setDialog(null)}
          onReload={async () => {
            const rows = await listTaxIdFormats();
            reload();
            const fresh = rows.find(row => row.id === dialog.format.id);
            if (!fresh) throw new ApiError('NOT_FOUND', 404);
            return fresh;
          }}
          onSaved={saved => {
            setDialog(null);
            notify(
              dialog.format ? `Saved ${saved.name}.` : `Added ${saved.name}.`
            );
            reload();
          }}
        />
      ) : null}
    </Stack>
  );
}
