/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  archiveRole,
  assignRole,
  createRole,
  getRole,
  listRoles,
  removeRole,
  restoreRole,
  updateRole,
  userRoles,
} from '../../src/modules/access-control/domain/roles.js';
import { capabilityCatalogue } from '../../src/modules/access-control/domain/catalogue.js';

const TENANT = randomUUID();
const ACTOR = randomUUID();

/**
 * An in-memory cell exercising only the role rules. The transaction runs
 * the callback directly; row-level security and locking are covered by the
 * integration test against real PostgreSQL.
 * @param {{roles?: object[], grants?: Record<string, string[]>, assignments?: object[], members?: Record<string, string>}} [seed]
 */
function fakeCell({
  roles = [],
  grants = {},
  assignments = [],
  members = {},
} = {}) {
  const roleRows = new Map(roles.map(row => [row.id, { ...row }]));
  const grantSets = new Map(Object.entries(grants));
  const assignmentRows = assignments.map(row => ({ ...row }));
  const tenantSettings = [];
  const tx = {
    one: vi.fn(async (sql, params) => {
      if (sql.includes('set_config')) tenantSettings.push(params[0]);
      return {};
    }),
  };
  const activeAssignment = (userId, roleId) =>
    assignmentRows.find(
      row =>
        row.portal_user_id === userId &&
        row.role_id === roleId &&
        !row.deactivated_at
    ) ?? null;
  return {
    tenantSettings,
    assignmentRows,
    txHandle: tx,
    tx: async operation => operation(tx),
    roles: {
      lockById: async id => roleRows.get(id) ?? null,
      byId: async id => roleRows.get(id) ?? null,
      byIds: async ids => ids.map(id => roleRows.get(id)).filter(Boolean),
      list: async ({ includeArchived }) =>
        [...roleRows.values()]
          .filter(row => includeArchived || !row.deactivated_at)
          .sort((a, b) => a.code.localeCompare(b.code)),
      lockByCode: async (_tenant, code) =>
        [...roleRows.values()].find(row => row.code === code) ?? null,
      insert: async dto => {
        const row = {
          id: randomUUID(),
          revision: 1,
          deactivated_at: null,
          ...dto,
        };
        roleRows.set(row.id, row);
        return row;
      },
      saveRevision: async (id, changes) => {
        const row = roleRows.get(id);
        if ('name' in changes) row.name = changes.name;
        if ('description' in changes) row.description = changes.description;
        if ('archived' in changes)
          row.deactivated_at = changes.archived ? new Date() : null;
        row.revision += 1;
        return { ...row };
      },
    },
    role_grants: {
      patternsFor: async id => [...(grantSets.get(id) ?? [])].sort(),
      patternsByRole: async ids =>
        new Map(ids.map(id => [id, [...(grantSets.get(id) ?? [])].sort()])),
      replaceFor: async ({ roleId }, patterns) => {
        grantSets.set(roleId, [...patterns]);
      },
    },
    role_assignments: {
      lockActive: async (userId, roleId) => activeAssignment(userId, roleId),
      activeRoleIds: async userId =>
        assignmentRows
          .filter(row => row.portal_user_id === userId && !row.deactivated_at)
          .map(row => row.role_id),
      countActive: async roleId =>
        assignmentRows.filter(
          row =>
            row.role_id === roleId &&
            !row.deactivated_at &&
            members[row.portal_user_id] === 'active'
        ).length,
      insert: async dto => {
        const row = { id: randomUUID(), deactivated_at: null, ...dto };
        assignmentRows.push(row);
        return row;
      },
      archive: async id => {
        assignmentRows.find(row => row.id === id).deactivated_at = new Date();
      },
    },
    tenant_members: {
      membershipStatus: async (_tenant, userId) => members[userId] ?? null,
    },
  };
}

/**
 * A role row.
 * @param {object} overrides
 * @returns {object}
 */
function role(overrides) {
  return {
    id: randomUUID(),
    tenant_id: TENANT,
    name: overrides.code,
    description: null,
    is_immutable: false,
    revision: 1,
    deactivated_at: null,
    ...overrides,
  };
}

/**
 * Build an access-control context around `cell`.
 * @param {object} cell
 * @param {{patterns?: string[], isNapsoft?: boolean, code?: string}} [options]
 */
