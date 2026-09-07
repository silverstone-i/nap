/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createTheme } from '@mui/material/styles';
import { darkColors, fontSans, lightColors, white } from './tokens.js';

declare module '@mui/material/styles' {
  interface Theme {
    /** Does: Holds mode-specific brand roles. Used by: Shared styles. */
    brand: typeof lightColors;
  }
  interface ThemeOptions {
    /** Does: Supplies brand roles. Used by: Theme construction. */
    brand?: typeof lightColors;
  }
}

/**
 * Does: Creates the active MUI colors, typography, and shared component defaults.
 * Called by: The theme provider when its resolved light or dark mode changes.
 * Why: BRAND.md owns values; the specification keeps gold outside the palette.
 */
export function createAppTheme(mode: 'light' | 'dark') {
  const colors = mode === 'dark' ? darkColors : lightColors;
  return createTheme({
    brand: colors,
    palette: {
      mode,
      primary: { main: colors.navy, contrastText: white },
      background: { default: colors.page, paper: colors.card },
      text: {
        primary: colors.textPrimary,
        secondary: colors.textSecondary,
        disabled: colors.textTertiary,
      },
      divider: colors.border,
      success: { main: colors.success },
      warning: { main: colors.warning },
      error: { main: colors.error },
      info: { main: colors.info },
    },
    shape: { borderRadius: 4 },
    typography: {
      fontFamily: fontSans,
      fontSize: 15,
      body1: { fontSize: 15, lineHeight: 1.55 },
      body2: { fontSize: 13, lineHeight: 1.55 },
      h1: {
        fontSize: 28,
        fontWeight: 600,
        letterSpacing: '-0.02em',
        lineHeight: 1.2,
      },
      button: {
        fontSize: 14,
        fontWeight: 500,
        letterSpacing: '-0.005em',
        lineHeight: 1,
        textTransform: 'none',
      },
      caption: { fontSize: 12, lineHeight: 1.5 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            WebkitFontSmoothing: 'antialiased',
            textRendering: 'optimizeLegibility',
          },
          ':root': { colorScheme: mode },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            padding: '12px 22px',
            '&.Mui-focusVisible': {
              outline: `2px solid ${colors.navyText}`,
              outlineOffset: 3,
            },
          },
          contained: {
            '&.MuiButton-colorPrimary': {
              backgroundColor: colors.navy,
              '&:hover': { backgroundColor: colors.navyHover },
            },
          },
          text: {
            '&.MuiButton-colorPrimary': {
              color: colors.navyText,
              '&:hover': { backgroundColor: colors.subtle },
            },
          },
        },
      },
      MuiLink: {
        styleOverrides: {
          root: {
            color: colors.navyText,
            '&:focus-visible': {
              outline: `2px solid ${colors.navyText}`,
              outlineOffset: 3,
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: colors.border,
            },
            '&.Mui-focused': { boxShadow: `0 0 0 3px ${colors.focusRing}` },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: colors.navyText,
            },
          },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: { '&.Mui-focused': { color: colors.navyText } },
        },
      },
    },
  });
}
