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

describe('visibleTenantManagementChildren (I0001-R023)', () => {
  it('lists Tenants, Cells, Portal Users, and Roles as the known children', () => {
    expect(TENANT_MANAGEMENT_CHILDREN.map(child => child.label)).toEqual([
      'Tenants',
      'Cells',
      'Portal Users',
      'Roles',
    ]);
  });

  it('every child is implemented (I0002 screens plus M0003-R016 Roles)', () => {
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
        tenantManagement: {
          tenants: false,
          cells: false,
          portalUsers: false,
          accessControl: false,
        },
      },
    ],
  ])(
    'returns no children for %s — implemented is not sufficient alone (I0002-R010)',
    (_label, entryPoints) => {
      expect(visibleTenantManagementChildren(entryPoints)).toEqual([]);
    }
  );

  it('returns all four, in order, for a user authorized for all four (I0001-R024, I0002-R010)', () => {
    const entryPoints = {
      platform: true,
      tenant: false,
      tenantManagement: {
        tenants: true,
        cells: true,
        portalUsers: true,
        accessControl: true,
      },
    };
    expect(visibleTenantManagementChildren(entryPoints)).toEqual([
      { id: 'tenants', label: 'Tenants', path: '/management/tenants' },
      { id: 'cells', label: 'Cells', path: '/management/cells' },
      {
        id: 'portal-users',
        label: 'Portal Users',
        path: '/management/portal-users',
      },
      { id: 'roles', label: 'Roles', path: '/management/roles' },
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

  it('shows Roles only when entryPoints.tenantManagement.accessControl is true (M0003-R016)', () => {
    const base = { tenants: false, cells: false, portalUsers: false };
    expect(
      visibleTenantManagementChildren({
        tenantManagement: { ...base, accessControl: true },
      }).map(child => child.id)
    ).toEqual(['roles']);
    expect(
      visibleTenantManagementChildren({
        tenantManagement: { ...base, accessControl: false },
      })
    ).toEqual([]);
  });
});

describe('isChildVisible (I0001-R024 gate, I0002-R010)', () => {
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
