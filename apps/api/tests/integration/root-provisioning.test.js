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
import { bootstrapRoot } from '../../src/modules/admin-tenancy/domain/bootstrap.js';
import { ARGON2_MINIMUM } from '../../src/modules/admin-tenancy/domain/password.js';

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

/**
 * Build a bootstrap config with a unique tenant code and root email.
 *
 * `is_napsoft` and `is_root` are each unique across the whole database, so
 * this suite may create the real owning tenant and root user only once; the
 * tests below run in a deliberate order around that single identity, rather
 * than each claiming its own.
 * @param {object} [overrides]
 * @returns {object}
 */
function bootstrapConfig(overrides = {}) {
  const unique = randomUUID().slice(0, 8);
  return {
    tenantCode: `NAP-${unique}`,
    tenantName: `Test Napsoft ${unique}`,
    rootEmail: `root-${unique}@nap.test`,
    rootPassword: 'correct-horse-battery-staple',
    hashingPolicy: ARGON2_MINIMUM,
    ...overrides,
  };
}

let handle, db;

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
    roleUrl(config.endpoint, 'nap-admin', config.adminPassword)
  );
  await handle.connect();
  db = handle.db;
}, 60000);

afterAll(async () => {
  await handle?.close();
  await using(fixture, tx =>
    tx.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [name])
  );
});

// Run in this order deliberately: the conflict tests below must land before
// any real bootstrap claims the database's single `is_napsoft`/`is_root` row,
// and every later test that needs a real, matching identity reuses `MAIN`
// rather than minting its own.
describe('root provisioning', () => {
  it('reports conflict and rolls back when a non-napsoft tenant already holds the configured code', async () => {
    const cfg = bootstrapConfig();
    await db.tenants.insert({
      tenant_code: cfg.tenantCode,
      name: 'Unrelated tenant',
      is_napsoft: false,
      status: 'active',
    });

    const result = await bootstrapRoot(db, cfg);

    expect(result).toEqual({ status: 'conflict', code: 'TENANT_CONFLICT' });
    const napsoft = await db.tenants.findOneBy(
      { is_napsoft: true },
      { columnWhitelist: ['id'], includeDeactivated: true }
    );
    expect(napsoft).toBeNull();
    const root = await db.portal_users.findOneBy(
      { is_root: true },
      { columnWhitelist: ['id'], includeDeactivated: true }
    );
    expect(root).toBeNull();
  });

  it('reports conflict and rolls back when a non-root user already holds the configured email', async () => {
    const cfg = bootstrapConfig();
    await db.portal_users.insert({
      email: cfg.rootEmail,
      password_hash: 'not-a-real-hash',
      is_root: false,
      status: 'active',
    });

    const result = await bootstrapRoot(db, cfg);

    expect(result).toEqual({ status: 'conflict', code: 'ROOT_CONFLICT' });
    const tenant = await db.tenants.findOneBy(
      { tenant_code: cfg.tenantCode },
      { columnWhitelist: ['id'], includeDeactivated: true }
    );
    expect(tenant).toBeNull();
    const root = await db.portal_users.findOneBy(
      { is_root: true },
      { columnWhitelist: ['id'], includeDeactivated: true }
    );
    expect(root).toBeNull();
  });

  const MAIN = bootstrapConfig();

  it('creates the tenant, root user, and membership, granting root authority without a role assignment', async () => {
    const result = await bootstrapRoot(db, MAIN);

    expect(result.status).toBe('created');
    expect(result.tenant.is_napsoft).toBe(true);
    expect(result.tenant.tenant_code).toBe(MAIN.tenantCode);
    expect(result.rootUser.is_root).toBe(true);
    expect(result.rootUser.email).toBe(MAIN.rootEmail);
    expect(result.rootUser.must_change_password).toBe(false);
    expect(result.rootUser.password_hash).toBeUndefined();
    expect(result.membership.portal_user_id).toBe(result.rootUser.id);
    expect(result.membership.tenant_id).toBe(result.tenant.id);
    expect(result.membership.member_type).toBeNull();
    expect(result.membership.status).toBe('active');
    expect(result.membership.ready).toBe(true);

    const events = await db.managed_events.findWhere(
      { target_id: result.tenant.id },
      'AND',
      {
        columnWhitelist: ['event_key', 'outcome', 'details'],
        orderBy: 'occurred_at',
      }
    );
    expect(events).toEqual([
      expect.objectContaining({
        event_key: 'bootstrap.succeeded',
        outcome: 'succeeded',
      }),
    ]);
    for (const event of events)
      expect(JSON.stringify(event)).not.toMatch(
        /correct-horse-battery-staple|\$argon2/
      );

    const noRoleAssignment = await db.platform_roles.findOneBy(
      { portal_user_id: result.rootUser.id },
      { columnWhitelist: ['id'], includeDeactivated: true }
    );
    expect(noRoleAssignment).toBeNull();
  });

  it('preserves the password hash and every UUID on a repeat run, and writes no new event', async () => {
    const before = await db.portal_users.findOneBy(
      { is_root: true },
      { columnWhitelist: ['id', 'password_hash'] }
    );
    const eventsBefore = await db.managed_events.countAll();

    const second = await bootstrapRoot(db, MAIN);

    expect(second.status).toBe('existing');
    expect(second.rootUser.id).toBe(before.id);
    const after = await db.portal_users.findOneBy(
      { is_root: true },
      { columnWhitelist: ['password_hash'] }
    );
    expect(after.password_hash).toBe(before.password_hash);
    expect(await db.managed_events.countAll()).toBe(eventsBefore);
  });

  it('reports conflict when the existing owning tenant uses a different code', async () => {
    const result = await bootstrapRoot(
      db,
      bootstrapConfig({ tenantCode: `OTHER-${randomUUID().slice(0, 8)}` })
    );

    expect(result).toEqual({ status: 'conflict', code: 'TENANT_CONFLICT' });
  });

  it('reports conflict when the existing root user uses a different email', async () => {
    const result = await bootstrapRoot(
      db,
      bootstrapConfig({
        tenantCode: MAIN.tenantCode,
        tenantName: MAIN.tenantName,
      })
    );

    expect(result).toEqual({ status: 'conflict', code: 'ROOT_CONFLICT' });
  });

  it('serializes concurrent bootstrap attempts on the advisory lock and agrees on the result', async () => {
    const [first, second] = await Promise.all([
      bootstrapRoot(db, MAIN),
      bootstrapRoot(db, MAIN),
    ]);

    expect(first.status).toBe('existing');
    expect(second.status).toBe('existing');
    expect(second.tenant.id).toBe(first.tenant.id);
    expect(second.rootUser.id).toBe(first.rootUser.id);
    expect(second.membership.id).toBe(first.membership.id);
  });
});
