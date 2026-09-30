/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import {
  TENANT_MANAGEMENT_CHILDREN,
  isChildVisible,
  visibleTenantManagementChildren,
} from '../src/shell/tenantManagementNav.js';
import { NO_CAPABILITIES, capabilitiesFixture } from './testUtils.jsx';

const ACME = { id: 'acme', code: 'ACME' };

describe('visibleTenantManagementChildren (I0001-R023, I0005-R011)', () => {
  it('lists Tenants, Cells, and Portal Users as the known children', () => {
    expect(TENANT_MANAGEMENT_CHILDREN.map(child => child.label)).toEqual([
      'Tenants',
      'Cells',
      'Portal Users',
    ]);
  });

  it('every child is implemented (I0002 screens)', () => {
    expect(
      TENANT_MANAGEMENT_CHILDREN.every(child => child.implemented === true)
    ).toBe(true);
  });

  it.each([
    ['no capabilities loaded', undefined],
    ['an anonymous-shaped value', null],
    ['a session with no patterns', NO_CAPABILITIES],
  ])(
    'returns no children for %s — implemented is not sufficient alone',
    (_label, capabilities) => {
      expect(visibleTenantManagementChildren(capabilities)).toEqual([]);
    }
  );

  it('returns all three, in order, for a platform admin', () => {
    expect(visibleTenantManagementChildren(capabilitiesFixture())).toEqual([
      { id: 'tenants', label: 'Tenants', path: '/management/tenants' },
      { id: 'cells', label: 'Cells', path: '/management/cells' },
      {
        id: 'portal-users',
        label: 'Portal Users',
        path: '/management/portal-users',
      },
    ]);
  });

  it('returns only the matched subset when capabilities are partial', () => {
    const capabilities = capabilitiesFixture({
      patterns: ['NAP::admin-tenancy::accounts::*'],
    });
    expect(
      visibleTenantManagementChildren(capabilities).map(child => child.id)
    ).toEqual(['portal-users']);
  });

  it('checks every child against Napsoft, not the target tenant', () => {
    // A tenant admin of ACME: everything on ACME, nothing on Napsoft.
    const capabilities = capabilitiesFixture({
      patterns: ['ACME::*::*::*'],
      targetTenant: ACME,
    });
    expect(
      visibleTenantManagementChildren(capabilities).map(child => child.id)
    ).toEqual([]);
  });

  it('never shows the Napsoft children for a tenant-wildcard pattern', () => {
    const capabilities = capabilitiesFixture({
      patterns: ['*::*::*::read'],
      targetTenant: ACME,
    });
    expect(
      visibleTenantManagementChildren(capabilities).map(child => child.id)
    ).toEqual([]);
  });
});

describe('isChildVisible (I0001-R024 gate, I0005-R011)', () => {
  const child = {
    implemented: true,
    capability: 'admin-tenancy::control::read',
    target: 'napsoft',
  };

  it('is visible only when both implemented and matched', () => {
    expect(isChildVisible(child, capabilitiesFixture())).toBe(true);
  });

  it('stays hidden when matched but not implemented', () => {
    expect(
      isChildVisible({ ...child, implemented: false }, capabilitiesFixture())
    ).toBe(false);
  });

  it('stays hidden when implemented but not matched', () => {
    expect(
      isChildVisible(
        child,
        capabilitiesFixture({ patterns: ['NAP::admin-tenancy::accounts::*'] })
      )
    ).toBe(false);
  });

  it('stays hidden when no capabilities are loaded', () => {
    expect(isChildVisible(child, null)).toBe(false);
    expect(isChildVisible(child, undefined)).toBe(false);
  });
});
