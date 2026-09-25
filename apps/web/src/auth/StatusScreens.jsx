/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

/** Full-page loading state shown while the access context resolves (I0001-R004, R021). */
export function FullPageLoader() {
  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}
    >
      <CircularProgress aria-label="Loading" />
    </Box>
  );
}

/** Explicit, retryable error state — never falls back to silently treating a failure as anonymous (R021). */
export function FullPageError({ onRetry }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        p: 3,
      }}
    >
      <Stack spacing={2} alignItems="center" sx={{ maxWidth: 420 }}>
        <Alert severity="error" sx={{ width: '100%' }}>
          Something went wrong loading your account. Please try again.
        </Alert>
        <Button variant="outlined" onClick={onRetry}>
          Retry
        </Button>
      </Stack>
    </Box>
  );
}

/**
 * An authenticated caller with neither a tenant nor platform entry point —
 * fail closed rather than render a route with nothing to enter.
 */
export function NoAccessScreen({ onLogout }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        p: 3,
      }}
    >
      <Stack spacing={2} alignItems="center" sx={{ maxWidth: 420 }}>
        <Typography component="h1" variant="h6" tabIndex={-1}>
          No application access
        </Typography>
        <Typography variant="body2" color="text.secondary" textAlign="center">
          Your account is not yet assigned to a tenant or platform role. Contact
          an administrator if you believe this is a mistake.
        </Typography>
        <Button variant="outlined" onClick={onLogout}>
          Log out
        </Button>
      </Stack>
    </Box>
  );
}

/** A specific tenant is no longer selectable — I0001-R008/AC04: show an actionable error, never the tenant's content. */
export function TenantUnavailableScreen({ onChooseTenant }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        p: 3,
      }}
    >
      <Stack spacing={2} alignItems="center" sx={{ maxWidth: 420 }}>
        <Alert severity="warning" sx={{ width: '100%' }}>
          This tenant is no longer available to you.
        </Alert>
        <Button variant="outlined" onClick={onChooseTenant}>
          Choose a tenant
        </Button>
      </Stack>
    </Box>
  );
}
