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
    '/home',
    '/management/cells',
    '/management/reports',
    '/tenants',
    '/password',
  ])('accepts %s', path => expect(isSafeReturnPath(path)).toBe(true));

  it.each([
    'https://evil.example/home',
    '//evil.example/home',
    '/app/1',
    '/management',
    '/login',
    '/',
    '',
    null,
    undefined,
    'home',
    '/management/1\t/../../etc',
  ])('rejects %j', path => expect(isSafeReturnPath(path)).toBe(false));
});

describe('reauthorizeReturnPath', () => {
  const session = {
    selectedTenant: { id: 'tenant-1' },
    entryPoints: { platform: false, tenant: true },
  };

  it('accepts /home with a selected tenant or management access', () => {
    expect(reauthorizeReturnPath('/home', session)).toBe('/home');
    expect(
      reauthorizeReturnPath('/home', {
        selectedTenant: null,
        entryPoints: { platform: true, tenant: false },
      })
    ).toBe('/home');
  });

  it('rejects /home with neither', () => {
    expect(
      reauthorizeReturnPath('/home', {
        selectedTenant: null,
        entryPoints: { platform: false, tenant: true },
      })
    ).toBeNull();
  });

  it('rejects a management page without platform entry', () => {
    expect(reauthorizeReturnPath('/management/cells', session)).toBeNull();
  });

  it('accepts a management page with platform entry', () => {
    expect(
      reauthorizeReturnPath('/management/cells', {
        ...session,
        entryPoints: { platform: true, tenant: true },
      })
    ).toBe('/management/cells');
  });

  it('rejects removed routes', () => {
    expect(reauthorizeReturnPath('/app/tenant-1', session)).toBeNull();
  });

  it('rejects an unsafe path outright', () => {
    expect(reauthorizeReturnPath('https://evil.example', session)).toBeNull();
  });
});
