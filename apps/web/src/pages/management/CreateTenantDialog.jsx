/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { ApiError } from '../../api/client.js';
import { createTenant } from '../../api/endpoints.js';

/** Mirrors `TIERS` (`apps/api` `domain/tenants.js`) — a display list only; the server remains the source of truth for validation. */
const TIERS = ['starter', 'growth', 'enterprise'];

/**
 * "Create tenant" (F0002-R002): submits `{code, name, tier}` with a
 * client-generated `Idempotency-Key` and surfaces the server's validation
 * and conflict responses unmodified — no client-side uniqueness check.
 * @param {{onClose: () => void, onCreated: () => void}} props
 * @returns {JSX.Element}
 */
export function CreateTenantDialog({ onClose, onCreated }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [tier, setTier] = useState('starter');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createTenant({ code, name, tier });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_INPUT')
        setError('Check the tenant code, name, and tier.');
      else if (err instanceof ApiError && err.code === 'CONFLICT')
        setError('A tenant with this code already exists.');
      else if (err instanceof ApiError && err.code === 'IDEMPOTENCY_CONFLICT')
        setError('This request could not be resubmitted. Try again.');
      else if (err instanceof ApiError && err.code === 'FORBIDDEN')
        setError('You are not authorized to create a tenant.');
      else setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      component="form"
      onSubmit={handleSubmit}
      aria-labelledby="create-tenant-title"
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle id="create-tenant-title">Create tenant</DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Code"
            value={code}
            onChange={event => setCode(event.target.value)}
            autoFocus
            required
            fullWidth
          />
          <TextField
            label="Name"
            value={name}
            onChange={event => setName(event.target.value)}
            required
            fullWidth
          />
          <TextField
            select
            label="Tier"
            value={tier}
            onChange={event => setTier(event.target.value)}
            required
            fullWidth
          >
            {TIERS.map(option => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={submitting}>
          Create tenant
        </Button>
      </DialogActions>
    </Dialog>
  );
}
