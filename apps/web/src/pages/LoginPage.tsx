/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { loginBodySchema } from '@nap/shared';
import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { login } from '../api/auth.js';
import { useSession, safeNext } from '../auth/session.js';
import { AuthFrame } from '../auth/AuthFrame.js';
import { SessionStatus } from '../auth/SessionStatus.js';
import type { FormEvent } from 'react';

/**
 * Does: Presents email/password login and safe navigation after authentication.
 * Called by: the login route.
 */
export function LoginPage() {
  const { state, setSession } = useSession();
  const [search] = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  /** Does: Sends credentials and stores a checked session before navigating. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('');
    const parsed = loginBodySchema.safeParse({
      email: form.get('email'),
      password: form.get('password'),
    });
    if (!parsed.success) {
      setBusy(false);
      setMessage('Enter a valid email and password.');
      return;
    }
    const result = await login(parsed.data.email, parsed.data.password);
    setBusy(false);
    if (result.ok) setSession(result.body.data);
    else
      setMessage(
        result.error.code === 'UNAUTHENTICATED'
          ? 'Email or password could not be verified.'
          : result.error.message
      );
  }
  if (state.status !== 'ready')
    return (
      <AuthFrame title="Sign in">
        <SessionStatus />
      </AuthFrame>
    );
  if (state.session)
    return (
      <Navigate
        to={
          state.session.state === 'password-change-required'
            ? '/account'
            : state.session.state === 'tenant-selection-required'
              ? '/tenants'
              : safeNext(search.get('next'))
        }
        replace
      />
    );
  return (
    <AuthFrame title="Sign in">
      <Stack
        component="form"
        spacing={2}
        onSubmit={event => void submit(event)}
        aria-busy={busy}
      >
        {message && <Alert severity="error">{message}</Alert>}
        <TextField
          name="email"
          label="Email"
          type="email"
          autoComplete="username"
          required
          slotProps={{ htmlInput: { maxLength: 128 } }}
          disabled={busy}
        />
        <TextField
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          slotProps={{ htmlInput: { maxLength: 128 } }}
          disabled={busy}
        />
        <Button type="submit" variant="contained" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </Stack>
    </AuthFrame>
  );
}
