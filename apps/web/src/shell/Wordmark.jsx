/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';

/**
 * The `nap.` wordmark, per BRAND.md: Inter Medium (never Bold), the gold
 * dot as the period, `navy-text` foreground. Built as text, not an image,
 * so it scales crisply and follows theme mode.
 * @param {{fontSize?: string|number}} [props]
 * @returns {JSX.Element}
 */
export function Wordmark({ fontSize = '20px' }) {
  const theme = useTheme();
  return (
    <Box
      component="span"
      sx={{
        fontFamily: theme.typography.fontFamily,
        fontWeight: 500,
        color: theme.custom.navyText,
        display: 'inline-flex',
        alignItems: 'baseline',
        lineHeight: 1,
        letterSpacing: '-0.02em',
        fontSize,
      }}
    >
      nap
      <Box
        component="span"
        sx={{
          display: 'inline-block',
          background: theme.custom.gold,
          alignSelf: 'flex-end',
          width: '0.19em',
          height: '0.19em',
          ml: '0.06em',
          mb: '0.06em',
        }}
      />
    </Box>
  );
}
