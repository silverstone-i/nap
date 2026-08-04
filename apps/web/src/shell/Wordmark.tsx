/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import Box from '@mui/material/Box';
import { gold, fontSans } from '../theme/tokens';

/**
 * The nap wordmark per BRAND.md — HTML/CSS, never an image. The dot is gold
 * use #1 of the four approved uses.
 */
export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <Box
      component="span"
      sx={{
        fontFamily: fontSans,
        fontWeight: 500,
        fontSize: size,
        color: theme => theme.tokens.navyText,
        display: 'inline-flex',
        alignItems: 'baseline',
        lineHeight: 1,
        letterSpacing: '-0.02em',
        userSelect: 'none',
      }}
    >
      nap
      <Box
        component="span"
        sx={{
          display: 'inline-block',
          background: gold,
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
