/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { Navigate } from 'react-router';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { passwordBodySchema } from '@nap/shared';
import { logout, changePassword, getSession } from '../api/auth.js';
import { useSession } from '../auth/session.js';
import { AuthFrame } from '../auth/AuthFrame.js';
import { SessionStatus } from '../auth/SessionStatus.js';
import type { FormEvent } from 'react';

/**
 * Does: Shows the signed-in identity, password form, and logout action.
 * Called by: the account route.
 */
export function AccountPage() {
  const { state, setSession } = useSession();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    message: string;
    success: boolean;
  } | null>(null);
  /** Does: Revokes the browser session and returns the account gate to anonymous. */
  async function signOut() {
    setBusy(true);
    setNotice(null);
    const result = await logout();
    setBusy(false);
    if (result.ok) setSession(null);
    else setNotice({ message: result.error.message, success: false });
  }
  /** Does: Checks the replacement password and submits the password change. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    const parsed = passwordBodySchema.safeParse({
      currentPassword: form.get('currentPassword'),
      newPassword: form.get('newPassword'),
    });
    if (!parsed.success) {
      setNotice({
        message:
          'Enter your current password and a new password of 12–128 characters.',
        success: false,
      });
      return;
    }
    setBusy(true);
    setNotice(null);
    const result = await changePassword(
      parsed.data.currentPassword,
      parsed.data.newPassword
    );
    if (result.ok) {
      element.reset();
      setNotice({
        message: 'Password changed. Other sessions have been signed out.',
        success: true,
      });
    } else {
      setNotice({
        message:
          result.error.code === 'UNAUTHENTICATED'
            ? 'Current password could not be verified.'
            : result.error.message,
        success: false,
      });
      if (result.error.code === 'UNAUTHENTICATED') {
        const checked = await getSession();
        if (!checked.ok && checked.error.code === 'UNAUTHENTICATED')
          setSession(null);
      }
    }
    setBusy(false);
  }
  if (state.status !== 'ready')
    return (
      <AuthFrame title="Account">
        <SessionStatus />
      </AuthFrame>
    );
  if (!state.session) return <Navigate to="/login?next=%2Faccount" replace />;
  return (
    <AuthFrame title="Account">
      <Stack spacing={2}>
        <Typography>{state.session.email}</Typography>
        <Typography>Tenant: {state.session.tenantCode}</Typography>
        <Button
          variant="outlined"
          onClick={() => void signOut()}
          disabled={busy}
        >
          Sign out
        </Button>
        <Divider />
        <Typography component="h2" variant="h6">
          Change password
        </Typography>
        {notice && (
          <Alert severity={notice.success ? 'success' : 'error'}>
            {notice.message}
          </Alert>
        )}
        <Stack
          component="form"
          spacing={2}
          onSubmit={event => void submit(event)}
          aria-busy={busy}
        >
          <TextField
            name="currentPassword"
            label="Current password"
            type="password"
            autoComplete="current-password"
            required
            disabled={busy}
          />
          <TextField
            name="newPassword"
            label="New password"
            type="password"
            autoComplete="new-password"
            helperText="12–128 characters"
            required
            slotProps={{ htmlInput: { minLength: 12, maxLength: 128 } }}
            disabled={busy}
          />
          <Button type="submit" variant="contained" disabled={busy}>
            {busy ? 'Please wait…' : 'Change password'}
          </Button>
        </Stack>
      </Stack>
    </AuthFrame>
  );
}
