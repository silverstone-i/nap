/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Brand tokens mirroring docs/branding/BRAND.md. This file is the single
 * source of color and font values for the web app — no hex literals in
 * components (see docs/RULES/web-shell.md). Mode-varying colors live in the
 * `light` and `dark` sets; components never import a set directly — they
 * read the active one from the MUI theme (palette slots or `theme.tokens`).
 */

// Mode-invariant brand values. Gold is deliberately excluded from the MUI
// palette; import it only for the three approved uses (wordmark dot,
// active-nav bar, final-total rule). Same hex in both modes.
export const gold = '#F4B000';

// Typography
export const fontSans =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif";
export const fontMono = "'JetBrains Mono', 'SF Mono', Menlo, monospace";

export interface ModeTokens {
  // Brand — two navy tokens; identical in light, divergent in dark.
  /** Fill: navy as a background with white content on top. */
  navy: string;
  /** Foreground: navy as text/border/icon sitting on a surface. */
  navyText: string;

  // Surfaces
  page: string;
  card: string;
  subtle: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;

  // Borders
  border: string;
  borderStrong: string;

  // Semantic
  success: string;
  warning: string;
  warningText: string;
  error: string;
  info: string;

  // Semantic tints
  successTintBg: string;
  successTintBorder: string;
  warningTintBg: string;
  warningTintBorder: string;
  errorTintBg: string;
  errorTintBorder: string;
  infoTintBg: string;
  infoTintBorder: string;
}

export const light: ModeTokens = {
  navy: '#2F3E52',
  navyText: '#2F3E52',

  page: '#FAFAF7',
  card: '#FFFFFF',
  subtle: '#F4F5F2',

  textPrimary: '#1A2332',
  textSecondary: '#5A6475',
  textTertiary: '#677082',

  border: '#898F9D',
  borderStrong: '#6B7280',

  success: '#15803D',
  warning: '#E67E22',
  warningText: '#B45309',
  error: '#B91C1C',
  info: '#2563EB',

  // Fixed pastels — gentle washes on white/cream surfaces.
  successTintBg: '#F0FDF4',
  successTintBorder: '#BBF7D0',
  warningTintBg: '#FFF7ED',
  warningTintBorder: '#FED7AA',
  errorTintBg: '#FEF2F2',
  errorTintBorder: '#FECACA',
  infoTintBg: '#EFF6FF',
  infoTintBorder: '#BFDBFE',
};

export const dark: ModeTokens = {
  // Two-token navy: the fill stays dark enough that white-on-navy clears AA
  // (5.51:1); the foreground lifts so navy-on-card clears AA (5.17:1). One
  // value can't satisfy both roles — see BRAND.md "Fill vs foreground".
  navy: '#4F6B8C',
  navyText: '#698BB8',

  page: '#0B0F14',
  card: '#131923',
  subtle: '#1A212D',

  textPrimary: '#E8ECF2',
  textSecondary: '#9AA4B4',
  textTertiary: '#818B9C',

  border: '#636C7C',
  borderStrong: '#8B95A5',

  success: '#22C55E',
  warning: '#F59E0B',
  warningText: '#F59E0B', // BRAND.md's #B45309 text variant is light-only
  error: '#EF4444',
  info: '#60A5FA',

  // Alpha-derived from each semantic main — a faint translucent wash on the
  // dark card rather than a pastel flash (BRAND.md "Why two patterns").
  successTintBg: 'rgba(34, 197, 94, 0.12)',
  successTintBorder: 'rgba(34, 197, 94, 0.32)',
  warningTintBg: 'rgba(245, 158, 11, 0.12)',
  warningTintBorder: 'rgba(245, 158, 11, 0.32)',
  errorTintBg: 'rgba(239, 68, 68, 0.12)',
  errorTintBorder: 'rgba(239, 68, 68, 0.32)',
  infoTintBg: 'rgba(96, 165, 250, 0.12)',
  infoTintBorder: 'rgba(96, 165, 250, 0.32)',
};
