/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { Wordmark } from '../components/Wordmark.js';
import { ThemeSelector } from '../components/ThemeSelector.js';
import type { ReactNode } from 'react';

/**
 * Does: Presents auth forms in a responsive branded page with a single heading.
 * Called by: login and account pages.
 */
export function AuthFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box
      component="main"
      sx={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        px: 2,
        py: { xs: 3, sm: 7 },
      }}
    >
      <Wordmark />
      <Paper
        variant="outlined"
        sx={{ width: '100%', maxWidth: 480, p: { xs: 2, sm: 4 } }}
      >
        <Typography component="h1" variant="h4" sx={{ mb: 3 }}>
          {title}
        </Typography>
        {children}
      </Paper>
      <ThemeSelector />
    </Box>
  );
}
