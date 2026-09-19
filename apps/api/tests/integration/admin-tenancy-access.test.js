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
import {
  findTenant,
  findTenantIncludingArchived,
  findPortalUser,
  findPortalUserIncludingArchived,
  listMembershipsByUser,
  listMembershipsByTenant,
} from '../../src/modules/admin-tenancy/domain/access.js';
import { findCredentialByEmail } from '../../src/modules/admin-tenancy/domain/credentials.js';

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

function platformScope(overrides = {}) {
  return {
    platformPortalUserRead: true,
    tenantIds: '*',
    deniedTenantIds: [],
    archiveManagement: false,
    ...overrides,
  };
}
function archiveScope() {
  return platformScope({ archiveManagement: true });
}
function tenantScope(tenantIds) {
  return {
    platformPortalUserRead: false,
    tenantIds,
    deniedTenantIds: [],
    archiveManagement: false,
  };
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

it('operates entirely under the nap-app runtime role', async () => {
  expect((await db.one('SELECT current_user AS user')).user).toBe('nap-app');
});

describe('tenant reads', () => {
  it('reads an active tenant, and returns null for a missing or archived one', async () => {
    const code = 'ACTIVE-' + randomUUID().slice(0, 8);
    const tenant = await db.one(
      "INSERT INTO admin.tenants(tenant_code,name,status) VALUES($1,'Active Tenant','active') RETURNING id",
      [code]
    );
    const result = await findTenant(db, platformScope(), tenant.id);
    expect(result).toMatchObject({
      id: tenant.id,
      tenant_code: code,
      name: 'Active Tenant',
      status: 'active',
      is_napsoft: false,
    });
    expect(result.deactivated_at).toBeNull();

    expect(await findTenant(db, platformScope(), randomUUID())).toBeNull();

    const archived = await db.one(
      "INSERT INTO admin.tenants(tenant_code,name,deactivated_at) VALUES($1,'Archived Tenant',now()) RETURNING id",
      ['ARCHIVED-' + randomUUID().slice(0, 8)]
    );
    expect(await findTenant(db, platformScope(), archived.id)).toBeNull();
    const restored = await findTenantIncludingArchived(
      db,
      archiveScope(),
      archived.id
    );
    expect(restored).toMatchObject({
      id: archived.id,
      name: 'Archived Tenant',
    });
    expect(restored.deactivated_at).not.toBeNull();
  });

  it('requires archive-management authority for an archived tenant read', async () => {
    const archived = await db.one(
      "INSERT INTO admin.tenants(tenant_code,name,deactivated_at) VALUES($1,'No Authority',now()) RETURNING id",
      ['NOAUTH-' + randomUUID().slice(0, 8)]
    );
    await expect(
      findTenantIncludingArchived(db, platformScope(), archived.id)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a tenant target outside the permitted tenant list before reading', async () => {
    const tenant = await db.one(
      "INSERT INTO admin.tenants(tenant_code,name,status) VALUES($1,'Out Of Scope','active') RETURNING id",
      ['OUTOFSCOPE-' + randomUUID().slice(0, 8)]
    );
    await expect(
      findTenant(db, tenantScope([randomUUID()]), tenant.id)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      findTenant(db, tenantScope([tenant.id]), tenant.id)
    ).resolves.toMatchObject({ id: tenant.id });
  });

  describe("support's Napsoft restriction", () => {
    let napsoftId;
    beforeAll(async () => {
      const row = await db.one(
        "INSERT INTO admin.tenants(tenant_code,name,is_napsoft,status) VALUES('NAPSOFT','Napsoft',true,'active') RETURNING id"
      );
      napsoftId = row.id;
    });

    it('denies reading the Napsoft tenant and its membership list, but permits others', async () => {
      const support = platformScope({ deniedTenantIds: [napsoftId] });
      await expect(findTenant(db, support, napsoftId)).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
      await expect(
        listMembershipsByTenant(db, support, napsoftId)
      ).rejects.toMatchObject({ code: 'FORBIDDEN' });

      const other = await db.one(
        "INSERT INTO admin.tenants(tenant_code,name,status) VALUES($1,'Support Other','active') RETURNING id",
        ['SUPPORTOTHER-' + randomUUID().slice(0, 8)]
      );
      await expect(findTenant(db, support, other.id)).resolves.toMatchObject({
        id: other.id,
      });

      const user = await db.one(
        "INSERT INTO admin.portal_users(email,password_hash) VALUES($1,'hash') RETURNING id",
        ['support-scope-' + randomUUID() + '@test.example']
      );
      for (const tenantId of [napsoftId, other.id])
        await db.none(
          "INSERT INTO admin.portal_user_tenants(portal_user_id,tenant_id,member_type,status,ready,member_id) VALUES($1,$2,'employee','active',true,gen_random_uuid())",
          [user.id, tenantId]
        );
      const memberships = await listMembershipsByUser(db, support, user.id);
      expect(memberships.rows.map(row => row.tenant_id)).toEqual([other.id]);
    });
  });
});

describe('portal-user reads', () => {
  it('reads an active portal user, excludes password_hash, and returns null for a missing or archived one', async () => {
    const email = 'active-' + randomUUID() + '@test.example';
    const user = await db.one(
      "INSERT INTO admin.portal_users(email,password_hash) VALUES($1,'super-secret-hash') RETURNING id",
      [email]
    );
    const result = await findPortalUser(db, platformScope(), user.id);
    expect(result).toMatchObject({
      id: user.id,
      email,
      status: 'active',
      is_root: false,
    });
    expect('password_hash' in result).toBe(false);
    expect(JSON.stringify(result)).not.toContain('super-secret-hash');

    expect(await findPortalUser(db, platformScope(), randomUUID())).toBeNull();

    const archivedEmail = 'archived-' + randomUUID() + '@test.example';
    const archived = await db.one(
      "INSERT INTO admin.portal_users(email,password_hash,deactivated_at) VALUES($1,'hash',now()) RETURNING id",
      [archivedEmail]
    );
    expect(await findPortalUser(db, platformScope(), archived.id)).toBeNull();
    const restored = await findPortalUserIncludingArchived(
      db,
      archiveScope(),
      archived.id
    );
    expect(restored).toMatchObject({ id: archived.id, email: archivedEmail });
    expect('password_hash' in restored).toBe(false);
  });

  it('authorizes a tenant-scoped read only through an active membership in a permitted tenant', async () => {
    const tenant = await db.one(
      "INSERT INTO admin.tenants(tenant_code,name,status) VALUES($1,'Member Tenant','active') RETURNING id",
      ['MEMBER-' + randomUUID().slice(0, 8)]
    );
    const otherTenant = await db.one(
      "INSERT INTO admin.tenants(tenant_code,name,status) VALUES($1,'Other Tenant','active') RETURNING id",
      ['OTHERMEMBER-' + randomUUID().slice(0, 8)]
    );
    const user = await db.one(
      "INSERT INTO admin.portal_users(email,password_hash) VALUES($1,'hash') RETURNING id",
      ['member-' + randomUUID() + '@test.example']
    );
    const scope = tenantScope([tenant.id]);

    await expect(findPortalUser(db, scope, user.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    await db.none(
      "INSERT INTO admin.portal_user_tenants(portal_user_id,tenant_id,member_type,status,ready,member_id) VALUES($1,$2,'employee','active',true,gen_random_uuid())",
      [user.id, otherTenant.id]
    );
    await expect(findPortalUser(db, scope, user.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    await db.none(
      "INSERT INTO admin.portal_user_tenants(portal_user_id,tenant_id,member_type,status,ready,member_id) VALUES($1,$2,'employee','active',true,gen_random_uuid())",
      [user.id, tenant.id]
    );
    await expect(findPortalUser(db, scope, user.id)).resolves.toMatchObject({
      id: user.id,
    });
  });

  it('permits a platform-scoped read regardless of tenant membership', async () => {
    const user = await db.one(
      "INSERT INTO admin.portal_users(email,password_hash) VALUES($1,'hash') RETURNING id",
      ['platform-' + randomUUID() + '@test.example']
    );
    await expect(
      findPortalUser(db, platformScope(), user.id)
    ).resolves.toMatchObject({ id: user.id });
  });
});

describe('credential reader', () => {
  it('returns login fields and the password hash only for the authentication caller', async () => {
    const email = 'cred-' + randomUUID() + '@test.example';
    await db.none(
      "INSERT INTO admin.portal_users(email,password_hash,must_change_password) VALUES($1,'argon2-hash',true)",
      [email]
    );
    const credential = await findCredentialByEmail(
      db,
      { caller: 'authentication' },
      email
    );
    expect(credential).toMatchObject({
      email,
      password_hash: 'argon2-hash',
      must_change_password: true,
      status: 'active',
      is_root: false,
    });
    await expect(findCredentialByEmail(db, {}, email)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
    expect(
      await findCredentialByEmail(
        db,
        { caller: 'authentication' },
        'missing-' + randomUUID() + '@test.example'
      )
    ).toBeNull();
  });
});

describe('membership lists', () => {
  it('lists memberships by tenant, empty then populated', async () => {
    const tenant = await db.one(
      "INSERT INTO admin.tenants(tenant_code,name,status) VALUES($1,'Empty Tenant','active') RETURNING id",
      ['EMPTYTENANT-' + randomUUID().slice(0, 8)]
    );
    expect(
      await listMembershipsByTenant(db, platformScope(), tenant.id)
    ).toEqual({ rows: [], nextCursor: null });

    const user = await db.one(
      "INSERT INTO admin.portal_users(email,password_hash) VALUES($1,'hash') RETURNING id",
      ['tenant-list-' + randomUUID() + '@test.example']
    );
    await db.none(
      "INSERT INTO admin.portal_user_tenants(portal_user_id,tenant_id,member_type,status,ready,member_id) VALUES($1,$2,'employee','active',true,gen_random_uuid())",
      [user.id, tenant.id]
    );
    const page = await listMembershipsByTenant(db, platformScope(), tenant.id);
    expect(page.rows).toHaveLength(1);
    expect(page.rows[0]).toMatchObject({
      portal_user_id: user.id,
      tenant_id: tenant.id,
      status: 'active',
      ready: true,
    });
    expect(page.nextCursor).toBeNull();
  });

  it('paginates memberships by user in deterministic ascending order, with an exact-limit page', async () => {
    const user = await db.one(
      "INSERT INTO admin.portal_users(email,password_hash) VALUES($1,'hash') RETURNING id",
      ['page-user-' + randomUUID() + '@test.example']
    );
    const membershipIds = [];
    for (let i = 0; i < 3; i++) {
      const tenant = await db.one(
        "INSERT INTO admin.tenants(tenant_code,name,status) VALUES($1,'Page Tenant','active') RETURNING id",
        ['PAGE' + i + '-' + randomUUID().slice(0, 8)]
      );
      const membership = await db.one(
        "INSERT INTO admin.portal_user_tenants(portal_user_id,tenant_id,member_type,status,ready,member_id) VALUES($1,$2,'employee','active',true,gen_random_uuid()) RETURNING id",
        [user.id, tenant.id]
      );
      membershipIds.push(membership.id);
    }
    const expectedOrder = [...membershipIds].sort();
    const scope = platformScope();

    const firstPage = await listMembershipsByUser(db, scope, user.id, {
      limit: 2,
    });
    expect(firstPage.rows.map(r => r.id)).toEqual(expectedOrder.slice(0, 2));
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await listMembershipsByUser(db, scope, user.id, {
      limit: 2,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.rows.map(r => r.id)).toEqual(expectedOrder.slice(2));
    expect(secondPage.nextCursor).toBeNull();

    const exactPage = await listMembershipsByUser(db, scope, user.id, {
      limit: 3,
    });
    expect(exactPage.rows.map(r => r.id)).toEqual(expectedOrder);
    expect(exactPage.nextCursor).toBeNull();
  });

  it('keeps a cursor stable while unrelated memberships are inserted', async () => {
    const tenant = await db.one(
      "INSERT INTO admin.tenants(tenant_code,name,status) VALUES($1,'Stable Tenant','active') RETURNING id",
      ['STABLE-' + randomUUID().slice(0, 8)]
    );
    const users = [];
    for (let i = 0; i < 2; i++) {
      const user = await db.one(
        "INSERT INTO admin.portal_users(email,password_hash) VALUES($1,'hash') RETURNING id",
        ['stable-' + i + '-' + randomUUID() + '@test.example']
      );
      users.push(user.id);
    }
    const membershipIds = [];
    for (const userId of users) {
      const membership = await db.one(
        "INSERT INTO admin.portal_user_tenants(portal_user_id,tenant_id,member_type,status,ready,member_id) VALUES($1,$2,'employee','active',true,gen_random_uuid()) RETURNING id",
        [userId, tenant.id]
      );
      membershipIds.push(membership.id);
    }
    const expectedOrder = [...membershipIds].sort();

    const firstPage = await listMembershipsByTenant(
      db,
      platformScope(),
      tenant.id,
      {
        limit: 1,
      }
    );
    expect(firstPage.rows.map(r => r.id)).toEqual(expectedOrder.slice(0, 1));

    const unrelatedTenant = await db.one(
      "INSERT INTO admin.tenants(tenant_code,name,status) VALUES($1,'Unrelated Tenant','active') RETURNING id",
      ['UNRELATED-' + randomUUID().slice(0, 8)]
    );
    const unrelatedUser = await db.one(
      "INSERT INTO admin.portal_users(email,password_hash) VALUES($1,'hash') RETURNING id",
      ['unrelated-' + randomUUID() + '@test.example']
    );
    await db.none(
      "INSERT INTO admin.portal_user_tenants(portal_user_id,tenant_id,member_type,status,ready,member_id) VALUES($1,$2,'employee','active',true,gen_random_uuid())",
      [unrelatedUser.id, unrelatedTenant.id]
    );

    const secondPage = await listMembershipsByTenant(
      db,
      platformScope(),
      tenant.id,
      { limit: 1, cursor: firstPage.nextCursor }
    );
    expect(secondPage.rows.map(r => r.id)).toEqual(expectedOrder.slice(1));
    expect(secondPage.nextCursor).toBeNull();
  });

  it('rejects an unauthorized list target before reading', async () => {
    const tenant = await db.one(
      "INSERT INTO admin.tenants(tenant_code,name,status) VALUES($1,'Guarded Tenant','active') RETURNING id",
      ['GUARDED-' + randomUUID().slice(0, 8)]
    );
    await expect(
      listMembershipsByTenant(db, tenantScope([randomUUID()]), tenant.id)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const user = await db.one(
      "INSERT INTO admin.portal_users(email,password_hash) VALUES($1,'hash') RETURNING id",
      ['guarded-' + randomUUID() + '@test.example']
    );
    await expect(
      listMembershipsByUser(db, tenantScope([tenant.id]), user.id)
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