function context(
  cell,
  { patterns = ['ACME::*::*::*'], isNapsoft = false, code = 'ACME' } = {}
) {
  return {
    cell,
    tenant: { id: TENANT, code, isNapsoft },
    napsoftCode: 'NAP',
    actorId: ACTOR,
    actorPatterns: async () => patterns,
    catalogue: capabilityCatalogue(),
    record: vi.fn(async () => {}),
  };
}

const READ_ROLES = 'ACME::access-control::roles::read';

describe('reads', () => {
  it('lists active roles by default and scopes every transaction to the tenant', async () => {
    const active = role({ code: 'clerk' });
    const archived = role({ code: 'old', deactivated_at: new Date() });
    const cell = fakeCell({
      roles: [active, archived],
      grants: { [active.id]: [READ_ROLES] },
    });
    const ctx = context(cell);
    expect((await listRoles(ctx)).map(r => r.code)).toEqual(['clerk']);
    const all = await listRoles(ctx, { includeArchived: true });
    expect(all.map(r => [r.code, r.archived])).toEqual([
      ['clerk', false],
      ['old', true],
    ]);
    expect(all[0].grants).toEqual([READ_ROLES]);
    expect(cell.tenantSettings).toEqual([TENANT, TENANT]);
  });

  it('reports NOT_FOUND for an unknown or malformed role ID', async () => {
    const ctx = context(fakeCell());
    await expect(getRole(ctx, randomUUID())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(getRole(ctx, 'nope')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('createRole', () => {
  it('creates a custom role with sorted, distinct grants and records it (R015)', async () => {
    const ctx = context(fakeCell());
    const view = await createRole(ctx, {
      code: 'clerk',
      name: 'Clerk',
      grants: [READ_ROLES, 'ACME::access-control::roles::write', READ_ROLES],
    });
    expect(view).toMatchObject({
      code: 'clerk',
      isImmutable: false,
      archived: false,
      revision: 1,
    });
    expect(ctx.record).toHaveBeenCalledWith(
      expect.objectContaining({ eventKey: 'role.created', roleId: view.id }),
      ctx.cell.txHandle
    );
  });

  it('records inside the cell transaction, so a failed record fails the change (R015)', async () => {
    const ctx = context(fakeCell());
    ctx.record.mockRejectedValueOnce(Object.assign(new Error(), { code: 'X' }));
    await expect(
      createRole(ctx, { code: 'clerk', name: 'Clerk', grants: [] })
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
  });

  it.each([
    [{ code: 'Bad', name: 'x', grants: [] }],
    [{ code: 'clerk', name: '', grants: [] }],
    [{ code: 'clerk', name: 'x', grants: ['nap::*::*::*'] }],
    [{ code: 'clerk', name: 'x', grants: ['ACME::unknown::*::*'] }],
    [{ code: 'clerk', name: 'x', grants: [], extra: true }],
  ])('rejects invalid input %# (R003, R004)', async body => {
    await expect(createRole(context(fakeCell()), body)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('rejects an immutable code and an existing code with CONFLICT (R013)', async () => {
    const cell = fakeCell({
      roles: [role({ code: 'clerk', deactivated_at: new Date() })],
    });
    for (const code of ['tenant_admin', 'clerk'])
      await expect(
        createRole(context(cell), { code, name: 'x', grants: [] })
      ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects grants beyond the actor with GRANT_EXCEEDS_ACTOR (R011)', async () => {
    const ctx = context(fakeCell(), {
      patterns: ['ACME::access-control::*::*'],
    });
    await expect(
      createRole(ctx, { code: 'wide', name: 'Wide', grants: ['ACME::*::*::*'] })
    ).rejects.toMatchObject({ code: 'GRANT_EXCEEDS_ACTOR' });
    await expect(
      createRole(ctx, {
        code: 'napsoft',
        name: 'Napsoft',
        grants: ['*::access-control::roles::read'],
      })
    ).rejects.toMatchObject({ code: 'GRANT_EXCEEDS_ACTOR' });
    expect(ctx.record).not.toHaveBeenCalled();
    await expect(
      createRole(ctx, { code: 'ok', name: 'Ok', grants: [READ_ROLES] })
    ).resolves.toMatchObject({ grants: [READ_ROLES] });
  });
});

describe('updateRole, archiveRole, restoreRole', () => {
  it('rejects immutable roles with ROLE_IMMUTABLE (R013)', async () => {
    const admin = role({ code: 'tenant_admin', is_immutable: true });
    const ctx = context(fakeCell({ roles: [admin] }));
    await expect(
      updateRole(ctx, admin.id, { name: 'x', revision: 1 })
    ).rejects.toMatchObject({ code: 'ROLE_IMMUTABLE' });
    await expect(
      archiveRole(ctx, admin.id, { revision: 1 })
    ).rejects.toMatchObject({ code: 'ROLE_IMMUTABLE' });
  });

  it('rejects a stale revision with STALE_REVISION', async () => {
    const clerk = role({ code: 'clerk', revision: 3 });
    const ctx = context(fakeCell({ roles: [clerk] }));
    await expect(
      updateRole(ctx, clerk.id, { name: 'x', revision: 2 })
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });
    await expect(
      archiveRole(ctx, clerk.id, { revision: 2 })
    ).rejects.toMatchObject({ code: 'STALE_REVISION' });
  });

  it('replaces the grant set and records before and after (R015)', async () => {
    const clerk = role({ code: 'clerk' });
    const cell = fakeCell({
      roles: [clerk],
      grants: { [clerk.id]: [READ_ROLES] },
    });
    const ctx = context(cell);
    const view = await updateRole(ctx, clerk.id, {
      grants: ['ACME::access-control::roles::write'],
      revision: 1,
    });
    expect(view).toMatchObject({
      revision: 2,
      grants: ['ACME::access-control::roles::write'],
    });
    const change = ctx.record.mock.calls[0][0];
    expect(change.eventKey).toBe('role.updated');
    expect(JSON.parse(change.details.before).grants).toEqual([READ_ROLES]);
    expect(JSON.parse(change.details.after).grants).toEqual([
      'ACME::access-control::roles::write',
    ]);
  });

  it("requires the actor to cover the role's current grants too (R011)", async () => {
    const wide = role({ code: 'wide' });
    const ctx = context(
      fakeCell({ roles: [wide], grants: { [wide.id]: ['*::*::*::*'] } })
    );
    await expect(
      updateRole(ctx, wide.id, { grants: [READ_ROLES], revision: 1 })
    ).rejects.toMatchObject({ code: 'GRANT_EXCEEDS_ACTOR' });
  });

  it('archives and restores keeping grants and assignments (R014)', async () => {
    const clerk = role({ code: 'clerk' });
    const user = randomUUID();
    const cell = fakeCell({
      roles: [clerk],
      grants: { [clerk.id]: [READ_ROLES] },
      assignments: [
        { id: randomUUID(), portal_user_id: user, role_id: clerk.id },
      ],
    });
    const ctx = context(cell);
    const archived = await archiveRole(ctx, clerk.id, { revision: 1 });
    expect(archived).toMatchObject({ archived: true, grants: [READ_ROLES] });
    const restored = await restoreRole(ctx, clerk.id, {
      revision: archived.revision,
    });
    expect(restored).toMatchObject({ archived: false, grants: [READ_ROLES] });
    expect(cell.assignmentRows.filter(r => !r.deactivated_at)).toHaveLength(1);
    expect(ctx.record.mock.calls.map(([c]) => c.eventKey)).toEqual([
      'role.archived',
      'role.restored',
    ]);
  });
});

describe('assignRole and removeRole', () => {
  it('assigns an active member, and a repeat returns the same assignment without an event', async () => {
    const clerk = role({ code: 'clerk' });
    const user = randomUUID();
    const cell = fakeCell({
      roles: [clerk],
      grants: { [clerk.id]: [READ_ROLES] },
      members: { [user]: 'active' },
    });
    const ctx = context(cell);
    const first = await assignRole(ctx, user, clerk.id);
    expect(first.roles.map(r => r.code)).toEqual(['clerk']);
    await assignRole(ctx, user, clerk.id);
    expect(cell.assignmentRows).toHaveLength(1);
    expect(ctx.record).toHaveBeenCalledTimes(1);
    expect(ctx.record.mock.calls[0][0].eventKey).toBe('role.granted');
  });

  it('rejects a non-member or suspended member with NOT_MEMBER', async () => {
    const clerk = role({ code: 'clerk' });
    const suspended = randomUUID();
    const ctx = context(
      fakeCell({ roles: [clerk], members: { [suspended]: 'suspended' } })
    );
    for (const user of [randomUUID(), suspended])
      await expect(assignRole(ctx, user, clerk.id)).rejects.toMatchObject({
        code: 'NOT_MEMBER',
      });
  });

  it('rejects assigning or removing a role beyond the actor (R011)', async () => {
    const wide = role({ code: 'wide' });
    const user = randomUUID();
    const ctx = context(
      fakeCell({
        roles: [wide],
        grants: { [wide.id]: ['*::*::*::read'] },
        members: { [user]: 'active' },
        assignments: [
          { id: randomUUID(), portal_user_id: user, role_id: wide.id },
        ],
      })
    );
    await expect(assignRole(ctx, user, wide.id)).rejects.toMatchObject({
      code: 'GRANT_EXCEEDS_ACTOR',
    });
    await expect(removeRole(ctx, user, wide.id)).rejects.toMatchObject({
      code: 'GRANT_EXCEEDS_ACTOR',
    });
  });

  it('refuses to remove the last tenant_admin, then allows it once another exists (R012)', async () => {
    const admin = role({ code: 'tenant_admin', is_immutable: true });
    const [first, second] = [randomUUID(), randomUUID()];
    const cell = fakeCell({
      roles: [admin],
      grants: { [admin.id]: ['ACME::*::*::*'] },
      members: { [first]: 'active', [second]: 'active' },
      assignments: [
        { id: randomUUID(), portal_user_id: first, role_id: admin.id },
      ],
    });
    const ctx = context(cell);
    await expect(removeRole(ctx, first, admin.id)).rejects.toMatchObject({
      code: 'LAST_ADMIN',
    });
    await assignRole(ctx, second, admin.id);
    await expect(removeRole(ctx, first, admin.id)).resolves.toEqual({
      userId: first,
      roles: [],
    });
    expect(ctx.record.mock.calls.at(-1)[0].eventKey).toBe('role.revoked');
  });

  it('counts only active members toward the last admin (R012)', async () => {
    const admin = role({ code: 'tenant_admin', is_immutable: true });
    const [active, suspended] = [randomUUID(), randomUUID()];
    const seed = () =>
      fakeCell({
        roles: [admin],
        grants: { [admin.id]: ['ACME::*::*::*'] },
        members: { [active]: 'active', [suspended]: 'suspended' },
        assignments: [active, suspended].map(user => ({
          id: randomUUID(),
          portal_user_id: user,
          role_id: admin.id,
        })),
      });
    await expect(
      removeRole(context(seed()), active, admin.id)
    ).rejects.toMatchObject({ code: 'LAST_ADMIN' });
    await expect(
      removeRole(context(seed()), suspended, admin.id)
    ).resolves.toMatchObject({ roles: [] });
  });

  it('guards platform_admin only in the Napsoft tenant (R012)', async () => {
    const platform = role({ code: 'platform_admin', is_immutable: true });
    const user = randomUUID();
    const seed = () =>
      fakeCell({
        roles: [platform],
        grants: { [platform.id]: ['*::*::*::*', 'NAP::*::*::*'] },
        members: { [user]: 'active' },
        assignments: [
          { id: randomUUID(), portal_user_id: user, role_id: platform.id },
        ],
      });
    const own = ['*::*::*::*', 'NAP::*::*::*'];
    await expect(
      removeRole(
        context(seed(), { patterns: own, isNapsoft: true, code: 'NAP' }),
        user,
        platform.id
      )
    ).rejects.toMatchObject({ code: 'LAST_ADMIN' });
    await expect(
      removeRole(context(seed(), { patterns: own }), user, platform.id)
    ).resolves.toMatchObject({ roles: [] });
  });

  it('reports NOT_FOUND for an unassigned removal and a non-member read', async () => {
    const clerk = role({ code: 'clerk' });
    const ctx = context(fakeCell({ roles: [clerk] }));
    await expect(removeRole(ctx, randomUUID(), clerk.id)).rejects.toMatchObject(
      { code: 'NOT_FOUND' }
    );
    await expect(userRoles(ctx, randomUUID())).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
