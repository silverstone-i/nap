/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { vi } from 'vitest';

/**
 * jsdom does not implement `matchMedia`. Install a minimal, controllable
 * fake so `ThemeModeProvider` and MUI's `useMediaQuery` (phone-width
 * checks) can run in tests.
 * @param {{matches?: boolean}} [options]
 * @returns {{setMatches: (value: boolean) => void}}
 */
export function installMatchMedia({ matches = false } = {}) {
  const listeners = new Set();
  let current = matches;
  window.matchMedia = vi.fn().mockImplementation(query => ({
    matches: current,
    media: query,
    addEventListener: (_, listener) => listeners.add(listener),
    removeEventListener: (_, listener) => listeners.delete(listener),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
  return {
    setMatches(value) {
      current = value;
      for (const listener of listeners) listener({ matches: value });
    },
  };
}

/**
 * jsdom has no `ResizeObserver`, which `@mui/x-data-grid` requires just to
 * mount. A no-op stub is enough for tests that never assert on layout.
 * @returns {void}
 */
export function installResizeObserver() {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
