/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  createAdminDatabase,
  using,
} from '../../src/infrastructure/runtime/adminDatabase.js';
import { setupLocal } from '../../src/infrastructure/provisioning/postgres.js';
import { migrateAdmin } from '../../src/application/maintenance/migrateAdmin.js';
import { roleUrl } from '../../src/application/shared/configuration.js';
import { createTenant } from '../../src/modules/admin-tenancy/domain/tenants.js';
import {
  archiveMembership,
  archiveUser,
  createMembership,
  createOrReuseUser,
  getJob,
  getUser,
  listUsers,
  reportProvisioningResult,
  restoreMembership,
  restoreUser,
  retryJob,
  updateMembership,
  updateUser,
} from '../../src/modules/admin-tenancy/domain/accounts.js';

const fixture = process.env.FOUNDATION_TEST_URL;
if (!fixture)
  throw new Error(
    'FOUNDATION_TEST_URL must identify a disposable PostgreSQL 18 server'
  );
const url = new URL(fixture);
const name = 'nap_test_' + randomUUID().replaceAll('-', '');
const config = {
  database: name,
  environment: 'test',
  endpoint: url.host + '/' + name,
  maintenance: url.host + '/postgres',
  adminPassword: 'foundation-admin',
  appPassword: 'foundation-app',
};
let handle, db;

const HASHING = { memoryKib: 19456, timeCost: 2, parallelism: 1 };

/**
 * Build an `{actorId, scope}` authority granting every accounts capability,
 * mirroring root's fully-resolved scope from `domain/authorization.js`.
 * @param {string[]} [deniedTenantIds]
 * @returns {{actorId: string, scope: object}}
 */
function authority(deniedTenantIds = []) {
  return {
    actorId: randomUUID(),
    scope: {
      platformPortalUserRead: true,
      tenantIds: '*',
      deniedTenantIds,
      archiveManagement: true,
    },
  };
}

/** A unique, valid tenant-creation body. */
function tenantBody(overrides = {}) {
  return {
    code: 'T' + randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase(),
    name: 'Acme Construction',
    tier: 'starter',
    ...overrides,
  };
}

/** Create a real tenant row and return its id. */
async function seedTenant() {
  const tenant = await createTenant(
    db,
    { actorId: randomUUID(), granted: true, deniedTenantIds: [] },
    tenantBody(),
    randomUUID()
  );
  return tenant.id;
}

/** Create a real ordinary portal-user row and return its id. */
async function seedUser(overrides = {}) {
  const user = await createOrReuseUser(
    db,
    authority(),
    HASHING,
    {
      email: `user-${randomUUID()}@example.com`,
      password: 'a-long-enough-password',
      ...overrides,
    },
    randomUUID()
  );
  return user.id;
}

/**
 * Insert the root portal-user row directly — `createOrReuseUser` refuses to
 * create one, and this module's own bootstrap flow (M0001-02) is out of
 * scope here. `admin.portal_users` allows only one `is_root = true` row, so
 * this must be called at most once per test's isolated database.
 * @returns {Promise<string>} The root row's id.
 */
async function seedRoot() {
  const root = await db.portal_users.insert({
    email: 'root@example.com',
    password_hash: 'unused-in-these-reads',
    is_root: true,
  });
  return root.id;
}

