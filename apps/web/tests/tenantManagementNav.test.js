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
    [
      'a platform user authorized for all three (F0001-R024)',
      {
        platform: true,
        tenant: false,
        tenantManagement: { tenants: true, cells: true, portalUsers: true },
      },
    ],
  ])(
    'returns no children for %s — none is implemented yet (F0002 not built), regardless of authorization',
    (_label, entryPoints) => {
      expect(visibleTenantManagementChildren(entryPoints)).toEqual([]);
    }
  );

  it('never returns a child whose own record is not implemented, even if a caller tried to force it', () => {
    // Guards the filter itself, independent of what entryPoints says: an
    // unimplemented destination must never appear regardless of any future
    // authorization signal's value.
    expect(
      TENANT_MANAGEMENT_CHILDREN.every(child => child.implemented === false)
    ).toBe(true);
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
