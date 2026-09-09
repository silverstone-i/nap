/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import request from 'supertest';
import { redisFixture } from '../fixtures/redis.js';
import { authDatabase, authEnv } from '../fixtures/authDatabase.js';
import { withAdminTransaction } from '../../src/db/withAdminTransaction.js';
import { withTenantTransaction } from '../../src/db/withTenantTransaction.js';
import { loadGrants, buildPolicy } from '../../src/services/authorization.js';
import { fullSession } from '../fixtures/testSession.js';
import { cachedAssignment } from '../../src/services/cachedSecurityState.js';
import { cachedLookup } from '../../src/services/authorizationCache.js';
import { CacheRevisions } from '../../src/modules/admin-tenancy/models/CacheRevisions.js';
import { Roles } from '../../src/modules/core/models/Roles.js';
import { RoleAssignments } from '../../src/modules/core/models/RoleAssignments.js';
import { AssignmentCompanies } from '../../src/modules/core/models/AssignmentCompanies.js';
import { AssignmentProjects } from '../../src/modules/projects/models/AssignmentProjects.js';
import { TenantBindings } from '../../src/modules/cell-tenancy/models/TenantBindings.js';
import { CacheRevisions as LocalCacheRevisions } from '../../src/modules/cell-tenancy/models/CacheRevisions.js';
import { Cells } from '../../src/modules/admin-tenancy/models/Cells.js';
import { cacheTransaction } from '../../src/db/authorizationCache.js';

let test: Awaited<ReturnType<typeof authDatabase>>;
let redis: Awaited<ReturnType<typeof redisFixture>>;
beforeAll(async () => {
  redis = await redisFixture();
  test = await authDatabase();
  test.admin.authorizationCache = { cache: redis.cache, database: 'admin' };
  test.cell.authorizationCache = { cache: redis.cache, database: 'cell-1' };
}, 30000);
afterAll(async () => {
  await test?.cleanup();
  await redis?.cleanup();
  vi.restoreAllMocks();
}, 30000);

