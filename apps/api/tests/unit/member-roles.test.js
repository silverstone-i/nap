/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it, vi } from 'vitest';
import { setMemberRoles } from '../../src/modules/access-control/domain/memberRoles.js';
import { applyPortalRoles } from '../../src/modules/business-directory/domain/portalAccess.js';

const TENANT = '11111111-1111-4111-8111-111111111111';
const PARTY = '22222222-2222-4222-8222-222222222222';
const LOGIN = '33333333-3333-4333-8333-333333333333';
const ADMIN_ROLE = {
  id: '44444444-4444-4444-8444-444444444444',
  code: 'tenant_admin',
  is_immutable: true,
  deactivated_at: null,
};
const CLERK_ROLE = {
  id: '55555555-5555-4555-8555-555555555555',
  code: 'clerk',
  is_immutable: false,
  deactivated_at: null,
};

/** A cell where the person is an active member holding `tenant_admin`. */
function cellWith({ adminHolders }) {
  const roles = new Map([
    [ADMIN_ROLE.id, ADMIN_ROLE],
    [CLERK_ROLE.id, CLERK_ROLE],
  ]);
  return {
    tenant_members: {
      byMemberIds: async () => [
        { member_id: PARTY, portal_user_id: LOGIN, status: 'active' },
      ],
    },
    held_roles: { activeFor: async () => [] },
    role_assignments: {
      activeRoleIds: async () => [ADMIN_ROLE.id],
      countActive: async () => adminHolders,
      lockActive: async () => ({ id: 'assignment' }),
      archive: vi.fn(),
      insert: vi.fn(),
    },
    roles: { lockById: async id => roles.get(id) ?? null },
    role_grants: { patternsFor: async () => ['ACME::*::*::*'] },
  };
}

function context(cell) {
  return {
    cell,
    tenant: { id: TENANT, isNapsoft: false },
    napsoftCode: 'NAP',
    actorId: LOGIN,
    actorPatterns: async () => ['ACME::*::*::*'],
    record: vi.fn(),
  };
}

describe('setMemberRoles (I0010-R009)', () => {
  it("refuses to remove the tenant's last tenant_admin and changes nothing", async () => {
    const cell = cellWith({ adminHolders: 1 });
    const ctx = context(cell);
    await expect(
      setMemberRoles(ctx, PARTY, [CLERK_ROLE.id], {})
    ).rejects.toMatchObject({ code: 'LAST_ADMIN' });
    expect(cell.role_assignments.archive).not.toHaveBeenCalled();
    expect(cell.role_assignments.insert).not.toHaveBeenCalled();
    expect(ctx.record).not.toHaveBeenCalled();
  });

  it('swaps the roles when another tenant_admin remains', async () => {
    const cell = cellWith({ adminHolders: 2 });
    const ctx = context(cell);
    await setMemberRoles(ctx, PARTY, [CLERK_ROLE.id], {});
    expect(cell.role_assignments.archive).toHaveBeenCalledTimes(1);
    expect(cell.role_assignments.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        portal_user_id: LOGIN,
        role_id: CLERK_ROLE.id,
      }),
      { tx: {} }
    );
    expect(ctx.record.mock.calls.map(([change]) => change.eventKey)).toEqual([
      'role.revoked',
      'role.granted',
    ]);
  });

  it('refuses an empty or repeated role set', async () => {
    const ctx = context(cellWith({ adminHolders: 2 }));
    await expect(setMemberRoles(ctx, PARTY, [], {})).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    await expect(
      setMemberRoles(ctx, PARTY, [CLERK_ROLE.id, CLERK_ROLE.id], {})
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('applyPortalRoles (I0010-R011, R012)', () => {
  const base = {
    cell: cellWith({ adminHolders: 2 }),
    tenant: { id: TENANT },
    actorId: LOGIN,
    actorPatterns: async () => ['ACME::*::*::*'],
    recordRole: vi.fn(),
  };

  it('refuses a caller whose home tenant is another tenant (AC08)', async () => {
    const napsoftOperator = {
      ...base,
      homeTenantId: '66666666-6666-4666-8666-666666666666',
      can: async () => true,
    };
    await expect(
      applyPortalRoles(
        napsoftOperator,
        PARTY,
        { roleIds: [CLERK_ROLE.id], turningOn: true, portalOn: true },
        {}
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('refuses roles without access-control::assignments::write', async () => {
    const clerk = {
      ...base,
      homeTenantId: TENANT,
      can: async capability =>
        capability !== 'access-control::assignments::write',
    };
    await expect(
      applyPortalRoles(
        clerk,
        PARTY,
        { roleIds: [CLERK_ROLE.id], turningOn: false, portalOn: true },
        {}
      )
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('leaves a save that neither turns access on nor sends roles alone', async () => {
    const outsider = { ...base, homeTenantId: null, can: async () => false };
    await expect(
      applyPortalRoles(
        outsider,
        PARTY,
        { roleIds: undefined, turningOn: false, portalOn: true },
        {}
      )
    ).resolves.toBeUndefined();
  });
});
