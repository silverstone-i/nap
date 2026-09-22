/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * The one-per-screen active-nav indicator (BRAND.md "Gold discipline"): a
 * 2px gold bar on the leading edge of the active row. Shared by every kind
 * of nav row (a flat item, a group's own icon in the collapsed rail, and a
 * group's expanded children) so the active state always reads the same way.
 * @param {import('@mui/material/styles').Theme} theme
 * @returns {object} An `sx`-compatible style fragment.
 */
export function activeIndicatorSx(theme) {
  return {
    position: 'relative',
    '&.Mui-selected::before': {
      content: '""',
      position: 'absolute',
      left: 0,
      top: 6,
      bottom: 6,
      width: 2,
      background: theme.custom.gold,
    },
  };
}
