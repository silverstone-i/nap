/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { PasswordField } from '../../components/PasswordField.jsx';
import { ApiError } from '../../api/client.js';
import { listCellsOverview, provisionTenant } from '../../api/endpoints.js';

/**
 * Map a provisioning failure to a message.
 * @param {unknown} err
 * @returns {string}
 */
function describeError(err) {
  if (!(err instanceof ApiError))
    return 'Something went wrong. Please try again.';
  if (err.code === 'INVALID_INPUT')
    return 'Check the cell, email, and temporary password.';
  if (err.code === 'CELL_UNAVAILABLE')
    return 'That cell is not ready. Pick another.';
  if (err.code === 'INVALID_STATE')
    return 'This tenant cannot be provisioned in its current state.';
  if (err.code === 'CONFLICT')
    return 'That email belongs to a login that cannot be used, or is already a member.';
  if (err.code === 'FORBIDDEN')
    return 'You are not authorized to provision a tenant.';
  return 'Something went wrong. Please try again.';
}

/**
 * "Provision" (I0006-R010): pick a ready cell and name the tenant's first
 * administrator with a temporary password.
 * @param {{tenant: {id: string, code: string}, onClose: () => void, onProvisioned: () => void}} props
 * @returns {JSX.Element}
 */
export function ProvisionTenantDialog({ tenant, onClose, onProvisioned }) {
  const [cells, setCells] = useState(null);
  const [cell, setCell] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let live = true;
    listCellsOverview({ limit: 100 })
      .then(result => {
        if (!live) return;
        const ready = result.rows
          .filter(row => row.ready)
          .map(row => ({
            id: row.cell.id,
            label: row.cell.database_name,
          }));
        setCells(ready);
        if (ready.length === 1) setCell(ready[0].id);
      })
      .catch(() => live && setCells([]));
    return () => {
      live = false;
    };
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await provisionTenant({ tenant: tenant.id, cell, email, password });
      onProvisioned();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  }

  const noCells = cells !== null && cells.length === 0;

  return (
    <Dialog
      open
      onClose={onClose}
      component="form"
      onSubmit={handleSubmit}
      aria-labelledby="provision-tenant-title"
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle id="provision-tenant-title">
        Provision {tenant.code}
      </DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        {noCells ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            No cell is ready. Provision a cell first.
          </Alert>
        ) : null}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select
            label="Cell"
            value={cell}
            onChange={event => setCell(event.target.value)}
            required
            fullWidth
            disabled={!cells?.length}
          >
            {(cells ?? []).map(option => (
              <MenuItem key={option.id} value={option.id}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Administrator email"
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            required
            fullWidth
          />
          <PasswordField
            label="Temporary password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            helperText="They must change it at first sign-in."
            required
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={submitting || !cell}
        >
          Provision
        </Button>
      </DialogActions>
    </Dialog>
  );
}
