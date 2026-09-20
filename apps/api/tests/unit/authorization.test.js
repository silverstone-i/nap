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
const capability = 'admin-tenancy::roles::write';

function database({ root = false, active = true } = {}) {
  return {
    portal_users: {
      findOneBy: vi.fn(async () =>
        active ? { id: userId, is_root: root } : null
      ),
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
    const authority = await resolveAuthorization(db, session);
    expect(permits(authority, capability)).toBe(true);
    expect(accessScope(authority, capability)).toMatchObject({
      tenantIds: '*',
      archiveManagement: true,
    });
  });

  it.each([
    [{ root: false }, session],
    [{ root: true }, { ...session, restricted: true }],
    [{ root: true }, { ...session, accessMode: 'support' }],
  ])(
    'grants no authority outside an unrestricted root session',
    async (input, candidate) => {
      const authority = await resolveAuthorization(database(input), candidate);
      expect(permits(authority, capability)).toBe(false);
      expect(accessScope(authority, capability).tenantIds).toEqual([]);
    }
  );

  it('rejects an inactive user', async () => {
    await expect(
      resolveAuthorization(database({ active: false }), session)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
