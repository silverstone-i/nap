/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createTheme } from '@mui/material/styles';
import { BRAND_TOKENS, FONT_MONO, FONT_SANS } from './tokens.js';

/**
 * Build the MUI theme for a resolved light/dark mode, per BRAND.md.
 *
 * Gold is reserved for the wordmark dot and the one-per-screen active-nav
 * indicator (BRAND.md "Gold discipline") — it never appears here as a
 * palette `primary`/`secondary`, so no component can pick it up by default.
 * @param {'light'|'dark'} mode
 * @returns {import('@mui/material/styles').Theme}
 */
export function buildTheme(mode) {
  const t = BRAND_TOKENS[mode];
  return createTheme({
    palette: {
      mode,
      primary: { main: t.navy, dark: t.navyHover, contrastText: '#FFFFFF' },
      text: {
        primary: t.textPrimary,
        secondary: t.textSecondary,
        disabled: t.textTertiary,
      },
      background: { default: t.page, paper: t.card },
      divider: t.border,
      success: { main: t.success },
      warning: { main: t.warning, dark: t.warningText },
      error: { main: t.error },
      info: { main: t.info, dark: t.infoText },
    },
    shape: { borderRadius: 4 },
    typography: {
      fontFamily: FONT_SANS,
      fontSize: 15,
      body1: { fontSize: '15px', lineHeight: 1.55 },
      body2: { fontSize: '13px', lineHeight: 1.55 },
      button: {
        fontSize: '14px',
        fontWeight: 500,
        letterSpacing: '-0.005em',
        textTransform: 'none',
      },
      h1: {
        fontSize: '28px',
        fontWeight: 600,
        letterSpacing: '-0.02em',
        lineHeight: 1.2,
      },
    },
    custom: {
      fontMono: FONT_MONO,
      navyText: t.navyText,
      subtle: t.subtle,
      gold: t.gold,
      borderStrong: t.borderStrong,
      focusRing: t.focusRing,
      focusRingError: t.focusRingError,
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            backgroundColor: t.page,
            color: t.textPrimary,
          },
        },
      },
      MuiButton: {
        styleOverrides: {
          root: { borderRadius: 4 },
          containedPrimary: {
            '&:hover': { backgroundColor: t.navyHover },
          },
          outlined: {
            color: t.navyText,
            borderColor: t.borderStrong,
          },
        },
      },
      MuiButtonBase: {
        defaultProps: { disableRipple: false },
        styleOverrides: {
          root: {
            '&.Mui-focusVisible': {
              boxShadow: `0 0 0 3px ${t.focusRing}`,
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: t.navyText,
              boxShadow: `0 0 0 3px ${t.focusRing}`,
            },
            '&.Mui-error.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: t.error,
              boxShadow: `0 0 0 3px ${t.focusRingError}`,
            },
          },
        },
      },
      MuiDataGrid: {
        styleOverrides: {
          root: {
            border: `1px solid ${t.border}`,
            '--DataGrid-rowBorderColor': t.border,
          },
          columnHeaders: {
            backgroundColor: t.page,
            fontSize: '11px',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          },
          cell: { fontSize: '13px' },
          row: {
            '&:hover': { backgroundColor: t.page },
            '&.Mui-selected': { backgroundColor: t.subtle },
          },
        },
      },
    },
  });
}
