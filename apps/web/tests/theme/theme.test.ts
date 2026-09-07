/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createAppTheme } from '../../src/theme/theme.js';
import {
  darkColors,
  fontSans,
  lightColors,
  gold,
} from '../../src/theme/tokens.js';

it.each(['light', 'dark'] as const)(
  'maps %s brand roles without putting gold in the palette',
  mode => {
    const theme = createAppTheme(mode);
    const colors = mode === 'dark' ? darkColors : lightColors;
    expect(theme.palette.primary.main).toBe(colors.navy);
    expect(theme.brand.navyText).toBe(colors.navyText);
    expect(theme.palette.background.default).toBe(colors.page);
    expect(theme.palette.background.paper).toBe(colors.card);
    expect(theme.palette.text.primary).toBe(colors.textPrimary);
    expect(theme.typography.fontFamily).toBe(fontSans);
    expect(JSON.stringify(theme.palette)).not.toContain(gold);
  }
);

it('keeps the central color values aligned with the brand authority', () => {
  const brand = readFileSync('../../docs/branding/BRAND.md', 'utf8');
  for (const [name, colors] of [
    [':root {', lightColors],
    ['[data-theme="dark"] {', darkColors],
  ] as const) {
    const block = brand.split(name)[1]?.split('\n}')[0];
    expect(block).toBeDefined();
    for (const [key, value] of Object.entries(colors)) {
      const cssName = key.replace(
        /[A-Z]/g,
        letter => `-${letter.toLowerCase()}`
      );
      expect(block).toContain(`--${cssName}: ${value};`);
    }
  }
});