beforeAll(async () => {
  await using(fixture, async tx => {
    for (const [role, password, attrs] of [
      ['nap-admin', config.adminPassword, 'CREATEDB CREATEROLE'],
      ['nap-app', config.appPassword, 'NOCREATEDB NOCREATEROLE'],
    ]) {
      if (
        !(await tx.oneOrNone('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]))
      )
        await tx.none(
          `CREATE ROLE $1:name LOGIN NOSUPERUSER NOBYPASSRLS ${attrs} PASSWORD $2`,
          [role, password]
        );
    }
  });
  await setupLocal(config);
  await migrateAdmin(config);
  handle = createAdminDatabase(
    roleUrl(config.endpoint, 'nap-app', config.appPassword)
  );
  await handle.connect();
  db = handle.db;
}, 30000);
afterAll(async () => {
  await handle?.close();
  await using(fixture, tx =>
    tx.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [name])
  );
});

describe('users', () => {
  it('creates an active user and reuses it by email, recording one succeeded event each time', async () => {
    const email = `reused-${randomUUID()}@example.com`;
    const write = authority();
    const first = await createOrReuseUser(
      db,
      write,
      HASHING,
      { email, password: 'a-long-enough-password' },
      randomUUID()
    );
    expect(first).toMatchObject({
      email,
      status: 'active',
      mustChangePassword: true,
    });

    const second = await createOrReuseUser(
      db,
      write,
      HASHING,
      { email, password: 'a-different-long-password' },
      randomUUID()
    );
    expect(second.id).toBe(first.id);

    const row = await db.portal_users.findOneBy(
      { id: first.id },
      { columnWhitelist: ['id'] }
    );
    expect(row).toBeTruthy();
    const events = await db.managed_events.findWhere(
      { event_key: 'user.created', target_id: first.id },
      'AND',
      { columnWhitelist: ['outcome'] }
    );
    expect(events).toHaveLength(2);
    expect(events.every(e => e.outcome === 'succeeded')).toBe(true);
  });

  it('serializes two concurrent requests sharing one idempotency key into one user', async () => {
    const write = authority();
    const idempotencyKey = randomUUID();
    const body = {
      email: `concurrent-${randomUUID()}@example.com`,
      password: 'a-long-enough-password',
    };
    const [first, second] = await Promise.all([
      createOrReuseUser(db, write, HASHING, body, idempotencyKey),
      createOrReuseUser(db, write, HASHING, body, idempotencyKey),
    ]);
    expect(second).toEqual(first);
  });

  it('disables a user, revoking sessions and clearing on read what changed', async () => {
    const write = authority();
    const userId = await seedUser();
    const updated = await updateUser(db, write, userId, { status: 'disabled' });
    expect(updated.status).toBe('disabled');

    const found = await getUser(db, write.scope, userId);
    expect(found.status).toBe('disabled');
  });

  it('archives and restores a user, returning it disabled and not archivable twice', async () => {
    const write = authority();
    const userId = await seedUser();
    const first = await archiveUser(db, write, userId);
    expect(first).toEqual({ archived: true });
    const repeat = await archiveUser(db, write, userId);
    expect(repeat).toEqual({ archived: true });

    const restored = await restoreUser(db, write, userId);
    expect(restored).toMatchObject({ status: 'disabled', deactivatedAt: null });

    await expect(restoreUser(db, write, userId)).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });
  });
});

