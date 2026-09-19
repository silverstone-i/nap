/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, it, expect, vi } from 'vitest';
import { AdminAccessError } from '../../src/modules/admin-tenancy/domain/errors.js';
import {
  parseScope,
  isTenantPermitted,
} from '../../src/modules/admin-tenancy/domain/scope.js';
import {
  parseUuid,
  parseLimit,
  parseNormalizedEmail,
} from '../../src/modules/admin-tenancy/domain/validation.js';
import {
  parseCursor,
  encodeCursor,
} from '../../src/modules/admin-tenancy/domain/cursor.js';
import {
  findTenant,
  findTenantIncludingArchived,
  findPortalUser,
  findPortalUserIncludingArchived,
  listMembershipsByUser,
  listMembershipsByTenant,
  TENANT_VIEW_COLUMNS,
  PORTAL_USER_VIEW_COLUMNS,
  MEMBERSHIP_VIEW_COLUMNS,
} from '../../src/modules/admin-tenancy/domain/access.js';
import {
  findCredentialByEmail,
  CREDENTIAL_VIEW_COLUMNS,
} from '../../src/modules/admin-tenancy/domain/credentials.js';

const tenantId = '11111111-1111-4111-8111-111111111111';
const otherTenantId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const membershipId = '44444444-4444-4444-8444-444444444444';

const platformScope = {
  platformPortalUserRead: true,
  tenantIds: '*',
  deniedTenantIds: [],
  archiveManagement: true,
};
const tenantScope = tenants => ({
  platformPortalUserRead: false,
  tenantIds: tenants,
  deniedTenantIds: [],
  archiveManagement: false,
});
const supportScope = {
  platformPortalUserRead: true,
  tenantIds: '*',
  deniedTenantIds: [tenantId],
  archiveManagement: false,
};

function fakeDb({
  tenant = null,
  portalUser = null,
  memberships = [],
  page = { rows: [], nextCursor: null },
} = {}) {
  return {
    tenants: { findOneBy: vi.fn().mockResolvedValue(tenant) },
    portal_users: { findOneBy: vi.fn().mockResolvedValue(portalUser) },
    portal_user_tenants: {
      findWhere: vi.fn().mockResolvedValue(memberships),
      findAfterCursor: vi.fn().mockResolvedValue(page),
    },
  };
}

describe('scope validation', () => {
  it('rejects malformed scopes', () => {
    for (const bad of [
      undefined,
      null,
      {},
      { ...platformScope, extra: true },
      { ...platformScope, tenantIds: 'not-a-uuid-list' },
      { ...platformScope, tenantIds: ['not-a-uuid'] },
      { ...platformScope, deniedTenantIds: ['not-a-uuid'] },
      { ...platformScope, archiveManagement: 'yes' },
    ])
      expect(() => parseScope(bad)).toThrow(AdminAccessError);
  });
  it('accepts a fully specified scope', () => {
    expect(parseScope(platformScope)).toEqual(platformScope);
  });
  it.each([
    [platformScope, tenantId, true],
    [tenantScope([tenantId]), tenantId, true],
    [tenantScope([tenantId]), otherTenantId, false],
    [tenantScope('*'), otherTenantId, true],
    [supportScope, tenantId, false],
    [supportScope, otherTenantId, true],
  ])('isTenantPermitted(%j, %s) -> %s', (scope, id, expected) =>
    expect(isTenantPermitted(scope, id)).toBe(expected)
  );
});

describe('primitive validation', () => {
  it.each([undefined, null, '', 'not-a-uuid', 123, {}])(
    'rejects invalid uuid %j',
    value => expect(() => parseUuid(value)).toThrow(AdminAccessError)
  );
  it('accepts a valid uuid', () => expect(parseUuid(tenantId)).toBe(tenantId));
  it('defaults the limit to 50', () => expect(parseLimit(undefined)).toBe(50));
  it.each([1, 50, 100])('accepts boundary limit %d', n =>
    expect(parseLimit(n)).toBe(n)
  );
  it.each([0, -1, 101, 1.5, 'ten', null])('rejects invalid limit %j', value =>
    expect(() => parseLimit(value)).toThrow(AdminAccessError)
  );
  it('accepts a normalized email', () =>
    expect(parseNormalizedEmail('root@example.com')).toBe('root@example.com'));
  it.each(['Root@example.com', 'not-an-email', '', 123])(
    'rejects non-normalized or malformed email %j',
    value => expect(() => parseNormalizedEmail(value)).toThrow(AdminAccessError)
  );
});

