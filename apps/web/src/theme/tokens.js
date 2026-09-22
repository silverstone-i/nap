/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * @file Color and type tokens transcribed from docs/branding/BRAND.md.
 * Keep this file's values in sync with that document; it is the source of
 * truth, this is its MUI-consumable form.
 */

export const FONT_SANS =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif";
export const FONT_MONO = "'JetBrains Mono', 'SF Mono', Menlo, monospace";

/** Brand navy is identical in light mode; diverges in dark mode (BRAND.md "two-navy rule"). */
export const BRAND_TOKENS = Object.freeze({
  light: {
    navy: '#2F3E52',
    navyText: '#2F3E52',
    navyHover: '#243142',
    gold: '#F4B000',
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
    infoText: '#1D4ED8',
    focusRing: 'rgba(47, 62, 82, 0.12)',
    focusRingError: 'rgba(185, 28, 28, 0.12)',
  },
  dark: {
    navy: '#4F6B8C',
    navyText: '#698BB8',
    navyHover: '#5E7DA3',
    gold: '#F4B000',
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
    warningText: '#F59E0B',
    error: '#EF4444',
    info: '#60A5FA',
    infoText: '#60A5FA',
    focusRing: 'rgba(105, 139, 184, 0.24)',
    focusRingError: 'rgba(239, 68, 68, 0.24)',
  },
});
