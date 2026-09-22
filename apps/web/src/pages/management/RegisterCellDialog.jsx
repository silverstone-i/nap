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
import TextField from '@mui/material/TextField';
import { ApiError } from '../../api/client.js';
import { registerCell } from '../../api/endpoints.js';

/**
 * "Register cell" (F0002-R004): submits `{operation: 'cell', suffix}` to
 * the existing registry contract. Non-destructive — no confirmation.
 * @param {{onClose: () => void, onRegistered: () => void}} props
 * @returns {JSX.Element}
 */
export function RegisterCellDialog({ onClose, onRegistered }) {
  const [suffix, setSuffix] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await registerCell({ suffix });
      onRegistered();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_INPUT')
        setError(
          'Enter a valid suffix: lowercase letters, digits, and hyphens, starting and ending with a letter or digit.'
        );
      else if (err instanceof ApiError && err.code === 'CONFLICT')
        setError('A cell with this suffix or database name already exists.');
      else if (err instanceof ApiError && err.code === 'FORBIDDEN')
        setError('You are not authorized to register a cell.');
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
      aria-labelledby="register-cell-title"
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle id="register-cell-title">Register cell</DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <TextField
          label="Suffix"
          value={suffix}
          onChange={event => setSuffix(event.target.value)}
          helperText="Lowercase letters, digits, and hyphens. Must start and end with a letter or digit."
          autoFocus
          required
          fullWidth
          sx={{ mt: 1 }}
        />
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={submitting}>
          Register
        </Button>
      </DialogActions>
    </Dialog>
  );
}
