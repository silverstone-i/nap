/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useState } from 'react';
import { Navigate, Link, useNavigate, useSearchParams } from 'react-router';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { passwordBodySchema } from '@nap/shared';
import { changePassword, getSession } from '../api/auth.js';
import { useSession, sessionDestination } from '../auth/session.js';
import { AuthFrame } from '../auth/AuthFrame.js';
import { SessionStatus } from '../auth/SessionStatus.js';
import type { FormEvent } from 'react';

/**
 * Does: Renders the dedicated password-change form and its result.
 * Called by: the password route for voluntary and required changes.
 */
export function ChangePasswordPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const { state, setSession } = useSession();
  const [visible, setVisible] = useState(false);
  const [confirmationError, setConfirmationError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    message: string;
    success: boolean;
  } | null>(null);
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
    if (form.get('confirmPassword') !== parsed.data.newPassword) {
      setConfirmationError(true);
      return;
    }
    setConfirmationError(false);
    setBusy(true);
    setNotice(null);
    const result = await changePassword(
      parsed.data.currentPassword,
      parsed.data.newPassword
    );
    if (result.ok) {
      element.reset();
      setVisible(false);
      const checked = await getSession();
      if (checked.ok) {
        setSession(checked.body.data);
        if (
          state.status === 'ready' &&
          state.session?.state === 'password-change-required'
        ) {
          await navigate(
            sessionDestination(checked.body.data, search.get('next')),
            { replace: true }
          );
          return;
        }
      }
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
      <AuthFrame title="Change password" showTheme={false}>
        <SessionStatus />
      </AuthFrame>
    );
  if (!state.session)
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent('/account/password' + (search.size ? '?' + search.toString() : ''))}`}
        replace
      />
    );
  const required = state.session.state === 'password-change-required';
  const destination = sessionDestination(state.session, search.get('next'));
  return (
    <AuthFrame title="Change password" showTheme={false}>
      <Stack spacing={2}>
        {required && (
          <Alert severity="warning">
            Change your temporary password before continuing.
          </Alert>
        )}
        {notice && (
          <Alert severity={notice.success ? 'success' : 'error'}>
            {notice.message}
          </Alert>
        )}
        {state.session.controlledAccess ? (
          <Alert severity="warning">
            Password changes are unavailable during controlled access.
          </Alert>
        ) : (
          <Stack
            component="form"
            spacing={2}
            onSubmit={event => void submit(event)}
            aria-busy={busy}
          >
            <TextField
              name="currentPassword"
              label="Current password"
              type={visible ? 'text' : 'password'}
              autoComplete="current-password"
              required
              disabled={busy}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label={
                          visible ? 'Hide passwords' : 'Show passwords'
                        }
                        aria-pressed={visible}
                        onClick={() => setVisible(value => !value)}
                        disabled={busy}
                        edge="end"
                      >
                        {visible ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <TextField
              name="newPassword"
              label="New password"
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
              helperText="12–128 characters"
              required
              disabled={busy}
              slotProps={{ htmlInput: { minLength: 12, maxLength: 128 } }}
            />
            <TextField
              name="confirmPassword"
              label="Confirm new password"
              type={visible ? 'text' : 'password'}
              autoComplete="new-password"
              required
              disabled={busy}
              error={confirmationError}
              helperText={
                confirmationError ? 'Passwords do not match.' : undefined
              }
              onChange={() => setConfirmationError(false)}
            />
            <Button type="submit" variant="contained" disabled={busy}>
              {busy ? 'Changing password…' : 'Change password'}
            </Button>
          </Stack>
        )}
        {!required && (
          <Button component={Link} to={destination} disabled={busy}>
            {notice?.success ? 'Return to application' : 'Cancel'}
          </Button>
        )}
      </Stack>
    </AuthFrame>
  );
}
