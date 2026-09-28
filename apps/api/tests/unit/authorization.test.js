/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it, vi } from 'vitest';
import { PLATFORM_ADMIN_CAPABILITIES } from '../../src/capability/systemRoles.js';
import {
  accessScope,
  permits,
  resolveAuthorization,
} from '../../src/modules/admin-tenancy/domain/authorization.js';

const userId = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';
const capability = 'admin-tenancy::roles::write';

function database({ bootstrapId = userId, active = true } = {}) {
  return {
    portal_users: {
      findOneBy: vi.fn(async () => (active ? { id: userId } : null)),
      findBootstrapLogin: vi.fn(async () =>
        bootstrapId ? { id: bootstrapId } : null
      ),
    },
  };
}

const session = {
  id: '55555555-5555-4555-8555-555555555555',
  user: userId,
  restricted: false,
};

describe('authorization resolution', () => {
  it('grants the bootstrap login the platform-admin capabilities', async () => {
    const authority = await resolveAuthorization(database(), session);
    expect(authority).toEqual({
      actorId: userId,
      platform: 'platform_admin',
      platformCapabilities: [...PLATFORM_ADMIN_CAPABILITIES],
    });
    expect(permits(authority, capability)).toBe(true);
    expect(accessScope(authority, capability)).toEqual({
      platformPortalUserRead: true,
      tenantIds: '*',
      archiveManagement: true,
    });
  });

  it.each([
    ['another user', { bootstrapId: otherId }, session],
    ['no bootstrap login', { bootstrapId: null }, session],
    ['a restricted session', {}, { ...session, restricted: true }],
  ])('grants no authority to %s', async (_label, input, candidate) => {
    const authority = await resolveAuthorization(database(input), candidate);
    expect(authority).toEqual({
      actorId: userId,
      platform: null,
      platformCapabilities: [],
    });
    expect(permits(authority, capability)).toBe(false);
    expect(accessScope(authority, capability).tenantIds).toEqual([]);
  });

  it('rejects an inactive user', async () => {
    await expect(
      resolveAuthorization(database({ active: false }), session)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