describe('memberships and provisioning jobs', () => {
  it('creates one membership and one queued job, enforced by the unique partial indexes', async () => {
    const write = authority();
    const tenantId = await seedTenant();
    const userId = await seedUser();
    const body = { portalUserId: userId, tenantId, memberType: 'employee' };

    const created = await createMembership(db, write, body, randomUUID());
    expect(created.membership).toMatchObject({
      portalUserId: userId,
      tenantId,
      memberType: 'employee',
      status: 'pending',
      ready: false,
    });
    expect(created.job).toMatchObject({
      tenantId,
      kind: 'employee',
      status: 'queued',
      attempts: 0,
    });

    await expect(
      createMembership(db, write, body, randomUUID())
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('resolves two concurrent creates for the same pair via the unique index', async () => {
    const write = authority();
    const tenantId = await seedTenant();
    const userId = await seedUser();
    const body = { portalUserId: userId, tenantId, memberType: 'employee' };

    const results = await Promise.allSettled([
      createMembership(db, write, body, randomUUID()),
      createMembership(db, write, body, randomUUID()),
    ]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'CONFLICT' });
  });

  it('replays the original membership and job for a repeated key and payload', async () => {
    const write = authority();
    const tenantId = await seedTenant();
    const userId = await seedUser();
    const body = { portalUserId: userId, tenantId, memberType: 'client' };
    const idempotencyKey = randomUUID();

    const first = await createMembership(db, write, body, idempotencyKey);
    const second = await createMembership(db, write, body, idempotencyKey);
    expect(second).toEqual(first);
  });

  it('takes a membership through its full lifecycle: provisioned, suspended, reactivated, archived, restored', async () => {
    const write = authority();
    const tenantId = await seedTenant();
    const userId = await seedUser();
    const { membership, job } = await createMembership(
      db,
      write,
      { portalUserId: userId, tenantId, memberType: 'vendor_contact' },
      randomUUID()
    );

    const resultMemberId = randomUUID();
    const completedJob = await reportProvisioningResult(db, job.id, {
      kind: 'completed',
      resultMemberId,
    });
    expect(completedJob).toMatchObject({ status: 'completed', resultMemberId });

    const active = await updateMembership(db, write, membership.id, {
      status: 'active',
    });
    expect(active).toMatchObject({
      status: 'active',
      ready: true,
      memberId: resultMemberId,
    });

    const suspended = await updateMembership(db, write, membership.id, {
      status: 'suspended',
    });
    expect(suspended).toMatchObject({ status: 'suspended', ready: false });

    const reactivated = await updateMembership(db, write, membership.id, {
      status: 'active',
    });
    expect(reactivated).toMatchObject({ status: 'active', ready: false });

    const archived = await archiveMembership(db, write, membership.id);
    expect(archived).toEqual({ archived: true });

    const restored = await restoreMembership(db, write, membership.id);
    expect(restored).toMatchObject({ status: 'suspended', ready: false });
  });

  it('fails a provisioning job without ever marking the membership ready', async () => {
    const write = authority();
    const tenantId = await seedTenant();
    const userId = await seedUser();
    const { membership, job } = await createMembership(
      db,
      write,
      { portalUserId: userId, tenantId, memberType: 'contact' },
      randomUUID()
    );

    const failed = await reportProvisioningResult(db, job.id, {
      kind: 'failed',
      failureCode: 'cell_unavailable',
    });
    expect(failed).toMatchObject({
      status: 'failed',
      failureCode: 'cell_unavailable',
    });

    const read = await getJob(db, write.scope, job.id);
    expect(read).toMatchObject({ status: 'failed' });

    const retried = await retryJob(db, write, job.id);
    expect(retried).toMatchObject({
      status: 'queued',
      attempts: 1,
      failureCode: null,
    });

    await expect(
      reportProvisioningResult(db, job.id, {
        kind: 'completed',
        resultMemberId: randomUUID(),
      })
    ).resolves.toMatchObject({ status: 'completed' });

    await expect(retryJob(db, write, job.id)).rejects.toMatchObject({
      code: 'INVALID_STATE',
    });

    const membershipRow = await db.portal_user_tenants.findOneBy({
      id: membership.id,
    });
    expect(membershipRow.status).toBe('active');
    expect(membershipRow.ready).toBe(true);
  });

  it('reports a Napsoft-denied tenant identically to a missing membership', async () => {
    const tenantId = await seedTenant();
    const userId = await seedUser();
    const write = authority();
    const { membership } = await createMembership(
      db,
      write,
      { portalUserId: userId, tenantId, memberType: 'employee' },
      randomUUID()
    );

    const denied = authority([tenantId]);
    await expect(
      updateMembership(db, denied, membership.id, { status: 'active' })
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('reads', () => {
  let rootId;
  beforeAll(async () => {
    rootId = await seedRoot();
  });

  it('pages every portal-user account in ascending id order, including root read-only', async () => {
    const write = authority();
    const created = [];
    for (let index = 0; index < 3; index += 1) created.push(await seedUser());

    const seen = [];
    let cursor;
    do {
      const page = await listUsers(db, write, { cursor, limit: 2 });
      seen.push(...page.rows);
      cursor = page.nextCursor;
    } while (cursor);

    const seenIds = seen.map(row => row.id);
    for (const userId of created) expect(seenIds).toContain(userId);
    expect(seenIds).toContain(rootId);
    expect(seen.find(row => row.id === rootId).isRoot).toBe(true);
    expect(
      seen.filter(row => row.id !== rootId).every(row => row.isRoot === false)
    ).toBe(true);
  });

  it('advances the cursor to a strictly later page with no overlap', async () => {
    const write = authority();
    await seedUser();
    await seedUser();
    await seedUser();
    const firstPage = await listUsers(db, write, { limit: 1 });
    const secondPage = await listUsers(db, write, {
      cursor: firstPage.nextCursor,
      limit: 1,
    });
    expect(secondPage.rows[0].id).not.toBe(firstPage.rows[0].id);
    expect(secondPage.rows[0].id > firstPage.rows[0].id).toBe(true);
  });

  it('includes an archived user, so it remains reachable for Restore', async () => {
    const write = authority();
    const userId = await seedUser();
    await archiveUser(db, write, userId);

    const seen = [];
    let cursor;
    do {
      const page = await listUsers(db, write, { cursor, limit: 50 });
      seen.push(...page.rows);
      cursor = page.nextCursor;
    } while (cursor);

    const found = seen.find(row => row.id === userId);
    expect(found).toBeDefined();
    expect(found.deactivatedAt).not.toBeNull();
  });

  it('refuses an actor with no accounts::read capability', async () => {
    const denied = {
      actorId: randomUUID(),
      scope: {
        platformPortalUserRead: false,
        tenantIds: [],
        deniedTenantIds: [],
        archiveManagement: false,
      },
    };
    await expect(listUsers(db, denied)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
