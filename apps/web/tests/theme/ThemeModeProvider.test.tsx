/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeModeProvider } from '../../src/theme/ThemeModeProvider.js';
import { useThemeMode } from '../../src/theme/useThemeMode.js';
import { ThemeSelector } from '../../src/components/ThemeSelector.js';

let media: MediaQueryList;
const listeners = new Set<EventListenerOrEventListenerObject>();

beforeEach(() => {
  localStorage.clear();
  listeners.clear();
  media = {
    matches: false,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: vi.fn(
      (_type, listener: EventListenerOrEventListenerObject) =>
        listeners.add(listener)
    ),
    removeEventListener: vi.fn(
      (_type, listener: EventListenerOrEventListenerObject) =>
        listeners.delete(listener)
    ),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media)
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * Does: Displays the provider's public state beside the real selector.
 * Called by: Preference integration tests after mounting the provider.
 */
function Probe() {
  const { preference, resolvedMode } = useThemeMode();
  return (
    <>
      <output>
        {preference}:{resolvedMode}
      </output>
      <ThemeSelector />
    </>
  );
}

/**
 * Does: Mounts the provider with a real control and state observer.
 * Called by: Each preference test, including simulated reloads.
 */
function mount() {
  return render(
    <ThemeModeProvider>
      <Probe />
    </ThemeModeProvider>
  );
}

/**
 * Does: Delivers an operating-system theme change to active listeners.
 * Called by: Preference tests when switching the simulated system mode.
 */
function systemChange(matches: boolean) {
  Object.defineProperty(media, 'matches', {
    value: matches,
    configurable: true,
  });
  act(() => {
    const event = new Event('change');
    Object.defineProperty(event, 'matches', { value: matches });
    for (const listener of listeners) {
      if (typeof listener === 'function') listener(event);
      else listener.handleEvent(event);
    }
  });
}

it('defaults to system, follows OS changes, and removes its subscription', () => {
  const view = mount();
  expect(screen.getByText('system:light')).toBeDefined();
  systemChange(true);
  expect(screen.getByText('system:dark')).toBeDefined();
  expect(localStorage.getItem('nap:theme-mode')).toBeNull();
  view.unmount();
  expect(listeners.size).toBe(0);
});

it.each(['light', 'dark'] as const)(
  'reads saved %s before content renders and ignores OS changes',
  mode => {
    localStorage.setItem('nap:theme-mode', mode);
    mount();
    expect(screen.getByText(`${mode}:${mode}`)).toBeDefined();
    systemChange(true);
    systemChange(false);
    expect(screen.getByText(`${mode}:${mode}`)).toBeDefined();
  }
);

it.each(['system', 'invalid'])(
  'uses the current system for saved %s',
  stored => {
    localStorage.setItem('nap:theme-mode', stored);
    Object.defineProperty(media, 'matches', { value: true });
    mount();
    expect(screen.getByText('system:dark')).toBeDefined();
  }
);

it('persists control changes across remounts and resumes system tracking', () => {
  const view = mount();
  fireEvent.change(screen.getByRole('combobox', { name: 'Theme' }), {
    target: { value: 'dark' },
  });
  expect(localStorage.getItem('nap:theme-mode')).toBe('dark');
  view.unmount();
  mount();
  expect(screen.getByText('dark:dark')).toBeDefined();
  fireEvent.change(screen.getByRole('combobox'), {
    target: { value: 'system' },
  });
  expect(localStorage.getItem('nap:theme-mode')).toBe('system');
  systemChange(true);
  expect(screen.getByText('system:dark')).toBeDefined();
});

it('keeps selection usable when storage reads and writes throw', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  mount();
  expect(screen.getByText('system:light')).toBeDefined();
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dark' } });
  expect(screen.getByText('dark:dark')).toBeDefined();
});
