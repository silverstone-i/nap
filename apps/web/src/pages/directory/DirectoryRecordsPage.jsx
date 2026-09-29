/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { listDirectoryRecords } from '../../api/endpoints.js';
import { useSession } from '../../auth/SessionContext.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { RecordDetailDialog } from './RecordDetailDialog.jsx';
import { RecordFormDialog } from './RecordFormDialog.jsx';
import { KIND_LABELS, recordName } from './directoryRecords.js';
import { describeDirectoryError } from './directoryErrors.js';
import { useDirectoryAbilities } from './useDirectoryAbilities.js';

/** Per-collection page settings. */
const PAGES = {
  people: {
    title: 'People',
    kinds: ['employee', 'contact'],
    create: 'New person',
    empty: 'No people yet.',
  },
  organizations: {
    title: 'Vendors & Clients',
    kinds: ['vendor', 'client'],
    create: 'New vendor or client',
    empty: 'No vendors or clients yet.',
  },
};

/**
 * `/directory/people` and `/directory/organizations` (M0005-R026): list,
 * search, and filter the selected tenant's records, open one, or create
 * one. A tax ID search needs `tax-ids::read`.
 * @param {{collection: 'people'|'organizations'}} props
 * @returns {JSX.Element}
 */
export function DirectoryRecordsPage({ collection }) {
  const settings = PAGES[collection];
  const session = useSession();
  const tenant = session.selectedTenant;
  const abilities = useDirectoryAbilities();
  const { onError } = abilities;
  const [kind, setKind] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [taxIdSearch, setTaxIdSearch] = useState('');
  const [taxIdQuery, setTaxIdQuery] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(key => key + 1);

  usePageHeader({
    title: settings.title,
    actions:
      tenant && abilities.write ? (
        <Button
          variant="contained"
          size="small"
          onClick={() => setCreating(true)}
        >
          {settings.create}
        </Button>
      ) : null,
  });

  useEffect(() => {
    if (!tenant) return undefined;
    let cancelled = false;
    listDirectoryRecords(collection, {
      kind: kind || undefined,
      q: query || undefined,
      taxId: taxIdQuery || undefined,
      includeArchived,
    })
      .then(result => {
        if (cancelled) return;
        setError(null);
        setRows(result);
      })
      .catch(err => {
        if (cancelled) return;
        onError(err);
        setError(describeDirectoryError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [
    tenant,
    collection,
    kind,
    query,
    taxIdQuery,
    includeArchived,
    reloadKey,
    onError,
  ]);

  if (!tenant)
    return (
      <Alert severity="info">
        Select a tenant to see its {settings.title}.
      </Alert>
    );

  return (
    <Stack spacing={3}>
      {notice ? (
        <Alert severity="warning" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      ) : null}
      <Stack
        component="form"
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        onSubmit={event => {
          event.preventDefault();
          setQuery(search.trim());
          setTaxIdQuery(taxIdSearch.trim());
        }}
      >
        <TextField
          select
          label="Kind"
          value={kind}
          onChange={event => setKind(event.target.value)}
          size="small"
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">All</MenuItem>
          {settings.kinds.map(option => (
            <MenuItem key={option} value={option}>
              {KIND_LABELS[option]}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Search by name"
          value={search}
          onChange={event => setSearch(event.target.value)}
          size="small"
        />
        {abilities.readTaxIds ? (
          <TextField
            label="Search by tax ID"
            value={taxIdSearch}
            onChange={event => setTaxIdSearch(event.target.value)}
            size="small"
            autoComplete="off"
          />
        ) : null}
        <Button type="submit" variant="outlined" size="small">
          Search
        </Button>
        <FormControlLabel
          control={
            <Switch
              checked={includeArchived}
              onChange={event => setIncludeArchived(event.target.checked)}
            />
          }
          label="Include archived"
        />
      </Stack>
      {error ? (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={reload}>
              Retry
            </Button>
          }
        >
          {error}
        </Alert>
      ) : rows === null ? (
        <CircularProgress aria-label={`Loading ${settings.title}`} />
      ) : rows.length === 0 ? (
        <Typography color="text.secondary">{settings.empty}</Typography>
      ) : (
        <Table size="small" aria-label={settings.title}>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Kind</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell>Tax ID</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.id} hover>
                <TableCell>
                  <Button
                    variant="text"
                    size="small"
                    onClick={() => setSelected(row.id)}
                  >
                    {recordName(row)}
                  </Button>
                  {row.archived ? <Chip size="small" label="Archived" /> : null}
                </TableCell>
                <TableCell>{KIND_LABELS[row.kind]}</TableCell>
                <TableCell>{row.primaryEmail ?? '—'}</TableCell>
                <TableCell>{row.primaryPhone ?? '—'}</TableCell>
                <TableCell>
                  {row.taxIdLast4 ? `•••••${row.taxIdLast4}` : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {selected ? (
        <RecordDetailDialog
          collection={collection}
          id={selected}
          abilities={abilities}
          onClose={() => setSelected(null)}
          onChanged={reload}
        />
      ) : null}
      {creating ? (
        <RecordFormDialog
          collection={collection}
          record={null}
          canWriteTaxIds={abilities.writeTaxIds}
          onClose={() => setCreating(false)}
          onSaved={saved => {
            setCreating(false);
            setNotice(
              saved.duplicateTaxIds?.length
                ? `Saved. ${saved.duplicateTaxIds.length} other record(s) have the same tax ID.`
                : null
            );
            setSelected(saved.id);
            reload();
          }}
        />
      ) : null}
    </Stack>
  );
}
