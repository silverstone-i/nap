/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  isSafeReturnPath,
  reauthorizeReturnPath,
} from '../src/auth/returnPath.js';

describe('isSafeReturnPath', () => {
  it.each([
    '/app/11111111-1111-1111-1111-111111111111',
    '/app/11111111-1111-1111-1111-111111111111/details',
    '/management',
    '/management/reports',
    '/tenants',
    '/password',
  ])('accepts %s', path => expect(isSafeReturnPath(path)).toBe(true));

  it.each([
    'https://evil.example/app/1',
    '//evil.example/app/1',
    '/login',
    '/',
    '',
    null,
    undefined,
    'app/1',
    '/app/1\t/../../etc',
  ])('rejects %j', path => expect(isSafeReturnPath(path)).toBe(false));
});

describe('reauthorizeReturnPath', () => {
  const session = {
    selectedTenant: { id: 'tenant-1' },
    entryPoints: { platform: false, tenant: true },
  };

  it('accepts a tenant path matching the current selected tenant', () => {
    expect(reauthorizeReturnPath('/app/tenant-1', session)).toBe(
      '/app/tenant-1'
    );
  });

  it('rejects a tenant path for a different tenant', () => {
    expect(reauthorizeReturnPath('/app/tenant-2', session)).toBeNull();
  });

  it('rejects /management without platform entry', () => {
    expect(reauthorizeReturnPath('/management', session)).toBeNull();
  });

  it('accepts /management with platform entry', () => {
    expect(
      reauthorizeReturnPath('/management', {
        ...session,
        entryPoints: { platform: true, tenant: true },
      })
    ).toBe('/management');
  });

  it('rejects an unsafe path outright', () => {
    expect(reauthorizeReturnPath('https://evil.example', session)).toBeNull();
  });
});
