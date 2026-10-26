/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { PasswordField } from '../components/PasswordField.jsx';
import Typography from '@mui/material/Typography';
import { ApiError } from '../api/client.js';
import { useSession } from '../auth/SessionContext.jsx';
import {
  consumeReturnPath,
  reauthorizeReturnPath,
} from '../auth/returnPath.js';
import { FullPageLoader, NoAccessScreen } from '../auth/StatusScreens.jsx';
import { Wordmark } from '../shell/Wordmark.jsx';

/** I0001-R001: submit credentials, one generic message for any rejection, a throttle message with retry timing. */
export function LoginPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [retryAfterSeconds, setRetryAfterSeconds] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    document.title = 'Sign in · nap.';
    return () => {
      document.title = 'nap.';
    };
  }, []);

  useEffect(() => {
    if (session.status === 'restricted') {
      navigate('/password', { replace: true });
      return;
    }
    if (session.status === 'ready' && session.destination) {
      const stored = reauthorizeReturnPath(consumeReturnPath(), session);
      navigate(stored ?? session.destination, { replace: true });
    }
  }, [session, navigate]);

  // M0001-13: count `Retry-After` down and re-enable sign-in when it ends.
  useEffect(() => {
    if (retryAfterSeconds == null) return undefined;
    const timer = setTimeout(
      () =>
        setRetryAfterSeconds(seconds =>
          seconds == null || seconds <= 1 ? null : seconds - 1
        ),
      1000
    );
    return () => clearTimeout(timer);
  }, [retryAfterSeconds]);

  if (session.status === 'loading' || session.status === 'restricted')
    return <FullPageLoader />;
  if (session.status === 'ready') {
    if (session.destination) return <FullPageLoader />;
    return <NoAccessScreen onLogout={session.logout} />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setRetryAfterSeconds(null);
    setSubmitting(true);
    try {
      await session.login(email, password);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'THROTTLED') {
        setRetryAfterSeconds(err.retryAfterSeconds);
      } else {
        // I0001-R001: one generic message for every rejected credential case.
        setError('Incorrect email or password.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Box
      component="main"
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
      }}
    >
      <Paper
        component="form"
        onSubmit={handleSubmit}
        elevation={0}
        variant="outlined"
        sx={{ p: 4, width: '100%', maxWidth: 380 }}
      >
        <Wordmark fontSize="28px" />
        <Typography
          component="h1"
          variant="h6"
          sx={{ mt: 3, mb: 2 }}
          tabIndex={-1}
        >
          Sign in
        </Typography>
        {/* I0001-R046: one notice, however the session ended. */}
        {session.notice ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            Session ended. Sign in again.
          </Alert>
        ) : null}
        {retryAfterSeconds != null ? (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Too many attempts. Try again in {retryAfterSeconds} second
            {retryAfterSeconds === 1 ? '' : 's'}.
          </Alert>
        ) : null}
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Stack spacing={2}>
          <TextField
            label="Email"
            type="email"
            name="email"
            value={email}
            onChange={event => {
              setEmail(event.target.value);
              // A lock may belong to the mistyped email alone (M0001-13 pair
              // key), so a corrected email gets to try straight away.
              setRetryAfterSeconds(null);
            }}
            autoComplete="username"
            autoFocus
            required
            fullWidth
          />
          <PasswordField
            label="Password"
            name="password"
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            fullWidth
          />
          <Button
            type="submit"
            variant="contained"
            disabled={submitting || retryAfterSeconds != null}
            fullWidth
          >
            Sign in
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
