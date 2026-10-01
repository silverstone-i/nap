/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { retryPortalAccess } from '../../api/endpoints.js';
import { PasswordField } from '../../components/PasswordField.jsx';
import {
  describeDirectoryError,
  portalFailureMessage,
  PORTAL_MESSAGES,
} from './directoryErrors.js';

/** Label and chip color for each portal-access status (I0008-R008). */
const STATUS = Object.freeze({
  off: { label: 'Off', color: 'default' },
  requested: { label: 'Requested', color: 'info' },
  invited: { label: 'Invited', color: 'info' },
  on: { label: 'On', color: 'success' },
  failed: { label: 'Failed', color: 'error' },
});

/** Shown while a person has not signed in yet (I0008-R010). */
const INVITED_NOTE =
  'Waiting for first sign-in. If this person already had a pending invitation from another organization, they sign in with that earlier temporary password.';

/**
 * A small chip naming a person's portal-access status.
 * @param {{portalAccess: {status: string}}} props
 * @returns {import('react').JSX.Element}
 */
export function PortalAccessChip({ portalAccess }) {
  const { label, color } = STATUS[portalAccess.status] ?? STATUS.off;
  return <Chip size="small" label={label} color={color} />;
}

/**
 * A person's portal-access status with its explanation, and **Retry** for a
 * failed request (I0008-R007–R010).
 * @param {object} props
 * @param {'people'|'organization-contacts'} props.collection
 * @param {object} props.record Person view with `isPortalUser` and `portalAccess`.
 * @param {boolean} props.canWrite Whether the session may write directory records.
 * @param {() => void} props.onChanged Called after a successful retry.
 * @returns {import('react').JSX.Element}
 */
export function PortalAccessPanel({ collection, record, canWrite, onChanged }) {
  const [retrying, setRetrying] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const { status, failureCode } = record.portalAccess;

  async function retry(event) {
    event?.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await retryPortalAccess(
        collection,
        record.id,
        record.isPortalUser ? password : undefined
      );
      setRetrying(false);
      setPassword('');
      onChanged();
    } catch (err) {
      setError(
        describeDirectoryError(
          err,
          record.isPortalUser ? PORTAL_MESSAGES.turnOn : PORTAL_MESSAGES.turnOff
        )
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="body2">Portal access:</Typography>
        <PortalAccessChip portalAccess={record.portalAccess} />
        {status === 'failed' && canWrite && !record.archived ? (
          <Button
            size="small"
            onClick={() =>
              record.isPortalUser ? setRetrying(true) : void retry()
            }
            disabled={saving}
          >
            Retry
          </Button>
        ) : null}
      </Stack>
      {status === 'invited' ? (
        <Typography variant="body2" color="text.secondary">
          {INVITED_NOTE}
        </Typography>
      ) : null}
      {status === 'failed' ? (
        <Alert severity="error">{portalFailureMessage(failureCode)}</Alert>
      ) : null}
      {error && !retrying ? <Alert severity="error">{error}</Alert> : null}
      <Dialog
        open={retrying}
        onClose={() => setRetrying(false)}
        component="form"
        onSubmit={retry}
        aria-labelledby="portal-retry-title"
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle id="portal-retry-title">Retry portal access</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <PasswordField
              label="Temporary password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              helperText="Give this to the person. They must replace it when they first sign in."
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            variant="text"
            onClick={() => setRetrying(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={saving}>
            Retry
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
