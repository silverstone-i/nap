/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { ThemeSelector } from '../components/ThemeSelector.js';
import { Wordmark } from '../components/Wordmark.js';
import { contentStyles, pageStyles } from '../theme/styles.js';

/**
 * Does: Presents the branded entry while the application is under development.
 * Called by: The root route after its page chunk loads.
 */
export function HoldingPage() {
  return (
    <Box component="main" sx={pageStyles}>
      <Wordmark />
      <Typography component="h1" variant="h1" sx={contentStyles}>
        Project-first accounting &amp; ERP
      </Typography>
      <Typography color="textSecondary">
        Application under development
      </Typography>
      <ThemeSelector />
    </Box>
  );
}
