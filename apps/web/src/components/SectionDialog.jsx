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
import { ApiError } from '../api/client.js';
import { FormCheck } from './formCheck.js';

/**
 * A pencil's dialog: it edits one part of a record and saves only that
 * part (I0001-R036, M0005-R049, M0003-R019). `onSave` throws a `FormCheck` to report a
 * check the form makes itself, or the API's error; `describe` turns the
 * API's error into a message, which may be an element with a link. On
 * `STALE_REVISION` it calls `onStale` so the detail reloads the record.
 * `secondary` adds one more action, such as Clear, run the same way.
 * @param {{title: string, children: import('react').ReactNode, onClose: () => void, onSave: () => Promise<void>, describe: (err: unknown) => import('react').ReactNode, onStale?: () => void, secondary?: {label: string, onRun: () => Promise<void>}}} props
 * @returns {JSX.Element}
 */
export function SectionDialog({
  title,
  children,
  onClose,
  onSave,
  describe,
  onStale,
  secondary,
}) {
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const titleId = `section-${title.toLowerCase().replaceAll(' ', '-')}`;

  async function go(action) {
    setError(null);
    setSaving(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof FormCheck ? err.message : describe(err));
      if (err instanceof ApiError && err.code === 'STALE_REVISION') onStale?.();
    } finally {
      setSaving(false);
    }
  }

  function submit(event) {
    event.preventDefault();
    void go(onSave);
  }

  return (
    <Dialog
      open
      onClose={onClose}
      component="form"
      onSubmit={submit}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id={titleId}>{title}</DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Stack spacing={2} sx={{ mt: 1 }}>
          {children}
        </Stack>
      </DialogContent>
      <DialogActions>
        {secondary ? (
          <Button
            variant="text"
            color="warning"
            onClick={() => void go(secondary.onRun)}
            disabled={saving}
            sx={{ mr: 'auto' }}
          >
            {secondary.label}
          </Button>
        ) : null}
        <Button variant="text" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={saving}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
