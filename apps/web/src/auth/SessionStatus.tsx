/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import { useSession } from './session.js';

/**
 * Does: Displays a session lookup spinner or a retryable error.
 * Called by: auth pages while session state is not ready.
 */
export function SessionStatus() {
  const { state, reload } = useSession();
  if (state.status === 'error')
    return (
      <Alert severity="error" action={<Button onClick={reload}>Retry</Button>}>
        {state.message}
      </Alert>
    );
  return <CircularProgress aria-label="Loading session" />;
}