describe('cursor encoding', () => {
  it('round-trips through encode and parse', () => {
    const encoded = encodeCursor(
      { id: membershipId },
      'listMembershipsByUser',
      userId
    );
    expect(typeof encoded).toBe('string');
    expect(parseCursor(encoded, 'listMembershipsByUser', userId)).toEqual({
      id: membershipId,
    });
  });
  it('returns null for a null cursor and an absent one', () => {
    expect(encodeCursor(null, 'listMembershipsByUser', userId)).toBeNull();
    expect(parseCursor(undefined, 'listMembershipsByUser', userId)).toBeNull();
  });
  it('rejects a cursor issued for a different operation', () => {
    const encoded = encodeCursor(
      { id: membershipId },
      'listMembershipsByUser',
      userId
    );
    expect(() =>
      parseCursor(encoded, 'listMembershipsByTenant', userId)
    ).toThrow(AdminAccessError);
  });
  it('rejects a cursor issued for a different subject', () => {
    const encoded = encodeCursor(
      { id: membershipId },
      'listMembershipsByUser',
      userId
    );
    expect(() =>
      parseCursor(encoded, 'listMembershipsByUser', tenantId)
    ).toThrow(AdminAccessError);
  });
  it.each([
    '',
    'not-base64url-json',
    'e30=',
    Buffer.from('{}').toString('base64url'),
  ])('rejects a malformed or incomplete cursor %j', value =>
    expect(() => parseCursor(value, 'listMembershipsByUser', userId)).toThrow(
      AdminAccessError
    )
  );
});

