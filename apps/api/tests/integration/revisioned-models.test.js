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

/** Insert a tenant, a portal user, and their active membership. */
async function seedMembership() {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase();
  const tenant = await db.tenants.insert({
    tenant_code: 'T' + suffix,
    name: 'Acme Construction',
    status: 'active',
  });
  const user = await db.portal_users.insert({
    email: `user-${suffix.toLowerCase()}@test.example`,
    password_hash: 'fixture',
  });
  const membership = await db.portal_user_tenants.insert({
    portal_user_id: user.id,
    tenant_id: tenant.id,
    member_type: 'employee',
    member_id: randomUUID(),
    status: 'active',
  });
  return { tenant, membership };
}

/** Read a row's revision, archived or not. */
async function revisionOf(table, id) {
  const row = await db.one(`SELECT revision FROM admin.${table} WHERE id=$1`, [
    id,
  ]);
  return row.revision;
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

describe('revisioned table models (I0004-R010, R012)', () => {
  it('increments a membership revision when a copied column changes', async () => {
    const { membership } = await seedMembership();
    expect(membership.revision).toBe(1);
    const suspended = await db.portal_user_tenants.update(membership.id, {
      status: 'suspended',
    });
    expect(suspended.revision).toBe(2);
  });

  it('leaves the revision alone for an uncopied column or an unchanged value', async () => {
    const { membership } = await seedMembership();
    const ready = await db.portal_user_tenants.update(membership.id, {
      ready: true,
    });
    expect(ready.revision).toBe(1);
    const same = await db.portal_user_tenants.update(membership.id, {
      status: 'active',
    });
    expect(same.revision).toBe(1);
  });

  it('ignores a caller-supplied revision', async () => {
    const { membership } = await seedMembership();
    const updated = await db.portal_user_tenants.update(membership.id, {
      status: 'suspended',
      revision: 99,
    });
    expect(updated.revision).toBe(2);
  });

  it('increments the revision on archive and on restore', async () => {
    const { membership } = await seedMembership();
    await db.portal_user_tenants.removeWhere({ id: membership.id });
    expect(await revisionOf('portal_user_tenants', membership.id)).toBe(2);
    await db.portal_user_tenants.removeWhere({ id: membership.id });
    expect(await revisionOf('portal_user_tenants', membership.id)).toBe(2);
    await db.portal_user_tenants.restoreWhere({ id: membership.id });
    expect(await revisionOf('portal_user_tenants', membership.id)).toBe(3);
    await db.portal_user_tenants.restoreWhere({ id: membership.id });
    expect(await revisionOf('portal_user_tenants', membership.id)).toBe(3);
  });

  it('increments a tenant revision on status change but not on cell assignment', async () => {
    const { tenant } = await seedMembership();
    const cell = await db.cells.insert({
      environment: 'test',
      database_name: 'rev_' + randomUUID().replaceAll('-', '').slice(0, 12),
    });
    const assigned = await db.tenants.update(tenant.id, { cell_id: cell.id });
    expect(assigned.revision).toBe(1);
    const suspended = await db.tenants.update(tenant.id, {
      status: 'suspended',
    });
    expect(suspended.revision).toBe(2);
  });

  it('updateWhere increments only the rows whose copied columns change', async () => {
    const a = await seedMembership();
    const b = await seedMembership();
    await db.portal_user_tenants.update(b.membership.id, {
      status: 'suspended',
    });
    const count = await db.portal_user_tenants.updateWhere(
      { id: { $in: [a.membership.id, b.membership.id] } },
      { status: 'suspended' }
    );
    expect(count).toBe(2);
    expect(await revisionOf('portal_user_tenants', a.membership.id)).toBe(2);
    expect(await revisionOf('portal_user_tenants', b.membership.id)).toBe(2);
  });

  it('bulkUpdate increments each changed row and ignores a supplied revision', async () => {
    const a = await seedMembership();
    const b = await seedMembership();
    await db.portal_user_tenants.bulkUpdate([
      { id: a.membership.id, status: 'suspended', revision: 50 },
      { id: b.membership.id, ready: false },
    ]);
    expect(await revisionOf('portal_user_tenants', a.membership.id)).toBe(2);
    expect(await revisionOf('portal_user_tenants', b.membership.id)).toBe(1);
  });

  it('upsert starts a new row at 1 and increments a changed conflicting row', async () => {
    const { tenant } = await seedMembership();
    const inserted = await db.module_entitlements.upsert(
      { tenant_id: tenant.id, module: 'sales', enabled: true, revision: 9 },
      ['tenant_id', 'module']
    );
    expect(inserted.revision).toBe(1);
    const same = await db.module_entitlements.upsert(
      { tenant_id: tenant.id, module: 'sales', enabled: true },
      ['tenant_id', 'module']
    );
    expect(same.revision).toBe(1);
    const changed = await db.module_entitlements.upsert(
      { tenant_id: tenant.id, module: 'sales', enabled: false },
      ['tenant_id', 'module'],
      ['enabled']
    );
    expect(changed.revision).toBe(2);
  });

  it('bulkUpsert sets each row revision from its own conflict', async () => {
    const { tenant } = await seedMembership();
    await db.module_entitlements.insert({
      tenant_id: tenant.id,
      module: 'sales',
      enabled: true,
    });
    await db.module_entitlements.insert({
      tenant_id: tenant.id,
      module: 'projects',
      enabled: true,
    });
    const rows = await db.module_entitlements.bulkUpsert(
      [
        { tenant_id: tenant.id, module: 'sales', enabled: false },
        { tenant_id: tenant.id, module: 'projects', enabled: true },
        { tenant_id: tenant.id, module: 'accounting', enabled: true },
      ],
      ['tenant_id', 'module'],
      null,
      ['module', 'revision']
    );
    const byModule = Object.fromEntries(
      rows.map(row => [row.module, row.revision])
    );
    expect(byModule).toEqual({ sales: 2, projects: 1, accounting: 1 });
  });

  it('serializes concurrent upserts of the same new row', async () => {
    const { tenant } = await seedMembership();
    const conflict = ['tenant_id', 'module'];
    let release;
    const gate = new Promise(resolve => {
      release = resolve;
    });
    let firstInserted;
    const inserted = new Promise(resolve => {
      firstInserted = resolve;
    });
    const first = db.tx(async tx => {
      await db.module_entitlements.upsert(
        { tenant_id: tenant.id, module: 'sales', enabled: true },
        conflict,
        null,
        { tx }
      );
      firstInserted();
      await gate;
    });
    await inserted;
    let secondDone = false;
    const second = db.module_entitlements
      .upsert(
        { tenant_id: tenant.id, module: 'sales', enabled: false },
        conflict
      )
      .then(row => {
        secondDone = true;
        return row;
      });
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(secondDone).toBe(false);
    release();
    await first;
    const row = await second;
    expect(row).toMatchObject({ enabled: false, revision: 2 });
  });

  it('insert and bulkInsert start every row at 1, ignoring a supplied revision', async () => {
    const { tenant } = await seedMembership();
    const one = await db.module_entitlements.insert({
      tenant_id: tenant.id,
      module: 'sales',
      enabled: true,
      revision: 7,
    });
    expect(one.revision).toBe(1);
    const rows = await db.module_entitlements.bulkInsert(
      [
        {
          tenant_id: tenant.id,
          module: 'projects',
          enabled: true,
          revision: 4,
        },
        { tenant_id: tenant.id, module: 'accounting', enabled: true },
      ],
      ['revision']
    );
    expect(rows.map(row => row.revision)).toEqual([1, 1]);
  });

  it('rolls the revision back with the caller transaction', async () => {
    const { membership } = await seedMembership();
    await expect(
      db.tx(async tx => {
        await db.portal_user_tenants.update(
          membership.id,
          { status: 'suspended' },
          { tx }
        );
        throw new Error('rollback');
      })
    ).rejects.toThrow('rollback');
    expect(await revisionOf('portal_user_tenants', membership.id)).toBe(1);
  });
});