it('removes assignment queries on warm hits, keeps freshness queries, and uses a five-minute TTL', async () => {
  const load = vi.spyOn(Cells.prototype, 'assignment');
  const freshness = vi.spyOn(CacheRevisions.prototype, 'current');
  const binding = test.admin.authorizationCache;
  test.admin.authorizationCache = undefined;
  const baseline: number[] = [];
  for (let i = 0; i < 5; i++) {
    const started = performance.now();
    await withAdminTransaction(test.admin, tx =>
      cachedAssignment(tx, test.root.tenantId)
    );
    baseline.push(performance.now() - started);
  }
  const baselineQueries = load.mock.calls.length;
  load.mockClear();
  test.admin.authorizationCache = binding;
  const timings: number[] = [];
  for (let i = 0; i < 6; i++) {
    const started = performance.now();
    await withAdminTransaction(test.admin, tx =>
      cachedAssignment(tx, test.root.tenantId)
    );
    timings.push(performance.now() - started);
  }
  expect(load).toHaveBeenCalledTimes(1);
  expect(freshness).toHaveBeenCalledTimes(7);
  const keys = await redis.keys();
  expect(keys.length).toBeGreaterThan(0);
  expect(await redis.direct.ttl(keys[0])).toBeGreaterThan(290);
  expect(await redis.direct.ttl(keys[0])).toBeLessThanOrEqual(300);
  // Revoke the authoritative revision read even though a warm Redis value exists.
  await test.owner.none('REVOKE SELECT ON admin.cache_revisions FROM $1:name', [
    test.fixture.role,
  ]);
  try {
    await expect(
      withAdminTransaction(test.admin, tx =>
        cachedAssignment(tx, test.root.tenantId)
      )
    ).rejects.toMatchObject({ code: '42501' });
  } finally {
    await test.owner.none('GRANT SELECT ON admin.cache_revisions TO $1:name', [
      test.fixture.role,
    ]);
  }
  process.stdout.write(
    JSON.stringify({
      cacheEvidence: 'assignment',
      uncachedQueries: baselineQueries,
      uncachedRequests: baseline.length,
      cachedDerivedQueries: load.mock.calls.length,
      cachedRequests: timings.length,
      freshnessQueries: 7,
      uncachedMs: baseline,
      coldMs: timings[0],
      warmMs: timings.slice(1),
    }) + '\n'
  );
  load.mockRestore();
  freshness.mockRestore();
});
it('invalidates on tenant and cell changes without deleting old Redis entries', async () => {
  await withAdminTransaction(test.admin, tx =>
    cachedAssignment(tx, test.root.tenantId)
  );
  const oldKeys = await redis.keys();
  await test.admin.db.tenants.update(test.root.tenantId, {
    company: 'Updated operator',
  });
  expect(
    (
      await withAdminTransaction(test.admin, tx =>
        cachedAssignment(tx, test.root.tenantId)
      )
    )?.company
  ).toBe('Updated operator');
  const cell = (await test.admin.db.cells.findOneBy({ code: 'cell-1' }))!;
  await test.admin.db.cells.update(cell.id, { enabled: false });
  expect(
    (
      await withAdminTransaction(test.admin, tx =>
        cachedAssignment(tx, test.root.tenantId)
      )
    )?.enabled
  ).toBe(false);
  await test.admin.db.cells.update(cell.id, { enabled: true });
  for (const key of oldKeys) expect(await redis.direct.exists(key)).toBe(1);
});
it('does not publish rolled-back fills and makes delayed fills unreachable after a commit', async () => {
  const name = randomUUID();
  await withAdminTransaction(test.admin, tx =>
    cachedLookup(
      tx,
      'racing',
      name,
      z.string(),
      () =>
        tx.cache_revisions.current([
          { domain: 'tenant', entity: test.root.tenantId },
        ]),
      async () => {
        await test.admin.db.tenants.update(test.root.tenantId, {
          company: 'Concurrent update',
        });
        return 'changed during fill';
      }
    )
  );
  expect((await redis.keys()).some(key => key.includes(':racing:'))).toBe(
    false
  );
  await expect(
    withAdminTransaction(test.admin, async tx => {
      await cachedLookup(
        tx,
        'rollback',
        name,
        z.string(),
        () => Promise.resolve(name),
        () => Promise.resolve('uncommitted')
      );
      throw new Error('rollback');
    })
  ).rejects.toThrow('rollback');
  expect((await redis.keys()).some(key => key.includes(':rollback:'))).toBe(
    false
  );
  let pending: [string, string][] = [];
  await withAdminTransaction(test.admin, async tx => {
    await test.admin.db.tenants.update(test.root.tenantId, {
      company: 'Before delayed fill',
    });
    await cachedAssignment(tx, test.root.tenantId);
    pending = [...tx[cacheTransaction]!.fills];
    tx[cacheTransaction]!.fills.clear();
  });
  await test.admin.db.tenants.update(test.root.tenantId, {
    company: 'After delayed fill',
  });
  for (const [key, value] of pending) await redis.cache.write(key, value);
  expect(
    (
      await withAdminTransaction(test.admin, tx =>
        cachedAssignment(tx, test.root.tenantId)
      )
    )?.company
  ).toBe('After delayed fill');
});
it('falls back for corrupted entries, eviction, outage and stalled commands, then recovers safely', async () => {
  const lookup = () =>
    withAdminTransaction(test.admin, tx =>
      cachedAssignment(tx, test.root.tenantId)
    );
  await lookup();
  for (const key of await redis.keys())
    await redis.direct.set(key, 'invalid-json', { EX: 300 });
  expect((await lookup())?.enabled).toBe(true);
  const keys = await redis.keys();
  if (keys.length) await redis.direct.del(keys);
  expect((await lookup())?.enabled).toBe(true);
  redis.disconnect();
  await delay(50);
  await test.admin.db.tenants.update(test.root.tenantId, {
    company: 'Changed offline',
  });
  expect((await lookup())?.company).toBe('Changed offline');
  redis.reconnect();
  await delay(1200);
  expect((await lookup())?.company).toBe('Changed offline');
  redis.stall();
  const started = performance.now();
  expect((await lookup())?.company).toBe('Changed offline');
  expect(performance.now() - started).toBeLessThan(1000);
  redis.disconnect();
  redis.reconnect();
  await delay(1200);
  expect((await lookup())?.company).toBe('Changed offline');
});
it('keeps session rotation, expiry, logout and principal revocation live after warming', async () => {
  const base = '/api/admin-tenancy/v1/auth';
  const logged = await request(test.server)
    .post(base + '/login')
    .send({ email: authEnv.ROOT_EMAIL, password: authEnv.ROOT_PASSWORD });
  expect(logged.status).toBe(200);
  const cookie = String(logged.headers['set-cookie'][0]).split(';')[0];
  for (let i = 0; i < 2; i++)
    expect(
      (
        await request(test.server)
          .get(base + '/session')
          .set('Cookie', cookie)
      ).status
    ).toBe(200);
  const principal = async () =>
    withAdminTransaction(test.admin, tx =>
      tx.cache_revisions.current([
        { domain: 'principal', entity: test.root.actorId },
      ])
    );
  const before = await principal();
  await request(test.server)
    .get(base + '/session')
    .set('Cookie', cookie);
  expect(await principal()).toBe(before);
  await request(test.server)
    .post(base + '/logout')
    .set('Cookie', cookie);
  expect(
    (
      await request(test.server)
        .get(base + '/session')
        .set('Cookie', cookie)
    ).status
  ).toBe(401);
});
it('isolates local revision rows and rolls their invalidation back with the security write', async () => {
  const a = randomUUID(),
    b = randomUUID();
  for (const tenant of [a, b])
    await withTenantTransaction(test.cell, tenant, tx =>
      tx.none('INSERT INTO cell.cache_revisions(tenant_id) VALUES($1)', [
        tenant,
      ])
    );
  expect(await test.cell.db.cache_revisions.current(a)).toBeUndefined();
  expect(
    await withTenantTransaction(test.cell, a, tx =>
      tx.cache_revisions.current(b)
    )
  ).toBeUndefined();
  await expect(
    withTenantTransaction(test.cell, a, tx =>
      tx.none(
        'UPDATE cell.cache_revisions SET tenant_id=$1 WHERE tenant_id=$2',
        [b, a]
      )
    )
  ).rejects.toMatchObject({ code: '42501' });
  const before = await withAdminTransaction(test.admin, tx =>
    tx.cache_revisions.current([
      { domain: 'tenant', entity: test.root.tenantId },
    ])
  );
  await expect(
    withAdminTransaction(test.admin, async tx => {
      await tx.tenants.update(test.root.tenantId, { company: 'rollback' });
      throw new Error('rollback');
    })
  ).rejects.toThrow('rollback');
  expect(
    await withAdminTransaction(test.admin, tx =>
      tx.cache_revisions.current([
        { domain: 'tenant', entity: test.root.tenantId },
      ])
    )
  ).toBe(before);
});

