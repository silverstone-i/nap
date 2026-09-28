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
    management: false,
    entryPoints: { tenant: true },
  };

  it('accepts /home with a selected tenant or management access', () => {
    expect(reauthorizeReturnPath('/home', session)).toBe('/home');
    expect(
      reauthorizeReturnPath('/home', {
        selectedTenant: null,
        management: true,
        entryPoints: { tenant: false },
      })
    ).toBe('/home');
  });

  it('rejects /home with neither', () => {
    expect(
      reauthorizeReturnPath('/home', {
        selectedTenant: null,
        management: false,
        entryPoints: { tenant: true },
      })
    ).toBeNull();
  });

  it('rejects a management page without management access', () => {
    expect(reauthorizeReturnPath('/management/cells', session)).toBeNull();
  });

  it('accepts a management page with management access', () => {
    expect(
      reauthorizeReturnPath('/management/cells', {
        ...session,
        management: true,
        entryPoints: { tenant: true },
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
