/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ThemeModeProvider,
  useThemeMode,
} from '../src/theme/ThemeModeContext.jsx';
import { STORAGE_KEYS } from '../src/storage/localStorage.js';
import { installMatchMedia } from './testUtils.jsx';

function Probe() {
  const { mode, resolvedMode, setMode } = useThemeMode();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="resolved">{resolvedMode}</span>
      <button onClick={() => setMode('dark')}>Use dark</button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('ThemeModeProvider', () => {
  it('defaults to system and follows the OS preference', () => {
    installMatchMedia({ matches: true });
    render(
      <ThemeModeProvider>
        <Probe />
      </ThemeModeProvider>
    );
    expect(screen.getByTestId('mode').textContent).toBe('system');
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });

  it('persists an explicit choice and reflects it on the next mount', () => {
    installMatchMedia({ matches: false });
    const { unmount } = render(
      <ThemeModeProvider>
        <Probe />
      </ThemeModeProvider>
    );
    act(() => screen.getByText('Use dark').click());
    expect(screen.getByTestId('mode').textContent).toBe('dark');
    expect(window.localStorage.getItem(STORAGE_KEYS.displayMode)).toBe('dark');
    unmount();

    render(
      <ThemeModeProvider>
        <Probe />
      </ThemeModeProvider>
    );
    expect(screen.getByTestId('mode').textContent).toBe('dark');
  });

  it('reacts live to an OS appearance change while system is selected', () => {
    const media = installMatchMedia({ matches: false });
    render(
      <ThemeModeProvider>
        <Probe />
      </ThemeModeProvider>
    );
    expect(screen.getByTestId('resolved').textContent).toBe('light');
    act(() => media.setMatches(true));
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
  });
});
