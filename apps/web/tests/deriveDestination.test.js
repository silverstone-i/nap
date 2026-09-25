/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { deriveDestination } from '../src/auth/deriveDestination.js';

describe('deriveDestination', () => {
  it('routes a restricted session to /password regardless of other state', () => {
    expect(
      deriveDestination({
        status: 'restricted',
        selectedTenant: { id: 't1' },
        entryPoints: { platform: true, tenant: true },
      })
    ).toBe('/password');
  });

  it('routes a valid selected tenant to Home', () => {
    expect(
      deriveDestination({
        status: 'ready',
        selectedTenant: { id: 'tenant-1' },
        entryPoints: { platform: false, tenant: true },
      })
    ).toBe('/home');
  });

  it('routes to tenant selection when eligible tenants exist and none is selected', () => {
    expect(
      deriveDestination({
        status: 'ready',
        selectedTenant: null,
        entryPoints: { platform: false, tenant: true },
      })
    ).toBe('/tenants');
  });

  it('routes management access to Home with no tenant selected', () => {
    expect(
      deriveDestination({
        status: 'ready',
        selectedTenant: null,
        entryPoints: { platform: true, tenant: false },
      })
    ).toBe('/home');
  });

  it('sends management access to Home rather than tenant selection', () => {
    expect(
      deriveDestination({
        status: 'ready',
        selectedTenant: null,
        entryPoints: { platform: true, tenant: true },
      })
    ).toBe('/home');
  });

  it('returns null when nothing is available', () => {
    expect(
      deriveDestination({
        status: 'ready',
        selectedTenant: null,
        entryPoints: { platform: false, tenant: false },
      })
    ).toBeNull();
  });

  it.each(['loading', 'anonymous', 'error'])(
    'returns null while status is %s',
    status => expect(deriveDestination({ status })).toBeNull()
  );
});
