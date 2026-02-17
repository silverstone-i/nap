/**
 * @file MUI theme with light/dark palettes and component overrides per PRD §6.1
 * @module nap-client/theme
 *
 * Centralises repeatable visual styling so component JSX stays clean.
 * Layout dimensions live in config/layoutTokens.js; only TENANT_BAR_HEIGHT
 * is imported here for the Toolbar dense variant.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { createTheme } from '@mui/material/styles';
import { TENANT_BAR_HEIGHT } from './config/layoutTokens.js';

/* ── Shared options (palette-independent) ───────────────────── */

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
    /* ── AppBar ──────────────────────────────────────────────── */
    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: ({ theme }) => ({
          borderBottom: `1px solid ${theme.palette.divider}`,
        }),
      },
    },

    /* ── Toolbar ─────────────────────────────────────────────── */
    MuiToolbar: {
      styleOverrides: {
        dense: { minHeight: TENANT_BAR_HEIGHT },
      },
    },

    /* ── Drawer (sidebar) ────────────────────────────────────── */
    MuiDrawer: {
      styleOverrides: {
        paper: ({ theme }) => ({
          boxSizing: 'border-box',
          backgroundColor: theme.palette.background.sidebar,
          borderRight: `1px solid ${theme.palette.divider}`,
          overflowX: 'hidden',
        }),
      },
    },

    /* ── Card ────────────────────────────────────────────────── */
    MuiCard: {
      defaultProps: { elevation: 1 },
      styleOverrides: { root: { borderRadius: 8 } },
    },

    /* ── Button ──────────────────────────────────────────────── */
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none' },
        sizeSmall: { fontSize: '0.8rem' },
      },
    },

    /* ── ToggleButton ────────────────────────────────────────── */
    MuiToggleButton: {
      styleOverrides: {
        root: { textTransform: 'none' },
        sizeSmall: {
          fontSize: '0.8rem',
          paddingLeft: 12,
          paddingRight: 12,
          paddingTop: 2,
          paddingBottom: 2,
        },
      },
    },

    /* ── ListItemButton (sidebar nav) ────────────────────────── */
    MuiListItemButton: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },

    /* ── ListItemIcon ────────────────────────────────────────── */
    MuiListItemIcon: {
      styleOverrides: {
        root: { minWidth: 36 },
      },
    },

    /* ── Chip ────────────────────────────────────────────────── */
    MuiChip: {
      styleOverrides: {
        sizeSmall: {
          fontWeight: 600,
          fontSize: '0.75rem',
        },
      },
    },

    /* ── Avatar — "header" variant for 32×32 toolbar avatar ─── */
    MuiAvatar: {
      variants: [
        {
          props: { variant: 'header' },
          style: ({ theme }) => ({
            width: 32,
            height: 32,
            cursor: 'pointer',
            backgroundColor: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
            fontSize: '0.8rem',
            fontWeight: 600,
          }),
        },
      ],
    },

    /* ── DialogContent — gap for stacked form fields ──────────── */
    MuiDialogContent: {
      styleOverrides: {
        root: {
          '&.MuiDialogContent-dividers': { paddingTop: 16 },
        },
      },
    },

    /* ── DataGrid — compact density polish ────────────────────── */
    MuiDataGrid: {
      defaultProps: {
        density: 'compact',
        disableColumnMenu: true,
      },
      styleOverrides: {
        root: ({ theme }) => ({
          border: 'none',
          '& .MuiDataGrid-columnHeaders': {
            backgroundColor: theme.palette.background.surface,
            borderBottom: `1px solid ${theme.palette.divider}`,
          },
          '& .MuiDataGrid-cell': {
            borderBottom: `1px solid ${theme.palette.divider}`,
          },
          '& .MuiDataGrid-footerContainer': {
            borderTop: `1px solid ${theme.palette.divider}`,
          },
          /* Archived / deactivated rows — muted text + subtle bg tint */
          '& .row-archived': {
            opacity: 0.5,
          },
        }),
      },
    },
  },
};

/* ── Palettes ───────────────────────────────────────────────── */

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

/* ── Factory ────────────────────────────────────────────────── */

export const createAppTheme = (mode = 'light') => {
  const palette = mode === 'dark' ? darkPalette : lightPalette;
  return createTheme({ ...commonOptions, palette });
};

export default createAppTheme;
