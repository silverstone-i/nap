/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import Box from '@mui/material/Box';
import { wordmarkDotStyles, wordmarkStyles } from '../theme/styles.js';

/**
 * Does: Renders the accessible NAP wordmark with its decorative square period.
 * Called by: Standalone entry and route-state views.
 */
export function Wordmark() {
  return (
    <Box component="span" role="img" aria-label="nap." sx={wordmarkStyles}>
      <span aria-hidden="true">nap</span>
      <Box component="span" aria-hidden="true" sx={wordmarkDotStyles} />
    </Box>
  );
}
