/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import Box from '@mui/material/Box';
import Link from '@mui/material/Link';
import Typography from '@mui/material/Typography';
import { Wordmark } from '../components/Wordmark.js';
import { pageStyles } from '../theme/styles.js';

/**
 * Does: Identifies an unknown page and provides a path back to the entry.
 * Called by: The router when no implemented URL matches.
 */
export function NotFoundPage() {
  return (
    <Box component="main" sx={pageStyles}>
      <Wordmark />
      <Typography component="h1" variant="h1">
        Page not found
      </Typography>
      <Link href="/">Back to home</Link>
    </Box>
  );
}
