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
import Typography from '@mui/material/Typography';
import { ApiError } from '../api/client.js';
import { useSession } from '../auth/SessionContext.jsx';
import { Wordmark } from '../shell/Wordmark.jsx';

/**
 * `/password` — reachable both as the forced flow (a restricted session
 * must replace its password before anything else) and voluntarily from the
 * profile menu (I0001-R002).
 */
export function PasswordPage() {
  const session = useSession();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const forced = session.status === 'restricted';

  useEffect(() => {
    if (done && session.status === 'ready') {
      navigate(session.destination ?? '/login', { replace: true });
    }
  }, [done, session, navigate]);

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await session.changePassword(currentPassword, newPassword);
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_INPUT')
        setError('Enter your current password and a new password.');
      else if (err instanceof ApiError && err.code === 'UNAUTHENTICATED')
        setError('Current password is incorrect.');
      else if (err instanceof ApiError && err.code === 'FORBIDDEN')
        setError('This account can no longer change its password.');
      else setError('Something went wrong. Please try again.');
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
          sx={{ mt: 3, mb: 1 }}
          tabIndex={-1}
        >
          Change password
        </Typography>
        {forced ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            You must change your password before continuing.
          </Alert>
        ) : null}
        {error ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <Stack spacing={2}>
          <TextField
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={event => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            autoFocus
            required
            fullWidth
          />
          <TextField
            label="New password"
            type="password"
            value={newPassword}
            onChange={event => setNewPassword(event.target.value)}
            autoComplete="new-password"
            required
            fullWidth
          />
          <Button
            type="submit"
            variant="contained"
            disabled={submitting}
            fullWidth
          >
            Change password
          </Button>
          <Button variant="text" onClick={() => session.logout()} fullWidth>
            Logout
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
