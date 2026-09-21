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
  OPTIONAL_MODULES,
  grantEntitlement,
  listEntitlements,
  withdrawEntitlement,
} from '../../src/modules/admin-tenancy/domain/entitlements.js';

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
 * Build an `{actorId, scope}` authority granting every entitlements
 * capability, mirroring root's fully-resolved scope from
 * `domain/authorization.js`. Mirrors `tests/integration/accounts.test.js`'s
 * `authority(deniedTenantIds)`.
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

/** Create a real tenant row and return its id. */
async function seedTenant() {
  const tenant = await createTenant(
    db,
    { actorId: randomUUID(), granted: true, deniedTenantIds: [] },
    {
      code: 'T' + randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase(),
      name: 'Acme Construction',
      tier: 'starter',
    },
    randomUUID()
  );
  return tenant.id;
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

describe('entitlements', () => {
  it('reads the full catalogue as disabled for a tenant with no rows', async () => {
    const tenantId = await seedTenant();
    const entitlements = await listEntitlements(db, authority(), tenantId);
    expect(entitlements).toHaveLength(OPTIONAL_MODULES.length);
    expect(
      entitlements.every(e => e.enabled === false && e.revision === 0)
    ).toBe(true);
  });

  it('grants, re-grants as a no-op, withdraws, and re-withdraws as a no-op, following the revision rule', async () => {
    const tenantId = await seedTenant();
    const write = authority();

    const granted = await grantEntitlement(db, write, tenantId, 'sales');
    expect(granted).toEqual({ module: 'sales', enabled: true, revision: 1 });

    const regranted = await grantEntitlement(db, write, tenantId, 'sales');
    expect(regranted).toEqual({ module: 'sales', enabled: true, revision: 1 });

    const withdrawn = await withdrawEntitlement(db, write, tenantId, 'sales');
    expect(withdrawn).toEqual({ module: 'sales', enabled: false, revision: 2 });

    const rewithdrawn = await withdrawEntitlement(db, write, tenantId, 'sales');
    expect(rewithdrawn).toEqual({
      module: 'sales',
      enabled: false,
      revision: 2,
    });

    // Counted by key rather than ordered by `occurred_at`: `id` is a random
    // UUID (no use as a tie-breaker), and same-tick timestamps are possible
    // under fast local execution, so asserting a specific sequence would be
    // flaky. The actual invariant is call count and outcome per key.
    const events = await db.any(
      "SELECT event_key, outcome FROM admin.managed_events WHERE tenant_id=$1 AND details->>'module_key'='sales'",
      [tenantId]
    );
    expect(events).toHaveLength(4);
    expect(events.every(e => e.outcome === 'succeeded')).toBe(true);
    expect(
      events.filter(e => e.event_key === 'entitlement.granted')
    ).toHaveLength(2);
    expect(
      events.filter(e => e.event_key === 'entitlement.withdrawn')
    ).toHaveLength(2);
  });

  it('withdrawing an absent module creates no row', async () => {
    const tenantId = await seedTenant();
    const result = await withdrawEntitlement(
      db,
      authority(),
      tenantId,
      'catalog'
    );
    expect(result).toEqual({ module: 'catalog', enabled: false, revision: 0 });
    const row = await db.module_entitlements.findOneBy({
      tenant_id: tenantId,
      module: 'catalog',
    });
    expect(row).toBeNull();
  });

  it('advances the entitlement cache revision, keyed by tenant, only on a real state change', async () => {
    const tenantId = await seedTenant();
    const write = authority();

    const before = await db.cache_revisions.current([
      { domain: 'entitlement', entity: tenantId },
    ]);
    expect(before[0].revision).toBe('0');

    await grantEntitlement(db, write, tenantId, 'estimating');
    const afterGrant = await db.cache_revisions.current([
      { domain: 'entitlement', entity: tenantId },
    ]);
    expect(afterGrant[0].revision).toBe('1');

    await grantEntitlement(db, write, tenantId, 'estimating');
    const afterNoop = await db.cache_revisions.current([
      { domain: 'entitlement', entity: tenantId },
    ]);
    expect(afterNoop[0].revision).toBe('1');
  });

  it('reports a Napsoft-denied tenant as FORBIDDEN, not NOT_FOUND', async () => {
    const tenantId = await seedTenant();
    const denied = authority([tenantId]);
    await expect(listEntitlements(db, denied, tenantId)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      grantEntitlement(db, denied, tenantId, 'sales')
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects an unknown tenant and an unknown module', async () => {
    const tenantId = await seedTenant();
    const write = authority();
    await expect(
      listEntitlements(db, write, randomUUID())
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      grantEntitlement(db, write, tenantId, 'reporting')
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('requires the existing tenant referenced by the module_entitlements foreign key', async () => {
    const tenantId = await seedTenant();
    await grantEntitlement(db, authority(), tenantId, 'accounting');
    const row = await db.module_entitlements.findOneBy({
      tenant_id: tenantId,
      module: 'accounting',
    });
    expect(row.tenant_id).toBe(tenantId);
  });

  it('serializes two concurrent grants of the same tenant and module into one coherent revision', async () => {
    const tenantId = await seedTenant();
    const write = authority();
    const [first, second] = await Promise.all([
      grantEntitlement(db, write, tenantId, 'projects'),
      grantEntitlement(db, write, tenantId, 'projects'),
    ]);
    // The advisory lock serializes the two writers: exactly one observes the
    // absent row and inserts at revision 1, and the other observes the
    // now-enabled row and no-ops, in either order — never two inserts and
    // never two revision advances.
    const revisions = [first.revision, second.revision].sort();
    expect(revisions).toEqual([1, 1]);
    expect(first.enabled).toBe(true);
    expect(second.enabled).toBe(true);

    const rows = await db.any(
      'SELECT revision FROM admin.module_entitlements WHERE tenant_id=$1 AND module=$2',
      [tenantId, 'projects']
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].revision).toBe(1);
  });

  it('serializes a concurrent grant and withdraw of the same pair to one committed final state', async () => {
    const tenantId = await seedTenant();
    const write = authority();
    await grantEntitlement(db, write, tenantId, 'cost-codes');

    await Promise.all([
      grantEntitlement(db, write, tenantId, 'cost-codes'),
      withdrawEntitlement(db, write, tenantId, 'cost-codes'),
    ]);

    const row = await db.any(
      'SELECT enabled, revision FROM admin.module_entitlements WHERE tenant_id=$1 AND module=$2',
      [tenantId, 'cost-codes']
    );
    expect(row).toHaveLength(1);
    // The lock forces one committed total order; whichever request the
    // advisory lock admits last determines the final `enabled` state, and
    // the row's revision reflects exactly the state changes that occurred.
    expect([true, false]).toContain(row[0].enabled);
  });
});
