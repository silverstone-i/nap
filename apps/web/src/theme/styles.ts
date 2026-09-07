/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { SxProps, Theme } from '@mui/material/styles';
import { fontSans, gold } from './tokens.js';

/**
 * Does: Centers standalone page content while allowing short screens to scroll.
 * Used by: Entry, loading, error, and unknown-page views.
 */
export const pageStyles: SxProps<Theme> = {
  minHeight: '100dvh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  px: { xs: 3, sm: 5 },
  py: 6,
  gap: 3,
  textAlign: 'center',
  '& > *': { maxWidth: '100%' },
};

/**
 * Does: Bounds the headline and supporting copy on wide screens.
 * Used by: Standalone page headings.
 */
export const contentStyles: SxProps<Theme> = { width: '100%', maxWidth: 560 };

/**
 * Does: Sets a comfortable width and separation for the theme selection field.
 * Used by: The shared theme selector.
 */
export const selectorStyles: SxProps<Theme> = { width: 168, mt: 2 };

/**
 * Does: Draws the HTML wordmark using the active navy foreground.
 * Used by: Wordmark on all standalone views.
 */
export const wordmarkStyles: SxProps<Theme> = theme => ({
  fontFamily: fontSans,
  fontSize: { xs: 64, sm: 80 },
  fontWeight: 500,
  color: theme.brand.navyText,
  display: 'inline-flex',
  alignItems: 'baseline',
  lineHeight: 1,
  letterSpacing: '-0.02em',
});

/**
 * Does: Draws the proportional square period specified in BRAND.md.
 * Used by: Wordmark as its sole gold accent.
 */
export const wordmarkDotStyles: SxProps<Theme> = {
  display: 'inline-block',
  backgroundColor: gold,
  alignSelf: 'flex-end',
  width: '0.19em',
  height: '0.19em',
  ml: '0.06em',
  mb: '0.06em',
};
