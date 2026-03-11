/**
 * @file MUI theme driven by semantic design tokens (config/tokens.js)
 * @module nap-client/theme
 *
 * Centralises repeatable visual styling so component JSX stays clean.
 * Token-first: every magic number traces back to tokens.js.
 * Layout dimensions live in config/layoutTokens.js.
 *
 * Copyright (c) 2025 – present NapSoft LLC. All rights reserved.
 */

import { alpha, createTheme } from '@mui/material/styles';
import { createTokens } from './config/tokens.js';
import { TENANT_BAR_HEIGHT } from './config/layoutTokens.js';

/* ── Options builder (token-aware) ─────────────────────────── */

const buildOptions = (t) => ({
  typography: {
    fontFamily: 'Roboto, sans-serif',
    fontSize: t.typography.body.fontSize,
    h1: { fontSize: '2rem', fontWeight: 500 },
    h2: { fontSize: '1.5rem', fontWeight: 500 },
    h3: { fontSize: '1.25rem', fontWeight: 500 },
    button: { textTransform: 'none', fontWeight: 600 },
    overline: {
      fontSize: t.typography.sectionLabel.fontSize,
      fontWeight: t.typography.sectionLabel.fontWeight,
      textTransform: t.typography.sectionLabel.textTransform,
      letterSpacing: t.typography.sectionLabel.letterSpacing,
      lineHeight: 1.5,
    },
  },

  shape: { borderRadius: t.radius.control },

  components: {
    /* ── Global / Baseline ─────────────────────────────────── */

    MuiCssBaseline: {
      styleOverrides: {
        body: {
          WebkitFontSmoothing: 'antialiased',
          MozOsxFontSmoothing: 'grayscale',
        },
      },
    },

    /* ── Paper / Surfaces ──────────────────────────────────── */

    MuiPaper: {
      styleOverrides: {
        root: {
          border: `${t.border.width}px solid ${t.border.subtle}`,
          boxShadow: t.shadow.card,
          borderRadius: t.radius.card,
          backgroundImage: 'none',
        },
      },
    },

    MuiAppBar: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: 'none',
          borderBottom: `${t.border.width}px solid ${t.border.subtle}`,
          backgroundImage: 'none',
          boxShadow: t.shadow.none,
        },
      },
    },

    MuiToolbar: {
      styleOverrides: {
        dense: { minHeight: TENANT_BAR_HEIGHT },
      },
    },

    MuiDrawer: {
      styleOverrides: {
        paper: ({ theme }) => ({
          boxSizing: 'border-box',
          backgroundColor: theme.palette.background.sidebar,
          border: 'none',
          borderRight: `${t.border.width}px solid ${t.border.subtle}`,
          overflowX: 'hidden',
          backgroundImage: 'none',
        }),
      },
    },

    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { borderRadius: t.radius.card },
      },
    },

    /* ── Dialogs ───────────────────────────────────────────── */

    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: t.radius.modal,
          border: `${t.border.width}px solid ${t.border.subtle}`,
          boxShadow: t.shadow.modal,
          backgroundImage: 'none',
        },
      },
    },

    MuiDialogTitle: {
      styleOverrides: {
        root: ({ theme }) => ({
          padding: 16,
          fontSize: 18,
          fontWeight: 650,
          borderBottom: `${t.border.width}px solid ${t.border.subtle}`,
          position: 'sticky',
          top: 0,
          zIndex: 1,
          backgroundColor: theme.palette.background.paper,
        }),
      },
    },

    MuiDialogContent: {
      styleOverrides: {
        root: { padding: 16 },
      },
    },

    MuiDialogActions: {
      styleOverrides: {
        root: {
          padding: 16,
          borderTop: `${t.border.width}px solid ${t.border.subtle}`,
          gap: 10,
        },
      },
    },

    /* ── Buttons ───────────────────────────────────────────── */

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: t.radius.control,
          minHeight: t.density.controlHeight,
          paddingTop: 8,
          paddingBottom: 8,
          transition: `all ${t.motion.fast}`,
          '&.Mui-disabled': { opacity: 0.35 },
        },
        sizeSmall: { fontSize: '0.8rem', minHeight: t.density.controlHeightSm },
        containedPrimary: {
          boxShadow: t.shadow.none,
          '&:hover': { filter: 'brightness(1.03)' },
          '&:active': { filter: 'brightness(0.98)' },
        },
        outlined: {
          borderColor: t.border.subtle,
          '&:hover': {
            borderColor: t.border.hover,
            backgroundColor: t.surface.hoverOverlay,
          },
        },
        text: {
          '&:hover': { backgroundColor: t.surface.hoverOverlay },
        },
      },
    },

    MuiToggleButton: {
      styleOverrides: {
        root: { textTransform: 'none', transition: `all ${t.motion.fast}` },
        sizeSmall: {
          fontSize: '0.8rem',
          paddingLeft: 12,
          paddingRight: 12,
          paddingTop: 2,
          paddingBottom: 2,
        },
      },
    },

    /* ── Inputs ────────────────────────────────────────────── */

    MuiTextField: {
      defaultProps: { size: 'small', variant: 'outlined' },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: t.radius.control,
          minHeight: t.density.controlHeight,
          transition: `all ${t.motion.fast}`,
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: t.border.hover,
          },
        },
        notchedOutline: {
          borderColor: t.border.subtle,
        },
        input: ({ theme }) => ({
          paddingTop: 8,
          paddingBottom: 8,
          '&:-webkit-autofill, &:-webkit-autofill:hover, &:-webkit-autofill:focus': {
            WebkitBoxShadow: `0 0 0 100px ${theme.palette.background.paper} inset`,
            WebkitTextFillColor: theme.palette.text.primary,
            caretColor: theme.palette.text.primary,
            borderRadius: 'inherit',
          },
        }),
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        root: ({ theme }) => ({
          color: theme.palette.text.secondary,
        }),
      },
    },

    MuiFormHelperText: {
      styleOverrides: {
        root: { marginLeft: 0, marginRight: 0 },
      },
    },

    /* ── Table (plain MUI) ─────────────────────────────────── */

    MuiTableContainer: {
      styleOverrides: {
        root: {
          borderRadius: t.radius.card,
          border: `${t.border.width}px solid ${t.border.subtle}`,
        },
      },
    },

    MuiTableHead: {
      styleOverrides: {
        root: { backgroundColor: t.surface.headerOverlay },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: `${t.border.width}px solid ${t.border.subtle}`,
          paddingTop: t.density.tableCellPadY,
          paddingBottom: t.density.tableCellPadY,
          paddingLeft: t.density.tableCellPadX,
          paddingRight: t.density.tableCellPadX,
        },
        head: ({ theme }) => ({
          fontSize: t.typography.tableHead.fontSize,
          fontWeight: t.typography.tableHead.fontWeight,
          letterSpacing: t.typography.tableHead.letterSpacing,
          color: theme.palette.text.secondary,
        }),
      },
    },

    MuiTableRow: {
      styleOverrides: {
        root: {
          height: t.density.tableRowHeight,
          transition: `background-color ${t.motion.fast}`,
          '&:hover': { backgroundColor: t.surface.hoverOverlay },
          '&.Mui-selected': { backgroundColor: t.surface.selectedOverlay },
          '&.Mui-selected:hover': { backgroundColor: t.surface.activeOverlay },
        },
      },
    },

    /* ── DataGrid (MUI X v6) ───────────────────────────────── */

    MuiDataGrid: {
      defaultProps: {
        density: 'compact',
        rowHeight: t.density.tableRowHeight,
        columnHeaderHeight: 40,
        disableColumnMenu: false,
      },
      styleOverrides: {
        root: {
          border: `1px solid ${t.border.subtle}`,
          borderRadius: t.radius.card,
          backgroundColor: 'transparent',
          fontSize: t.typography.body.fontSize,
          /* focus ring precision */
          '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': {
            outline: `1px solid ${t.border.strong}`,
            outlineOffset: -1,
          },
          '& .MuiDataGrid-columnHeader:focus, & .MuiDataGrid-columnHeader:focus-within': {
            outline: `1px solid ${t.border.strong}`,
            outlineOffset: -1,
          },
          /* app-specific archived row */
          '& .row-archived': { opacity: 0.5 },
          /* row-actions kebab — hidden by default, visible on hover */
          '& .row-actions-cell .MuiIconButton-root': { visibility: 'hidden' },
          '& .MuiDataGrid-row:hover .row-actions-cell .MuiIconButton-root': { visibility: 'visible' },
          '@media (hover: none)': {
            '& .row-actions-cell .MuiIconButton-root': { visibility: 'visible' },
          },
        },
        withBorderColor: { borderColor: t.border.subtle },
        columnHeaders: {
          backgroundColor: t.surface.headerOverlay,
          borderBottom: `1px solid ${t.border.subtle}`,
        },
        columnHeader: ({ theme }) => ({
          fontSize: t.typography.tableHead.fontSize,
          fontWeight: t.typography.tableHead.fontWeight,
          letterSpacing: t.typography.tableHead.letterSpacing,
          color: theme.palette.text.secondary,
        }),
        columnSeparator: { color: t.border.subtle },
        row: ({ theme }) => ({
          borderBottom: `1px solid ${t.border.subtle}`,
          transition: `background-color ${t.motion.fast}`,
          '&:hover': { backgroundColor: t.surface.hoverOverlay },
          '&.Mui-selected': { backgroundColor: alpha(theme.palette.primary.main, 0.08) },
          '&.Mui-selected:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.12) },
        }),
        cell: {
          borderBottom: 'none',
          paddingLeft: t.density.tableCellPadX,
          paddingRight: t.density.tableCellPadX,
        },
        toolbarContainer: {
          padding: '8px 14px',
          gap: 8,
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `1px solid ${t.border.subtle}`,
          '& .nap-list-toolbar-actions': {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          },
        },
        checkboxInput: { padding: 6 },
        footerContainer: {
          borderTop: `1px solid ${t.border.subtle}`,
          backgroundColor: 'transparent',
        },
      },
    },

    /* ── Checkbox ──────────────────────────────────────────── */

    MuiCheckbox: {
      styleOverrides: {
        root: { padding: 8, transition: `all ${t.motion.fast}` },
      },
    },

    /* ── Lists / Sidebar nav ───────────────────────────────── */

    MuiListItemButton: {
      styleOverrides: {
        root: ({ theme }) => ({
          borderRadius: 8,
          transition: `all ${t.motion.fast}`,
          '&:hover': { backgroundColor: t.surface.hoverOverlay },
          '&.Mui-selected': {
            backgroundColor: 'transparent',
            position: 'relative',
            '&::before': {
              content: '""',
              position: 'absolute',
              left: 0,
              top: 6,
              bottom: 6,
              width: 2,
              borderRadius: 2,
              backgroundColor: theme.palette.primary.main,
            },
            '&:hover': { backgroundColor: t.surface.hoverOverlay },
          },
        }),
      },
    },

    MuiListItemIcon: {
      styleOverrides: {
        root: {
          minWidth: 36,
          opacity: 0.62,
          transition: `opacity ${t.motion.fast}, color ${t.motion.fast}`,
        },
      },
    },

    MuiListItemText: {
      styleOverrides: {
        primary: { fontSize: 14, fontWeight: 550 },
      },
    },

    /* ── Chips ─────────────────────────────────────────────── */

    MuiChip: {
      styleOverrides: {
        sizeSmall: { fontWeight: 600, fontSize: '0.75rem' },
      },
    },

    /* ── Avatar ────────────────────────────────────────────── */

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
  },
});

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
  const t = createTokens(mode);
  return createTheme({ ...buildOptions(t), palette });
};

export default createAppTheme;
