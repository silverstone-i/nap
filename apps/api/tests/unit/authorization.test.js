/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it, vi } from 'vitest';
import {
  accessScope,
  permits,
  resolveAuthorization,
} from '../../src/modules/admin-tenancy/domain/authorization.js';

const userId = '11111111-1111-4111-8111-111111111111';
const ownerId = '22222222-2222-4222-8222-222222222222';
const tenantId = '33333333-3333-4333-8333-333333333333';
const roleId = '44444444-4444-4444-8444-444444444444';
const capability = 'admin-tenancy::roles::write';

function database({ root = false, assignments = [], memberships = [] } = {}) {
  return {
    portal_users: {
      findOneBy: vi.fn(async () => ({ id: userId, is_root: root })),
    },
    tenants: {
      findOneBy: vi.fn(async () => ({ id: ownerId })),
    },
    platform_roles: {
      findWhere: vi.fn(async () => assignments),
    },
    portal_user_tenants: {
      findWhere: vi.fn(async () => memberships),
    },
  };
}

const session = {
  id: '55555555-5555-4555-8555-555555555555',
  user: userId,
  restricted: false,
  accessMode: 'normal',
};

describe('authorization resolution', () => {
  it('grants an unrestricted active root without resolving roles', async () => {
    const db = database({ root: true });
    const provider = { resolve: vi.fn() };
    const authority = await resolveAuthorization(db, provider, session);
    expect(permits(authority, capability, tenantId)).toBe(true);
    expect(provider.resolve).not.toHaveBeenCalled();
  });

  it('limits a tenant assignment to its own tenant', async () => {
    const db = database({
      assignments: [{ tenant_id: tenantId, role_id: roleId }],
      memberships: [{ tenant_id: tenantId }],
    });
    const provider = {
      resolve: vi.fn(async () => [
        { id: roleId, systemRole: null, capabilities: [capability] },
      ]),
    };
    const authority = await resolveAuthorization(db, provider, session);
    expect(permits(authority, capability, tenantId)).toBe(true);
    expect(permits(authority, capability, ownerId)).toBe(false);
  });

  it('applies the owning-tenant denial to support', async () => {
    const db = database({
      assignments: [{ tenant_id: ownerId, role_id: roleId }],
      memberships: [{ tenant_id: ownerId }],
    });
    const provider = {
      resolve: vi.fn(async () => [
        { id: roleId, systemRole: 'support', capabilities: [capability] },
      ]),
    };
    const authority = await resolveAuthorization(db, provider, session);
    expect(permits(authority, capability, tenantId)).toBe(true);
    expect(permits(authority, capability, ownerId)).toBe(false);
    expect(accessScope(authority, capability).deniedTenantIds).toEqual([
      ownerId,
    ]);
  });

  it('does not let support narrow an assigned platform administrator', async () => {
    const supportId = '66666666-6666-4666-8666-666666666666';
    const db = database({
      assignments: [
        { tenant_id: ownerId, role_id: roleId },
        { tenant_id: ownerId, role_id: supportId },
      ],
      memberships: [{ tenant_id: ownerId }],
    });
    const provider = {
      resolve: vi.fn(async () => [
        {
          id: roleId,
          systemRole: 'platform_admin',
          capabilities: [capability],
        },
        { id: supportId, systemRole: 'support', capabilities: [capability] },
      ]),
    };
    const authority = await resolveAuthorization(db, provider, session);
    expect(authority.platform).toBe('platform_admin');
    expect(permits(authority, capability, ownerId)).toBe(true);
  });

  it('fails closed when assigned roles cannot be resolved', async () => {
    const db = database({
      assignments: [{ tenant_id: tenantId, role_id: roleId }],
      memberships: [{ tenant_id: tenantId }],
    });
    const provider = {
      resolve: vi.fn(async () => {
        throw Object.assign(new Error(), { code: 'SERVICE_UNAVAILABLE' });
      }),
    };
    await expect(
      resolveAuthorization(db, provider, session)
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});
