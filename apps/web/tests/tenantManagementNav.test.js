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

describe('visibleTenantManagementChildren (F0001-R023)', () => {
  it('lists Tenants, Cells, and Portal Users as the three known children', () => {
    expect(TENANT_MANAGEMENT_CHILDREN.map(child => child.label)).toEqual([
      'Tenants',
      'Cells',
      'Portal Users',
    ]);
  });

  it('every child is implemented, now that F0002 ships all three screens', () => {
    expect(
      TENANT_MANAGEMENT_CHILDREN.every(child => child.implemented === true)
    ).toBe(true);
  });

  it.each([
    ['no entry points at all', undefined],
    ['an anonymous-shaped value', null],
    [
      'a tenant-only user with no tenantManagement authority',
      {
        platform: false,
        tenant: true,
        tenantManagement: { tenants: false, cells: false, portalUsers: false },
      },
    ],
  ])(
    'returns no children for %s — implemented is not sufficient alone (F0002-R010)',
    (_label, entryPoints) => {
      expect(visibleTenantManagementChildren(entryPoints)).toEqual([]);
    }
  );

  it('returns all three, in order, for a platform user authorized for all three (F0001-R024, F0002-R010)', () => {
    const entryPoints = {
      platform: true,
      tenant: false,
      tenantManagement: { tenants: true, cells: true, portalUsers: true },
    };
    expect(visibleTenantManagementChildren(entryPoints)).toEqual([
      { id: 'tenants', label: 'Tenants', path: '/management/tenants' },
      { id: 'cells', label: 'Cells', path: '/management/cells' },
      {
        id: 'portal-users',
        label: 'Portal Users',
        path: '/management/portal-users',
      },
    ]);
  });

  it('returns only the authorized subset when authorization is partial', () => {
    const entryPoints = {
      platform: true,
      tenant: false,
      tenantManagement: { tenants: true, cells: false, portalUsers: true },
    };
    expect(
      visibleTenantManagementChildren(entryPoints).map(child => child.id)
    ).toEqual(['tenants', 'portal-users']);
  });
});

describe('isChildVisible (F0001-R024 gate, F0002-R010)', () => {
  const child = { implemented: true, authKey: 'cells' };

  it('is visible only when both implemented and authorized', () => {
    expect(isChildVisible(child, { tenantManagement: { cells: true } })).toBe(
      true
    );
  });

  it('stays hidden when authorized but not implemented', () => {
    expect(
      isChildVisible(
        { ...child, implemented: false },
        { tenantManagement: { cells: true } }
      )
    ).toBe(false);
  });

  it('stays hidden when implemented but not authorized', () => {
    expect(isChildVisible(child, { tenantManagement: { cells: false } })).toBe(
      false
    );
  });

  it('stays hidden when entryPoints carries no tenantManagement signal at all', () => {
    expect(isChildVisible(child, {})).toBe(false);
    expect(isChildVisible(child, null)).toBe(false);
    expect(isChildVisible(child, undefined)).toBe(false);
  });

  it("only consults its own authKey, not a sibling's", () => {
    expect(
      isChildVisible(child, {
        tenantManagement: { cells: false, tenants: true, portalUsers: true },
      })
    ).toBe(false);
  });
});
