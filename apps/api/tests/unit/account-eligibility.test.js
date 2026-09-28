/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assertAccountDeactivationAllowed,
  assertMembershipDeactivationAllowed,
} from '../../src/modules/access-control/domain/accountEligibility.js';

const USER = randomUUID();
const TENANT = randomUUID();
const CELL = randomUUID();

function fixture({
  assignedRole = null,
  isNapsoft = false,
  ready = true,
} = {}) {
  const roles = new Map(
    ['tenant_admin', 'platform_admin'].map(code => [
      code,
      {
        id: randomUUID(),
        code,
        deactivated_at: null,
      },
    ])
  );
  const cell = {
    tx: operation => operation({ one: async () => ({}) }),
    roles: {
      lockByCode: async (_tenantId, code) => roles.get(code) ?? null,
    },
    role_assignments: {
      lockActive: async (userId, roleId) =>
        userId === USER && roles.get(assignedRole)?.id === roleId
          ? { id: randomUUID() }
          : null,
    },
  };
  return {
    admin: {
      portal_user_tenants: {
        findWhere: async () => [{ tenant_id: TENANT }],
      },
      tenants: {
        findOneBy: async () => ({
          id: TENANT,
          cell_id: CELL,
          is_napsoft: isNapsoft,
        }),
      },
    },
    runtime: {
      dbFor: () => {
        if (!ready) throw new Error('unavailable');
        return cell;
      },
    },
  };
}

describe('account deactivation eligibility', () => {
  it.each([
    ['tenant_admin', false],
    ['platform_admin', true],
  ])('rejects a user holding %s', async (assignedRole, isNapsoft) => {
    const { admin, runtime } = fixture({ assignedRole, isNapsoft });
    await expect(
      assertAccountDeactivationAllowed(admin, runtime, USER)
    ).rejects.toMatchObject({ code: 'ADMIN_ASSIGNED' });
  });

  it('permits a user with no administrator assignment', async () => {
    const { admin, runtime } = fixture();
    await expect(
      assertAccountDeactivationAllowed(admin, runtime, USER)
    ).resolves.toBeUndefined();
  });

  it('fails closed when an affected cell is unavailable', async () => {
    const { admin, runtime } = fixture({ ready: false });
    await expect(
      assertAccountDeactivationAllowed(admin, runtime, USER)
    ).rejects.toMatchObject({ code: 'CELL_UNAVAILABLE' });
  });

  it('rejects suspending a membership that holds tenant_admin', async () => {
    const { admin, runtime } = fixture({ assignedRole: 'tenant_admin' });
    await expect(
      assertMembershipDeactivationAllowed(admin, runtime, {
        tenant_id: TENANT,
        portal_user_id: USER,
      })
    ).rejects.toMatchObject({ code: 'ADMIN_ASSIGNED' });
  });
});