describe('typed error mapping', () => {
  it('rejects an unauthorized tenant target before reading', async () => {
    const db = fakeDb();
    await expect(
      findTenant(db, tenantScope([otherTenantId]), tenantId)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(db.tenants.findOneBy).not.toHaveBeenCalled();
  });
  it("denies support's Napsoft-restricted tenant", async () => {
    const db = fakeDb();
    await expect(findTenant(db, supportScope, tenantId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
  it('requires archive-management authority for IncludingArchived reads', async () => {
    const db = fakeDb();
    await expect(
      findTenantIncludingArchived(
        db,
        { ...platformScope, archiveManagement: false },
        tenantId
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      findPortalUserIncludingArchived(
        db,
        { ...platformScope, archiveManagement: false },
        userId
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('denies a tenant-scoped portal-user read without a permitted active membership', async () => {
    const db = fakeDb({ memberships: [] });
    await expect(
      findPortalUser(db, tenantScope([tenantId]), userId)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('permits a tenant-scoped portal-user read through a permitted active membership', async () => {
    const db = fakeDb({
      memberships: [{ tenant_id: tenantId }],
      portalUser: { id: userId },
    });
    await expect(
      findPortalUser(db, tenantScope([tenantId]), userId)
    ).resolves.toEqual({ id: userId });
  });
  it('permits a platform-scoped portal-user read regardless of membership', async () => {
    const db = fakeDb({ memberships: [], portalUser: { id: userId } });
    await expect(findPortalUser(db, platformScope, userId)).resolves.toEqual({
      id: userId,
    });
  });
  it('maps a serialization failure and a deadlock to CONFLICT', async () => {
    for (const code of ['40001', '40P01']) {
      const db = fakeDb();
      db.tenants.findOneBy.mockRejectedValueOnce(
        Object.assign(new Error('x'), { code })
      );
      await expect(
        findTenant(db, platformScope, tenantId)
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    }
  });
  it('maps every other database failure to INTERNAL_ERROR without detail', async () => {
    const db = fakeDb();
    db.tenants.findOneBy.mockRejectedValueOnce(
      Object.assign(new Error('constraint detail leaked'), { code: '23505' })
    );
    const error = await findTenant(db, platformScope, tenantId).catch(e => e);
    expect(error).toBeInstanceOf(AdminAccessError);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.message).toBe('INTERNAL_ERROR');
  });
  it('returns null for a missing record', async () => {
    const db = fakeDb({ tenant: null });
    await expect(findTenant(db, platformScope, tenantId)).resolves.toBeNull();
  });
});

describe('safe projections', () => {
  it('never includes password_hash in an ordinary view', () => {
    for (const columns of [
      TENANT_VIEW_COLUMNS,
      PORTAL_USER_VIEW_COLUMNS,
      MEMBERSHIP_VIEW_COLUMNS,
    ])
      expect(columns).not.toContain('password_hash');
  });
  it('includes password_hash only in the credential view', () => {
    expect(CREDENTIAL_VIEW_COLUMNS).toContain('password_hash');
  });
  it('queries the ordinary tenant read with the safe column whitelist', async () => {
    const db = fakeDb({ tenant: { id: tenantId } });
    await findTenant(db, platformScope, tenantId);
    expect(db.tenants.findOneBy).toHaveBeenCalledWith(
      { id: tenantId },
      { columnWhitelist: TENANT_VIEW_COLUMNS }
    );
  });
  it('queries the ordinary portal-user read with the safe column whitelist', async () => {
    const db = fakeDb({ portalUser: { id: userId } });
    await findPortalUser(db, platformScope, userId);
    expect(db.portal_users.findOneBy).toHaveBeenCalledWith(
      { id: userId },
      { columnWhitelist: PORTAL_USER_VIEW_COLUMNS }
    );
  });
});

describe('credential reader', () => {
  it('rejects a call without the authentication marker', async () => {
    const db = fakeDb();
    await expect(
      findCredentialByEmail(db, {}, 'root@example.com')
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(
      findCredentialByEmail(db, undefined, 'root@example.com')
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
  it('returns the credential view for an authenticated caller', async () => {
    const db = fakeDb();
    db.portal_users.findOneBy.mockResolvedValueOnce({
      id: userId,
      password_hash: 'hash',
    });
    const result = await findCredentialByEmail(
      db,
      { caller: 'authentication' },
      'root@example.com'
    );
    expect(result).toEqual({ id: userId, password_hash: 'hash' });
    expect(db.portal_users.findOneBy).toHaveBeenCalledWith(
      { email: 'root@example.com' },
      { columnWhitelist: CREDENTIAL_VIEW_COLUMNS }
    );
  });
});

describe('list pagination', () => {
  it('lists a page for both membership directions and forwards limit and filters', async () => {
    const page = {
      rows: [{ id: membershipId, tenant_id: tenantId, portal_user_id: userId }],
      nextCursor: { id: membershipId },
    };
    const db = fakeDb({ page });
    const byUser = await listMembershipsByUser(db, platformScope, userId, {
      limit: 10,
    });
    expect(db.portal_user_tenants.findAfterCursor).toHaveBeenCalledWith(
      {},
      10,
      ['id'],
      {
        columnWhitelist: MEMBERSHIP_VIEW_COLUMNS,
        filters: { portal_user_id: userId },
      }
    );
    expect(byUser.rows).toEqual(page.rows);
    expect(typeof byUser.nextCursor).toBe('string');

    const byTenant = await listMembershipsByTenant(
      db,
      tenantScope([tenantId]),
      tenantId
    );
    expect(db.portal_user_tenants.findAfterCursor).toHaveBeenCalledWith(
      {},
      50,
      ['id'],
      {
        columnWhitelist: MEMBERSHIP_VIEW_COLUMNS,
        filters: { tenant_id: tenantId },
      }
    );
    expect(byTenant.rows).toEqual(page.rows);
  });
  it('returns an empty page with a null cursor when nothing matches', async () => {
    const db = fakeDb({ page: { rows: [], nextCursor: null } });
    const result = await listMembershipsByUser(db, platformScope, userId);
    expect(result).toEqual({ rows: [], nextCursor: null });
  });
  it('filters a user membership list to the supplied tenant scope', async () => {
    const db = fakeDb({ memberships: [{ tenant_id: tenantId }] });
    await listMembershipsByUser(db, tenantScope([tenantId]), userId);
    expect(db.portal_user_tenants.findAfterCursor).toHaveBeenCalledWith(
      {},
      50,
      ['id'],
      {
        columnWhitelist: MEMBERSHIP_VIEW_COLUMNS,
        filters: {
          portal_user_id: userId,
          tenant_id: { $in: [tenantId] },
        },
      }
    );
  });
  it('excludes explicitly denied tenants from a user membership list', async () => {
    const db = fakeDb();
    await listMembershipsByUser(db, supportScope, userId);
    expect(db.portal_user_tenants.findAfterCursor).toHaveBeenCalledWith(
      {},
      50,
      ['id'],
      {
        columnWhitelist: MEMBERSHIP_VIEW_COLUMNS,
        filters: {
          portal_user_id: userId,
          $and: [{ tenant_id: { $ne: tenantId } }],
        },
      }
    );
  });
  it('resumes from a decoded cursor', async () => {
    const db = fakeDb({ page: { rows: [], nextCursor: null } });
    const cursor = encodeCursor(
      { id: membershipId },
      'listMembershipsByUser',
      userId
    );
    await listMembershipsByUser(db, platformScope, userId, { cursor });
    expect(db.portal_user_tenants.findAfterCursor).toHaveBeenCalledWith(
      { id: membershipId },
      50,
      ['id'],
      {
        columnWhitelist: MEMBERSHIP_VIEW_COLUMNS,
        filters: { portal_user_id: userId },
      }
    );
  });
  it('rejects a cursor from the other list direction', async () => {
    const db = fakeDb();
    const cursor = encodeCursor(
      { id: membershipId },
      'listMembershipsByTenant',
      tenantId
    );
    await expect(
      listMembershipsByUser(db, platformScope, userId, { cursor })
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(db.portal_user_tenants.findAfterCursor).not.toHaveBeenCalled();
  });
});
