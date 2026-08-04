/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createTheme } from '@mui/material/styles';
import { light, dark, fontSans, type ModeTokens } from './tokens';

// The active token set rides along on the theme so components can reach
// values with no palette slot (subtle, navyText, tints) without importing a
// mode-specific set.
declare module '@mui/material/styles' {
  interface Theme {
    tokens: ModeTokens;
  }
  interface ThemeOptions {
    tokens?: ModeTokens;
  }
}

/**
 * Per-mode themes mapping BRAND.md tokens onto MUI. Gold is intentionally
 * absent from both palettes so it cannot leak via color="secondary" or theme
 * defaults.
 */
function buildTheme(mode: 'light' | 'dark') {
  const t = mode === 'light' ? light : dark;
  return createTheme({
    palette: {
      mode,
      // t.navy is the fill navy — per-mode so white-on-navy clears AA.
      primary: { main: t.navy, contrastText: '#FFFFFF' },
      background: { default: t.page, paper: t.card },
      text: {
        primary: t.textPrimary,
        secondary: t.textSecondary,
        disabled: t.textTertiary,
      },
      divider: t.border,
      success: { main: t.success },
      warning: { main: t.warning },
      error: { main: t.error },
      info: { main: t.info },
    },
    typography: {
      fontFamily: fontSans,
      body1: { fontSize: 15, lineHeight: 1.55 },
      body2: { fontSize: 13, lineHeight: 1.5 },
      button: { fontSize: 14, fontWeight: 500, textTransform: 'none' },
    },
    shape: { borderRadius: 4 },
    components: {
      MuiButton: {
        defaultProps: { disableElevation: true },
      },
    },
    tokens: t,
  });
}

export const lightTheme = buildTheme('light');
export const darkTheme = buildTheme('dark');
