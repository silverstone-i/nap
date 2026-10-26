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
import { createRole } from '../../api/endpoints.js';
import { ArchivedConflictMessage } from '../../grid/ArchivedConflictMessage.jsx';
import {
  archivedSearchPath,
  isArchivedConflict,
} from '../../grid/archivedConflict.js';
import { describeRoleError } from './roleErrors.js';

const CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

/**
 * Create a custom role with only its code and name (I0001-R037,
 * M0003-R020); the caller opens its detail from `onSaved`, where the
 * description and grants are set.
 * @param {{onClose: () => void, onSaved: (role: object) => void}} props
 * @returns {JSX.Element}
 */
export function RoleFormDialog({ onClose, onSaved }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const codeInvalid = code !== '' && !CODE_PATTERN.test(code);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      onSaved(await createRole({ code, name, grants: [] }));
    } catch (err) {
      // I0011-R008: point at the archived role that holds the code.
      setError(
        isArchivedConflict(err) ? (
          <ArchivedConflictMessage
            message="An archived role already uses this code."
            to={archivedSearchPath('/settings/roles', code)}
            onFollow={onClose}
          />
        ) : (
          describeRoleError(err)
        )
      );
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
      aria-labelledby="role-form-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id="role-form-title">Create role</DialogTitle>
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
            error={codeInvalid}
            helperText="Lowercase letters, digits, and underscores; starts with a letter."
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
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="contained"
          disabled={submitting || codeInvalid}
        >
          Create role
        </Button>
      </DialogActions>
    </Dialog>
  );
}
