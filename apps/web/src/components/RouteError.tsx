/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { pageStyles } from '../theme/styles.js';
import { Wordmark } from './Wordmark.js';

/**
 * Does: Shows a safe page failure and offers a fresh request for the current URL.
 * Called by: The router after page rendering or a lazy import fails.
 * Why: A full reload retries cached failed imports and stale chunks.
 */
export function RouteError() {
  return (
    <Box component="main" sx={pageStyles}>
      <Wordmark />
      <Typography component="h1" variant="h1">
        We couldn’t load this page.
      </Typography>
      <Button variant="contained" onClick={() => window.location.reload()}>
        Retry
      </Button>
    </Box>
  );
}
