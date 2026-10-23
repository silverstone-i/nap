/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ArchiveIcon from '@mui/icons-material/Archive';
import EditIcon from '@mui/icons-material/Edit';
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash';
import { ApiError } from '../../api/client.js';
import {
  archiveContactLabel,
  bulkContactLabelAction,
  createContactLabel,
  listContactLabels,
  renameContactLabel,
  restoreContactLabel,
} from '../../api/endpoints.js';
import { useSession } from '../../auth/SessionContext.jsx';
import { createListPageAdapter } from '../../grid/listPageAdapter.js';
import { StandardDataGrid } from '../../grid/StandardDataGrid.jsx';
import {
  ALREADY_IN_STATE,
  useBulkArchive,
} from '../../grid/useBulkArchive.jsx';
import { useNotice } from '../../shell/NoticeContext.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { useDebouncedValue } from '../../shell/useDebouncedValue.js';
import { describeDirectoryError } from './directoryErrors.js';
import { useDirectoryAbilities } from './useDirectoryAbilities.js';

const GROUP_LABELS = { email: 'Email', phone: 'Phone', address: 'Address' };

const ARCHIVE_TEXT =
  'Archived labels are hidden until restored. Emails, phones, and addresses that use a label keep it.';

const COLUMNS = [
  {
    field: 'appliesTo',
    headerName: 'For',
    flex: 1,
    minWidth: 100,
    sortable: false,
    filterable: false,
    priority: 'essential',
    valueGetter: value => GROUP_LABELS[value],
  },
  {
    field: 'name',
    headerName: 'Name',
    flex: 3,
    sortable: false,
    filterable: false,
    priority: 'essential',
    renderCell: ({ row }) => (
      <Stack
        direction="row"
        spacing={1}
        sx={{ alignItems: 'center', height: '100%' }}
      >
        <span>{row.name}</span>
        {row.archived ? <Chip size="small" label="Archived" /> : null}
      </Stack>
    ),
  },
];

/**
 * Add label or Rename (I0001-R032). A name is unique within its group, so
 * a clash is reported in the dialog.
 * @param {{label: object|null, defaultGroup: string, onClose: () => void, onSaved: (saved: object) => void}} props
 *   `label` is the one to rename, or null to add one.
 * @returns {JSX.Element}
 */
