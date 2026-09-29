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
import {
  archiveContactLabel,
  createContactLabel,
  listContactLabels,
  renameContactLabel,
  restoreContactLabel,
} from '../../api/endpoints.js';
import { useSession } from '../../auth/SessionContext.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { describeDirectoryError } from './directoryErrors.js';
import { useDirectoryAbilities } from './useDirectoryAbilities.js';

const GROUP_LABELS = { email: 'Email', phone: 'Phone', address: 'Address' };

/**
 * `/directory/labels` (M0005-R017): the tenant's labels for emails, phones,
 * and addresses. A name is unique within its group.
 * @returns {JSX.Element}
 */
export function LabelsPage() {
  const session = useSession();
  const tenant = session.selectedTenant;
  const abilities = useDirectoryAbilities();
  const { onError } = abilities;
  const [includeArchived, setIncludeArchived] = useState(false);
  const [rows, setRows] = useState(null);
  const [appliesTo, setAppliesTo] = useState('email');
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(key => key + 1);

  usePageHeader({ title: 'Labels' });

  useEffect(() => {
    if (!tenant) return undefined;
    let cancelled = false;
    listContactLabels({ includeArchived })
      .then(result => !cancelled && setRows(result))
      .catch(err => {
        if (cancelled) return;
        onError(err);
        setError(describeDirectoryError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [tenant, includeArchived, reloadKey, onError]);

  async function run(action) {
    setError(null);
    try {
      await action();
      reload();
      return true;
    } catch (err) {
      onError(err);
      setError(describeDirectoryError(err));
      return false;
    }
  }

  if (!tenant)
    return <Alert severity="info">Select a tenant to see its labels.</Alert>;

  return (
    <Stack spacing={3}>
      {error ? (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}
      {abilities.labels ? (
        <Stack
          component="form"
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          onSubmit={async event => {
            event.preventDefault();
            if (await run(() => createContactLabel({ appliesTo, name })))
              setName('');
          }}
        >
          <TextField
            select
            label="For"
            value={appliesTo}
            onChange={event => setAppliesTo(event.target.value)}
            size="small"
            sx={{ minWidth: 140 }}
          >
            {Object.entries(GROUP_LABELS).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="New label"
            value={name}
            onChange={event => setName(event.target.value)}
            size="small"
            required
          />
          <Button type="submit" variant="contained" size="small">
            Add label
          </Button>
        </Stack>
      ) : null}
      <FormControlLabel
        control={
          <Switch
            checked={includeArchived}
            onChange={event => setIncludeArchived(event.target.checked)}
          />
        }
        label="Include archived"
      />
      {rows === null ? (
        error ? null : (
          <CircularProgress aria-label="Loading labels" />
        )
      ) : (
        <Table size="small" aria-label="Labels">
          <TableHead>
            <TableRow>
              <TableCell>For</TableCell>
              <TableCell>Name</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(row => (
              <TableRow key={row.id}>
                <TableCell>{GROUP_LABELS[row.appliesTo]}</TableCell>
                <TableCell>
                  {renaming?.id === row.id ? (
                    <Stack
                      component="form"
                      direction="row"
                      spacing={1}
                      onSubmit={async event => {
                        event.preventDefault();
                        if (
                          await run(() =>
                            renameContactLabel(row.id, {
                              name: renaming.name,
                              revision: row.revision,
                            })
                          )
                        )
                          setRenaming(null);
                      }}
                    >
                      <TextField
                        value={renaming.name}
                        onChange={event =>
                          setRenaming({ id: row.id, name: event.target.value })
                        }
                        size="small"
                        slotProps={{
                          htmlInput: { 'aria-label': 'Label name' },
                        }}
                        required
                      />
                      <Button type="submit" size="small">
                        Save
                      </Button>
                      <Button size="small" onClick={() => setRenaming(null)}>
                        Cancel
                      </Button>
                    </Stack>
                  ) : (
                    <>
                      {row.name}{' '}
                      {row.archived ? (
                        <Chip size="small" label="Archived" />
                      ) : null}
                    </>
                  )}
                </TableCell>
                <TableCell align="right">
                  {abilities.labels && renaming?.id !== row.id ? (
                    <>
                      <Button
                        size="small"
                        onClick={() =>
                          setRenaming({ id: row.id, name: row.name })
                        }
                      >
                        Rename
                      </Button>
                      <Button
                        size="small"
                        onClick={() =>
                          run(() =>
                            row.archived
                              ? restoreContactLabel(row.id, row.revision)
                              : archiveContactLabel(row.id, row.revision)
                          )
                        }
                      >
                        {row.archived ? 'Restore' : 'Archive'}
                      </Button>
                    </>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Stack>
  );
}
