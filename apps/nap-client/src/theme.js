/**
 * @file MUI theme with light and dark mode palettes
 * @module nap-client/theme
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { createTheme } from '@mui/material/styles';

const commonOptions = {
  typography: {
    fontFamily: 'Roboto, sans-serif',
    h1: { fontSize: '2rem', fontWeight: 500 },
    h2: { fontSize: '1.5rem', fontWeight: 500 },
    h3: { fontSize: '1.25rem', fontWeight: 500 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiCard: {
      defaultProps: { elevation: 1 },
      styleOverrides: { root: { borderRadius: 8 } },
    },
    MuiButton: {
      styleOverrides: { root: { textTransform: 'none' } },
    },
  },
};

const lightPalette = {
  mode: 'light',
  primary: { main: '#003e6b', contrastText: '#ffffff' },
  secondary: { main: '#f79c3c', contrastText: '#ffffff' },
  divider: 'rgba(17, 24, 39, 0.12)',
  background: {
    default: '#f5f5f5',
    paper: '#ffffff',
    sidebar: '#f8f9fb',
    header: '#ffffff',
    surface: '#fdfdfd',
  },
  success: { main: '#4caf50' },
  warning: { main: '#ffa000' },
  error: { main: '#d32f2f' },
  text: { primary: '#212121', secondary: '#424242' },
};

const darkPalette = {
  mode: 'dark',
  primary: { main: '#f6b21b', contrastText: '#0D1117' },
  secondary: { main: '#0ea5e9', contrastText: '#0D1117' },
  divider: 'rgba(230, 237, 243, 0.08)',
  background: {
    default: '#080B10',
    paper: '#161B22',
    sidebar: '#0D1117',
    header: '#161B22',
    surface: '#1C2128',
  },
  success: { main: '#58d68d' },
  warning: { main: '#f6b21b' },
  error: { main: '#ef5350' },
  text: { primary: '#e6edf3', secondary: '#9ea6b7' },
};

export const createAppTheme = (mode = 'light') => {
  const palette = mode === 'dark' ? darkPalette : lightPalette;
  return createTheme({ ...commonOptions, palette });
};

export default createAppTheme;