it('preserves cached scoped field grants and never shares controlled administrator authority', async () => {
  const tenant = randomUUID(),
    actor = randomUUID(),
    binding = randomUUID();
  const seeded = await withTenantTransaction(test.cell, tenant, async tx => {
    await tx.cell_tenants.insert({
      id: tenant,
      tenant_id: tenant,
      code: 'CACHE',
      status: 'active',
    });
    await tx.tenant_user_bindings.insert({
      id: binding,
      tenant_id: tenant,
      portal_user_id: actor,
      status: 'active',
    });
    const a = await tx.companies.insert({
      tenant_id: tenant,
      code: 'A',
      name: 'A',
    });
    const b = await tx.companies.insert({
      tenant_id: tenant,
      code: 'B',
      name: 'B',
    });
    const role = await tx.roles.insert({
      tenant_id: tenant,
      code: 'field_reader',
      name: 'Field reader',
      capabilities: JSON.stringify(['core::companies::read']),
      fields: JSON.stringify([
        {
          resource: 'core::companies',
          group: 'costs',
          view: true,
          edit: false,
        },
      ]),
    });
    const assignment = await tx.role_assignments.insert({
      tenant_id: tenant,
      role_id: role.id,
      binding_id: binding,
      scope: 'companies',
    });
    await tx.assignment_companies.insert({
      tenant_id: tenant,
      assignment_id: assignment.id,
      company_id: a.id,
    });
    return { a, b, role, assignment };
  });
  const session = fullSession(tenant, actor);
  const load = () =>
    withTenantTransaction(test.cell, tenant, tx => loadGrants(tx, session));
  const reads = [
    vi.spyOn(TenantBindings.prototype, 'findOneBy'),
    vi.spyOn(RoleAssignments.prototype, 'findWhere'),
    vi.spyOn(Roles.prototype, 'findWhere'),
    vi.spyOn(AssignmentCompanies.prototype, 'findWhere'),
    vi.spyOn(AssignmentProjects.prototype, 'findWhere'),
  ];
  const original = test.cell.authorizationCache;
  test.cell.authorizationCache = undefined;
  const uncachedStart = performance.now();
  const uncached = await load();
  const uncachedMs = performance.now() - uncachedStart;
  const uncachedReads = reads.reduce(
    (count, spy) => count + spy.mock.calls.length,
    0
  );
  expect(uncachedReads).toBe(5);
  test.cell.authorizationCache = original;
  await load();
  for (const spy of reads) spy.mockClear();
  const revisions = vi.spyOn(LocalCacheRevisions.prototype, 'current');
  const warmStart = performance.now();
  expect(await load()).toEqual(uncached);
  const warmMs = performance.now() - warmStart;
  const warmReads = reads.reduce(
    (count, spy) => count + spy.mock.calls.length,
    0
  );
  expect(warmReads).toBe(0);
  expect(revisions).toHaveBeenCalledTimes(1);
  process.stdout.write(
    JSON.stringify({
      cacheEvidence: 'scoped-grants',
      uncachedReads,
      warmReads,
      warmRevisionReads: revisions.mock.calls.length,
      tenantLockRetained: true,
      uncachedMs,
      warmMs,
    }) + '\n'
  );
  for (const spy of reads) spy.mockRestore();
  revisions.mockRestore();
  const controlled = {
    ...session,
    platformAdmin: true,
    view: {
      actorId: actor,
      email: 'fixture@nap.test',
      tenantId: tenant,
      tenantCode: 'CACHE',
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      state: 'tenant-selected' as const,
      platformPermissions: [],
      controlledAccess: {
        mode: 'access' as const,
        operatorId: actor,
        reason: 'test',
      },
    },
  };
  expect(
    (
      await withTenantTransaction(test.cell, tenant, tx =>
        loadGrants(tx, controlled)
      )
    ).admin
  ).toBe(true);
  const cold = await load();
  expect(cold.admin).toBe(false);
  expect(await load()).toEqual(cold);
  const policy = buildPolicy(
    'core::companies',
    'read',
    await load(),
    undefined,
    [],
    [{ name: 'costs', columns: ['cost'] }]
  );
  expect(policy.redact({ id: seeded.a.id, cost: 10 })).toHaveProperty('cost');
  expect(policy.redact({ id: seeded.b.id, cost: 10 })).not.toHaveProperty(
    'cost'
  );
  expect(() => policy.check({ id: seeded.b.id })).toThrow();
  await withTenantTransaction(test.cell, tenant, tx =>
    tx.roles.update(seeded.role.id, { fields: JSON.stringify([]) })
  );
  expect((await load()).grants[0].fields).toEqual([]);
  await withTenantTransaction(test.cell, tenant, tx =>
    tx.roles.update(seeded.role.id, { deactivated_at: new Date() })
  );
  expect((await load()).grants).toEqual([]);
  await withTenantTransaction(test.cell, tenant, tx =>
    tx.tenant_user_bindings.update(binding, { status: 'locked' })
  );
  expect((await load()).admin).toBe(false);
  expect((await redis.keys()).some(k => k.includes(tenant))).toBe(true);
});
it('changes both principal revisions when platform-role ownership moves and ignores audit-only writes', async () => {
  const ids: string[] = [];
  for (let i = 0; i < 2; i++) {
    const user = await test.admin.db.portal_users.insert({
      email: randomUUID() + '@nap.test',
      password_hash: 'test-only-unused',
      status: 'active',
    });
    ids.push(user.id);
  }
  const revisions = () =>
    withAdminTransaction(test.admin, tx =>
      tx.cache_revisions.current(
        ids.map(entity => ({ domain: 'principal', entity }))
      )
    );
  const role = await test.admin.db.platform_roles.insert({
    portal_user_id: ids[0],
    role: 'support',
  });
  const before = (await revisions())!.split('.');
  await test.admin.db.platform_roles.update(role.id, {
    portal_user_id: ids[1],
  });
  const after = (await revisions())!.split('.');
  expect(after[0]).not.toBe(before[0]);
  expect(after[1]).not.toBe(before[1]);
  await test.owner.none(
    'UPDATE admin.platform_roles SET updated_at=clock_timestamp() WHERE id=$1',
    [role.id]
  );
  expect((await revisions())!.split('.')).toEqual(after);
  await test.owner.none('DELETE FROM admin.platform_roles WHERE id=$1', [
    role.id,
  ]);
  expect((await revisions())!.split('.')[1]).not.toBe(after[1]);
});
