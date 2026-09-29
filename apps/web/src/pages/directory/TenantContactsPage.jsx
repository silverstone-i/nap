/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import {
  addTenantContact,
  listDirectoryRecords,
  listTenantContacts,
  removeTenantContact,
} from '../../api/endpoints.js';
import { useSession } from '../../auth/SessionContext.jsx';
import { usePageHeader } from '../../shell/PageHeaderContext.jsx';
import { describeDirectoryError } from './directoryErrors.js';
import { useDirectoryAbilities } from './useDirectoryAbilities.js';

const DESIGNATION_LABELS = { primary: 'Primary', billing: 'Billing' };

/**
 * `/directory/tenant-contacts` (M0005-R018, R019): the tenant's primary and
 * billing contacts. Any number of employees may hold each; the last
 * primary contact cannot be removed.
 * @returns {JSX.Element}
 */
export function TenantContactsPage() {
  const session = useSession();
  const tenant = session.selectedTenant;
  const abilities = useDirectoryAbilities();
  const { onError } = abilities;
  const [rows, setRows] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [designation, setDesignation] = useState('primary');
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey(key => key + 1);

  usePageHeader({ title: 'Tenant Contacts' });

  useEffect(() => {
    if (!tenant) return undefined;
    let cancelled = false;
    listTenantContacts()
      .then(result => !cancelled && setRows(result))
      .catch(err => {
        if (cancelled) return;
        onError(err);
        setError(describeDirectoryError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [tenant, reloadKey, onError]);

  useEffect(() => {
    if (!tenant || !abilities.tenantContacts) return undefined;
    let cancelled = false;
    listDirectoryRecords('people', { kind: 'employee' })
      .then(result => !cancelled && setEmployees(result))
      .catch(() => !cancelled && setEmployees([]));
    return () => {
      cancelled = true;
    };
  }, [tenant, abilities.tenantContacts]);

  async function run(action) {
    setError(null);
    try {
      await action();
      reload();
    } catch (err) {
      onError(err);
      setError(describeDirectoryError(err));
    }
  }

  if (!tenant)
    return <Alert severity="info">Select a tenant to see its contacts.</Alert>;

  return (
    <Stack spacing={3}>
      {error ? (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}
      {abilities.tenantContacts ? (
        <Stack
          component="form"
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          onSubmit={event => {
            event.preventDefault();
            if (employee)
              void run(() => addTenantContact(employee.id, designation));
          }}
        >
          <Autocomplete
            options={employees}
            value={employee}
            onChange={(_event, option) => setEmployee(option)}
            getOptionLabel={option => `${option.firstName} ${option.lastName}`}
            isOptionEqualToValue={(option, current) => option.id === current.id}
            sx={{ minWidth: 260 }}
            renderInput={params => (
              <TextField {...params} label="Employee" size="small" />
            )}
          />
          <TextField
            select
            label="Designation"
            value={designation}
            onChange={event => setDesignation(event.target.value)}
            size="small"
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="primary">Primary</MenuItem>
            <MenuItem value="billing">Billing</MenuItem>
          </TextField>
          <Button
            type="submit"
            variant="contained"
            size="small"
            disabled={!employee}
          >
            Add contact
          </Button>
        </Stack>
      ) : null}
      {rows === null ? (
        error ? null : (
          <CircularProgress aria-label="Loading tenant contacts" />
        )
      ) : rows.length === 0 ? (
        <Typography color="text.secondary">No tenant contacts yet.</Typography>
      ) : (
        <Table size="small" aria-label="Tenant contacts">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Designation</TableCell>
              <TableCell>Email</TableCell>
              <TableCell />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(row => (
              <TableRow key={`${row.partyId}:${row.designation}`}>
                <TableCell>
                  {row.firstName} {row.lastName}
                </TableCell>
                <TableCell>{DESIGNATION_LABELS[row.designation]}</TableCell>
                <TableCell>{row.primaryEmail ?? '—'}</TableCell>
                <TableCell align="right">
                  {abilities.tenantContacts ? (
                    <Button
                      size="small"
                      onClick={() =>
                        run(() =>
                          removeTenantContact(row.partyId, row.designation)
                        )
                      }
                    >
                      Remove
                    </Button>
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
