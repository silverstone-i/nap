/**
 * @file Semantic design tokens — single source of truth for visual values
 * @module nap-client/config/tokens
 *
 * Mode-independent values are exported directly for use in layout tokens
 * and static contexts. Mode-dependent values (borders, surfaces, shadows)
 * are created via createTokens(mode) and consumed by the theme factory.
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

/* ── Mode-independent tokens ─────────────────────────────────── */

export const density = {
  sectionGap: 24,
  stackGap: 16,
  fieldGap: 16,
  controlHeight: 36,
  controlHeightSm: 32,
  tableRowHeight: 44,
  tableCellPadY: 10,
  tableCellPadX: 14,
};

export const radius = {
  card: 8,
  modal: 8,
  control: 6,
  chip: 999,
};

export const typographyTokens = {
  pageTitle: { fontSize: 22, fontWeight: 600, lineHeight: 1.2 },
  sectionLabel: { fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' },
  breadcrumb: { fontSize: 12, fontWeight: 500 },
  tableHead: { fontSize: 12, fontWeight: 600, letterSpacing: '0.02em' },
  body: { fontSize: 14, fontWeight: 500 },
};

export const motion = {
  fast: '120ms ease',
};

/* ── Mode-dependent tokens ───────────────────────────────────── */

export const createTokens = (mode = 'dark') => {
  const dark = mode === 'dark';

  return {
    density,
    radius,
    typography: typographyTokens,
    motion,

    border: {
      width: 1,
      subtle: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)',
      hover: dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.12)',
      strong: dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.18)',
    },

    surface: {
      hoverOverlay: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
      activeOverlay: dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
      selectedOverlay: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
      headerOverlay: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
      scrim: 'rgba(0,0,0,0.60)',
    },

    shadow: {
      modal: '0 4px 12px rgba(0,0,0,0.25)',
      card: dark ? '0 2px 8px rgba(0,0,0,0.18)' : '0 2px 8px rgba(0,0,0,0.08)',
      none: 'none',
    },
  };
};
