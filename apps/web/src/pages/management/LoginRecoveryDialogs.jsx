/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { PasswordField } from '../../components/PasswordField.jsx';
import { listUserMemberships, resetUserPassword } from '../../api/endpoints.js';

/** Member types as people read them. */
const MEMBER_TYPES = Object.freeze({
  employee: 'Employee',
  contact: 'Contact',
  vendor_contact: 'Vendor contact',
  client_contact: 'Client contact',
});

/**
 * A login's memberships across tenants (I0008-R013).
 * @param {{user: {id: string, email: string}, describeError: (err: unknown) => string, onClose: () => void}} props
 * @returns {import('react').JSX.Element}
 */
export function MembershipsDialog({ user, describeError, onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    listUserMemberships(user.id)
      .then(setRows)
      .catch(err => setError(describeError(err)));
  }, [user.id, describeError]);

  return (
    <Dialog
      open
      onClose={onClose}
      aria-labelledby="memberships-title"
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle id="memberships-title" sx={{ overflowWrap: 'anywhere' }}>
        Memberships of {user.email}
      </DialogTitle>
      <DialogContent>
        {error ? (
          <Alert severity="error">{error}</Alert>
        ) : rows === null ? (
          <CircularProgress aria-label="Loading memberships" />
        ) : rows.length === 0 ? (
          <Typography color="text.secondary">No memberships.</Typography>
        ) : (
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label="Memberships">
              <TableHead>
                <TableRow>
                  <TableCell>Tenant</TableCell>
                  <TableCell>Member type</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.id}>
                    <TableCell>
                      {row.tenantName} ({row.tenantCode})
                    </TableCell>
                    <TableCell>
                      {MEMBER_TYPES[row.memberType] ?? 'Initial Napsoft login'}
                    </TableCell>
                    <TableCell>{row.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Give a login a new temporary password (I0008-R014).
 * @param {{user: {id: string, email: string}, describeError: (err: unknown) => string, onClose: () => void, onReset: () => void}} props
 * @returns {import('react').JSX.Element}
 */
export function ResetPasswordDialog({ user, describeError, onClose, onReset }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await resetUserPassword(user.id, password);
      onReset();
    } catch (err) {
      setError(describeError(err));
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
      aria-labelledby="reset-password-title"
      fullWidth
      maxWidth="xs"
    >
      <DialogTitle id="reset-password-title">Reset password</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Typography variant="body2">
            {user.email} is signed out everywhere and must replace this password
            at next sign-in.
          </Typography>
          <PasswordField
            label="Temporary password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoFocus
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
          Reset password
        </Button>
      </DialogActions>
    </Dialog>
  );
}
