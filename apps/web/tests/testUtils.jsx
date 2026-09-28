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

/** The Napsoft tenant as `GET /session/capabilities` reports it. */
export const NAPSOFT_TENANT = Object.freeze({ id: 'napsoft', code: 'NAP' });

/**
 * A `GET /session/capabilities` fixture (I0005-R011). The default is a
 * platform admin: every capability on every tenant, Napsoft included.
 * @param {{patterns?: string[], targetTenant?: {id: string, code: string}|null}} [overrides]
 * @returns {{patterns: string[], homeTenant: object, targetTenant: object|null, napsoftTenant: object}}
 */
export function capabilitiesFixture({
  patterns = ['*::*::*::*', 'NAP::*::*::*'],
  targetTenant = NAPSOFT_TENANT,
} = {}) {
  return {
    patterns,
    homeTenant: NAPSOFT_TENANT,
    targetTenant,
    napsoftTenant: NAPSOFT_TENANT,
  };
}

/** A session with no capabilities at all (a tenant-only user). */
export const NO_CAPABILITIES = Object.freeze(
  capabilitiesFixture({ patterns: [], targetTenant: null })
);
