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
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { ApiError } from '../../api/client.js';
import { createPortalUser } from '../../api/endpoints.js';

/**
 * "Create portal user" (F0002-R006): submits `{email, password}` with a
 * client-generated `Idempotency-Key`. The password is a temporary one the
 * new account must replace at next login (M0001-08 §7).
 * @param {{onClose: () => void, onCreated: () => void}} props
 * @returns {JSX.Element}
 */
export function CreatePortalUserDialog({ onClose, onCreated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createPortalUser({ email, password });
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_INPUT')
        setError('Check the email and temporary password.');
      else if (err instanceof ApiError && err.code === 'CONFLICT')
        setError('This email is already in use by another account.');
      else if (err instanceof ApiError && err.code === 'IDEMPOTENCY_CONFLICT')
        setError('This request could not be resubmitted. Try again.');
      else if (err instanceof ApiError && err.code === 'FORBIDDEN')
        setError('You are not authorized to create a portal user.');
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
      aria-labelledby="create-portal-user-title"
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle id="create-portal-user-title">
        Create portal user
      </DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Email"
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            autoFocus
            required
            fullWidth
          />
          <TextField
            label="Temporary password"
            type="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            helperText="The new account must replace this at next login."
            required
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={submitting}>
          Create portal user
        </Button>
      </DialogActions>
    </Dialog>
  );
}
