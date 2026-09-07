/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { pageStyles } from '../theme/styles.js';
import { Wordmark } from './Wordmark.js';

/**
 * Does: Announces page loading while the route module is being fetched.
 * Called by: The router during initial lazy-page loading.
 */
export function RouteLoading() {
  return (
    <Box component="main" sx={pageStyles}>
      <Wordmark />
      <Typography role="status">Loading…</Typography>
    </Box>
  );
}
