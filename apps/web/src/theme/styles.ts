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

/** Does: Places the product frame below its header. Used by: the shell on desktop and mobile. */
export const shellBodyStyles: SxProps<Theme> = {
  display: 'flex',
  flex: 1,
  minHeight: 0,
};
/** Does: Keeps product content flexible and readable. Used by: the shell main landmark. */
export const shellContentStyles: SxProps<Theme> = {
  flex: 1,
  minWidth: 0,
  overflow: 'auto',
  p: { xs: 2, md: 4 },
};

/**
 * Does: Arranges management titles, filters, and actions above the scrollable content.
 * Used by: Tenants and Portal users during page rendering.
 */
export const managementHeaderStyles: SxProps<Theme> = {
  gap: 2,
  flexWrap: 'wrap',
  py: 2,
  borderBottom: 1,
  borderColor: 'divider',
  bgcolor: 'background.paper',
  flexShrink: 0,
};
/**
 * Does: Gives management content the remaining space below its toolbar.
 * Used by: Management lists and record pages.
 */
export const managementContentStyles: SxProps<Theme> = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  flex: 1,
  minHeight: 0,
  overflow: 'auto',
  p: 2,
};
/**
 * Does: Sizes management grids within their working area.
 * Used by: Tenant and portal-user lists.
 */
export const managementGridStyles: SxProps<Theme> = {
  flex: 1,
  minHeight: 300,
  width: '100%',
};
/**
 * Does: Limits form width for readable record entry.
 * Used by: Management creation and tenant action forms.
 */
export const managementFormStyles: SxProps<Theme> = {
  width: '100%',
  maxWidth: 640,
  alignSelf: 'flex-start',
};
/** Does: Sizes the navigation rail and its anchored branding. Used by: both shell drawer variants. */
export function railStyles(collapsed: boolean): SxProps<Theme> {
  return {
    width: collapsed ? 80 : 240,
    flexShrink: 0,
    '& .MuiDrawer-paper': {
      width: collapsed ? 80 : 240,
      boxSizing: 'border-box',
      position: { lg: 'relative' },
      minHeight: '100%',
      display: 'flex',
    },
  };
}
/** Does: Marks active navigation with the approved gold rail indicator. Used by: shell destination links. */
export const activeNavigationStyles: SxProps<Theme> = {
  gap: 1.5,
  '&.Mui-selected': { borderLeft: `3px solid ${gold}` },
};
/** Does: Reveals the keyboard skip link on focus. Used by: the product shell. */
export const skipLinkStyles: SxProps<Theme> = {
  position: 'absolute',
  left: -10000,
  '&:focus': {
    left: 8,
    top: 8,
    zIndex: 1500,
    bgcolor: 'background.paper',
    p: 2,
  },
};
/** Does: Keeps small product branding at the rail bottom. Used by: shell navigation. */
export const railBrandStyles: SxProps<Theme> = {
  mt: 'auto',
  p: 2,
  '& [role="img"]': { fontSize: 28 },
};
