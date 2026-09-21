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

/**
 * Build a write authority for a root-equivalent operator.
 * @returns {{actorId: string, granted: boolean, deniedTenantIds: string[]}}
 */
function authority() {
  return { actorId: randomUUID(), granted: true, deniedTenantIds: [] };
}

/** A valid creation body, unique per call so tests don't collide on code. */
function body(overrides = {}) {
  return {
    code: 'T' + randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase(),
    name: 'Acme Construction',
    tier: 'starter',
    ...overrides,
  };
}

/**
 * Read the `tenant.created` events recorded for one actor, oldest first.
 * @param {string} actorId
 * @returns {Promise<object[]>}
 */
function eventsFor(actorId) {
  return db.any(
    "SELECT event_key,outcome,target_id,details FROM admin.managed_events WHERE event_key='tenant.created' AND actor_id=$1 ORDER BY occurred_at,id",
    [actorId]
  );
}

/**
 * Read the current `{tenant, list}` cache revision, or `0` if unstored.
 * @returns {Promise<string>}
 */
async function tenantListRevision() {
  const row = await db.cache_revisions.current([
    { domain: 'tenant', entity: 'list' },
  ]);
  return row[0].revision;
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

describe('creation', () => {
  it('creates a normalized pending tenant with no cell and advances the tenant list revision', async () => {
    const before = await tenantListRevision();
    const write = authority();
    const request = body({ code: '  acme  ', name: '  Acme Construction  ' });
    const tenant = await createTenant(db, write, request, randomUUID());

    expect(tenant).toEqual({
      id: expect.any(String),
      code: 'ACME',
      name: 'Acme Construction',
      tier: 'starter',
      status: 'pending',
      cellId: null,
      provisioned: false,
      rbacReady: false,
    });

    const row = await db.tenants.findById(tenant.id);
    expect(row.is_napsoft).toBe(false);
    expect(row.revision).toBe(1);

    expect(await eventsFor(write.actorId)).toEqual([
      {
        event_key: 'tenant.created',
        outcome: 'succeeded',
        target_id: tenant.id,
        details: {
          tenant_code: 'ACME',
          name: 'Acme Construction',
          tier: 'starter',
        },
      },
    ]);
    expect(await tenantListRevision()).toBe(String(BigInt(before) + 1n));
  });

  it('rejects invalid input and is_napsoft, without creating a tenant or advancing the revision', async () => {
    const before = await tenantListRevision();
    const write = authority();
    for (const bad of [
      body({ code: 'a' }),
      body({ name: '' }),
      body({ tier: 'gold' }),
      { ...body(), is_napsoft: true },
    ])
      await expect(
        createTenant(db, write, bad, randomUUID())
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });

    expect(await tenantListRevision()).toBe(before);
    const failed = await eventsFor(write.actorId);
    expect(failed).toHaveLength(4);
    expect(failed.every(event => event.outcome === 'failed')).toBe(true);
  });

  it('refuses an actor with no control::write capability, recording a denial', async () => {
    const denied = {
      actorId: randomUUID(),
      granted: false,
      deniedTenantIds: [],
    };
    await expect(
      createTenant(db, denied, body(), randomUUID())
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(await eventsFor(denied.actorId)).toEqual([
      expect.objectContaining({ outcome: 'denied' }),
    ]);
  });

  it('reports a case-insensitive duplicate code as a conflict', async () => {
    const write = authority();
    const created = await createTenant(db, write, body(), randomUUID());
    await expect(
      createTenant(
        db,
        write,
        body({ code: created.code.toLowerCase() }),
        randomUUID()
      )
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('idempotency', () => {
  it('returns the original representation for a repeated key and payload', async () => {
    const write = authority();
    const idempotencyKey = randomUUID();
    const request = body();
    const first = await createTenant(db, write, request, idempotencyKey);
    const second = await createTenant(db, write, request, idempotencyKey);
    expect(second).toEqual(first);
    expect(
      await db.tenants.lockActiveByCode(request.code, {
        tx: db,
      })
    ).toMatchObject({ id: first.id });
    expect(await eventsFor(write.actorId)).toHaveLength(1);
  });

  it('reports a reused key with a different payload as an idempotency conflict, without a second tenant', async () => {
    const write = authority();
    const idempotencyKey = randomUUID();
    const first = await createTenant(db, write, body(), idempotencyKey);
    await expect(
      createTenant(
        db,
        write,
        body({ name: 'A Different Name' }),
        idempotencyKey
      )
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });

    const row = await db.tenants.findById(first.id);
    expect(row.name).toBe(first.name);
  });

  it('replays the original snapshot even after the live tenant row later changed', async () => {
    const write = authority();
    const idempotencyKey = randomUUID();
    const request = body();
    const first = await createTenant(db, write, request, idempotencyKey);

    await db.none(
      "UPDATE admin.tenants SET name='Renamed Out Of Band', tier='growth' WHERE id=$1",
      [first.id]
    );

    const second = await createTenant(db, write, request, idempotencyKey);
    expect(second).toEqual(first);
  });

  it('serializes two concurrent requests sharing one key into a single tenant', async () => {
    const write = authority();
    const idempotencyKey = randomUUID();
    const request = body();
    const [first, second] = await Promise.all([
      createTenant(db, write, request, idempotencyKey),
      createTenant(db, write, request, idempotencyKey),
    ]);
    expect(second).toEqual(first);
    expect(await eventsFor(write.actorId)).toHaveLength(1);
  });

  it('resolves two concurrent requests sharing a code but different keys via code uniqueness', async () => {
    const write = authority();
    const request = body();
    const results = await Promise.allSettled([
      createTenant(db, write, request, randomUUID()),
      createTenant(db, write, request, randomUUID()),
    ]);
    const fulfilled = results.filter(result => result.status === 'fulfilled');
    const rejected = results.filter(result => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'CONFLICT' });
  });
});