function LabelDialog({ label, defaultGroup, onClose, onSaved }) {
  const [appliesTo, setAppliesTo] = useState(label?.appliesTo ?? defaultGroup);
  const [name, setName] = useState(label?.name ?? '');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onSaved(
        label
          ? await renameContactLabel(label.id, {
              name,
              revision: label.revision,
            })
          : await createContactLabel({ appliesTo, name })
      );
    } catch (err) {
      setError(describeDirectoryError(err));
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      aria-labelledby="label-dialog-title"
      fullWidth
      maxWidth="xs"
    >
      <form onSubmit={save}>
        <DialogTitle id="label-dialog-title">
          {label ? 'Rename label' : 'Add label'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              select
              label="For"
              value={appliesTo}
              onChange={event => setAppliesTo(event.target.value)}
              disabled={Boolean(label)}
              size="small"
            >
              {Object.entries(GROUP_LABELS).map(([value, text]) => (
                <MenuItem key={value} value={value}>
                  {text}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Name"
              value={name}
              onChange={event => setName(event.target.value)}
              size="small"
              required
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button variant="text" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saving}>
            Save
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/**
 * `/settings/labels` (M0005-R017, R031, R032): the tenant's labels for
 * emails, phones, and addresses in a standard grid. The header holds the
 * name search, the filter popover (For, Include archived), the bulk
 * actions, and Add label. A name is unique within its group.
 * @returns {JSX.Element}
 */
export function LabelsPage() {
  const session = useSession();
  const tenant = session.selectedTenant;
  const abilities = useDirectoryAbilities();
  const { onError } = abilities;
  const notify = useNotice();
  const [search, setSearch] = useState('');
  const [group, setGroup] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(key => key + 1);

  const needle = useDebouncedValue(search.trim().toLowerCase());
  const fetchPage = useMemo(
    () =>
      createListPageAdapter(
        () =>
          listContactLabels({
            appliesTo: group || undefined,
            includeArchived,
          }),
        row => row.name.toLowerCase().includes(needle)
      ),
    [group, includeArchived, needle]
  );
  const resetKey = `${tenant?.id}:${group}:${includeArchived}:${needle}:${reloadKey}`;

  const bulk = useBulkArchive({
    canWrite: abilities.labels,
    noun: ['label', 'labels'],
    nameOf: row => `${GROUP_LABELS[row.appliesTo]} ${row.name}`,
    run: bulkContactLabelAction,
    describeError: err => describeDirectoryError(err),
    describeItem: (code, action) =>
      code === 'INVALID_STATE'
        ? ALREADY_IN_STATE[action]
        : describeDirectoryError(new ApiError(code, 409)),
    archiveText: ARCHIVE_TEXT,
    onDone: reload,
    onError,
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
    if (!abilities.labels) return [];
    return row.archived
      ? [
          {
            label: 'Restore',
            icon: <RestoreFromTrashIcon fontSize="small" />,
            onClick: target =>
              run(
                () => restoreContactLabel(target.id, target.revision),
                `Restored ${target.name}.`
              ),
          },
        ]
      : [
          {
            label: 'Rename',
            icon: <EditIcon fontSize="small" />,
            onClick: target => setDialog({ label: target }),
          },
          {
            label: 'Archive',
            icon: <ArchiveIcon fontSize="small" />,
            destructive: true,
            confirmDescription: ARCHIVE_TEXT,
            onClick: target =>
              run(
                () => archiveContactLabel(target.id, target.revision),
                `Archived ${target.name}.`
              ),
          },
        ];
  }

  const chips = [
    group && {
      key: 'for',
      label: `For: ${GROUP_LABELS[group]}`,
      onDelete: () => setGroup(''),
    },
    includeArchived && {
      key: 'archived',
      label: 'Including archived',
      onDelete: () => setIncludeArchived(false),
    },
  ].filter(Boolean);

  usePageHeader({
    title: 'Labels',
    search: tenant
      ? {
          value: search,
          onChange: setSearch,
          placeholder: 'Search labels',
          label: 'Search labels',
        }
      : null,
    filters: tenant
      ? {
          content: (
            <>
              <TextField
                select
                label="For"
                value={group}
                onChange={event => setGroup(event.target.value)}
                size="small"
              >
                <MenuItem value="">All</MenuItem>
                {Object.entries(GROUP_LABELS).map(([value, text]) => (
                  <MenuItem key={value} value={value}>
                    {text}
                  </MenuItem>
                ))}
              </TextField>
              <FormControlLabel
                control={
                  <Switch
                    checked={includeArchived}
                    onChange={event => setIncludeArchived(event.target.checked)}
                  />
                }
                label="Include archived"
              />
            </>
          ),
          chips,
        }
      : null,
    actions: tenant
      ? [
          ...bulk.actions,
          abilities.labels && {
            label: 'Add label',
            create: true,
            onClick: () => setDialog({ label: null }),
          },
        ]
      : null,
  });

  if (!tenant)
    return <Alert severity="info">Select a tenant to see its labels.</Alert>;

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
        selectable={abilities.labels}
        ariaLabel="Labels"
        emptyMessage="No labels match."
        describeError={err => describeDirectoryError(err)}
      />
      {bulk.dialogs}
      {dialog ? (
        <LabelDialog
          label={dialog.label}
          defaultGroup={group || 'email'}
          onClose={() => setDialog(null)}
          onSaved={saved => {
            setDialog(null);
            notify(
              dialog.label
                ? `Renamed to ${saved.name}.`
                : `Added ${saved.name}.`
            );
            reload();
          }}
        />
      ) : null}
    </Stack>
  );
}
