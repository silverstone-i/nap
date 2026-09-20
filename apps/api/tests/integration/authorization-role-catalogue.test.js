/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import { roleUrl } from '../../src/application/shared/configuration.js';
import {
  createAdminDatabase,
  using,
} from '../../src/infrastructure/runtime/adminDatabase.js';
import { createCellDatabase } from '../../src/infrastructure/runtime/cellRegistry.js';
import { cellModules } from '../../src/modules/cell.js';
import { adminModules } from '../../src/modules/admin.js';
import { createRoleProvider } from '../../src/modules/admin-tenancy/domain/roleProvider.js';
import {
  grantRole,
  removeRole,
} from '../../src/modules/admin-tenancy/domain/roles.js';
import { createApp } from '../../src/app.js';
import { adminTenancyRoutesV1 } from '../../src/modules/admin-tenancy/apiRoutes/v1/index.js';
import {
  createSessionToken,
  hashSessionToken,
} from '../../src/modules/admin-tenancy/domain/session.js';
import {
  listTenantRoles,
  seedOwnerRoles,
  seedTenantRoles,
} from '../../src/modules/access-control/domain/roleCatalogue.js';

const fixture = process.env.FOUNDATION_TEST_URL;
if (!fixture)
  throw new Error('FOUNDATION_TEST_URL must identify a disposable server');
const source = new URL(fixture);
const suffix = randomUUID().replaceAll('-', '');
const cellDatabase = `nap_auth_cell_${suffix}`;
const adminDatabase = `nap_auth_admin_${suffix}`;
const cellEndpoint = `${source.host}/${cellDatabase}`;
const adminEndpoint = `${source.host}/${adminDatabase}`;
const tenant = randomUUID();
const cell = randomUUID();
const root = randomUUID();
const target = randomUUID();
const adminPassword = 'foundation-admin';
const appPassword = 'foundation-app';
let admin;
let adminDb;
let runtime;

beforeAll(async () => {
  await using(fixture, async db => {
    for (const [role, password, attributes] of [
      ['nap-admin', adminPassword, 'CREATEDB CREATEROLE'],
      ['nap-app', appPassword, 'NOCREATEDB NOCREATEROLE'],
    ]) {
      if (
        !(await db.oneOrNone('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]))
      )
        await db.none(
          `CREATE ROLE $1:name LOGIN NOSUPERUSER NOBYPASSRLS ${attributes} PASSWORD $2`,
          [role, password]
        );
    }
    await db.none('CREATE DATABASE $1:name OWNER "nap-admin"', [cellDatabase]);
    await db.none('CREATE DATABASE $1:name OWNER "nap-admin"', [adminDatabase]);
  });
  admin = createCellDatabase(roleUrl(cellEndpoint, 'nap-admin', adminPassword));
  await admin.connect();
  await admin.db.none(
    'CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE SCHEMA app AUTHORIZATION "nap-admin"'
  );
  await admin.migrate({ schema: 'app', modules: cellModules });
  adminDb = createAdminDatabase(
    roleUrl(adminEndpoint, 'nap-admin', adminPassword)
  );
  await adminDb.connect();
  await adminDb.db.none(
    'CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE SCHEMA admin AUTHORIZATION "nap-admin"'
  );
  await adminDb.migrate({ schema: 'admin', modules: adminModules });
  runtime = createCellDatabase(roleUrl(cellEndpoint, 'nap-app', appPassword));
  await runtime.connect();
}, 30000);

afterAll(async () => {
  await Promise.all([runtime?.close(), adminDb?.close(), admin?.close()]);
  await using(fixture, async db => {
    await db.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [
      adminDatabase,
    ]);
    await db.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [
      cellDatabase,
    ]);
  });
});

it('seeds tenant and owner roles idempotently with stable UUIDs', async () => {
  const first = await seedTenantRoles(admin, tenant);
  const second = await seedTenantRoles(admin, tenant);
  expect(second.id).toBe(first.id);
  await admin.db.none('UPDATE app.roles SET deactivated_at=now() WHERE id=$1', [
    first.id,
  ]);
  expect((await seedTenantRoles(admin, tenant)).id).toBe(first.id);
  expect((await listTenantRoles(admin, tenant)).map(role => role.code)).toEqual(
    ['tenant_admin']
  );
  await seedOwnerRoles(admin, tenant);
  expect((await listTenantRoles(admin, tenant)).map(role => role.code)).toEqual(
    ['platform_admin', 'support', 'tenant_admin']
  );
});

it('rejects reserved custom-role codes', async () => {
  await expect(
    admin.db.none(
      `INSERT INTO app.roles(tenant_id,code,name,capabilities)
       VALUES($1,'support','Fake support','[]'::jsonb)`,
      [tenant]
    )
  ).rejects.toMatchObject({ code: '23514' });
});

it('rejects seed drift and runtime changes to system roles', async () => {
  await admin.db.none(
    "UPDATE app.roles SET capabilities='[]'::jsonb WHERE tenant_id=$1 AND system_role='support'",
    [tenant]
  );
  await expect(seedOwnerRoles(admin, tenant)).rejects.toMatchObject({
    code: 'ROLE_DRIFT',
  });
  await admin.db.none(
    `UPDATE app.roles SET capabilities=$2::jsonb
      WHERE tenant_id=$1 AND system_role='support'`,
    [
      tenant,
      JSON.stringify(
        (await listTenantRoles(admin, tenant)).find(
          role => role.code === 'platform_admin'
        ).capabilities
      ),
    ]
  );
  await expect(
    runtime.db.tx(async tx => {
      await tx.one("SELECT set_config('nap.tenant_id',$1,true)", [tenant]);
      await tx.none(
        "UPDATE app.roles SET name='Changed' WHERE tenant_id=$1 AND system_role='support'",
        [tenant]
      );
    })
  ).rejects.toMatchObject({ code: '23514' });
});

it('grants a validated role with its event and revision keys atomically', async () => {
  await adminDb.db.none(
    `INSERT INTO admin.cells(id,environment,database_name,enabled)
       VALUES($1,'test',$2,true);
     INSERT INTO admin.tenants(id,tenant_code,name,status,is_napsoft,cell_id,provisioned,rbac_ready)
       VALUES($3,'OWNER','Owner','active',true,$1,true,true);
     INSERT INTO admin.portal_users(id,email,password_hash,status,is_root,must_change_password)
       VALUES($4,'root@example.test','hash','active',true,false),
             ($5,'user@example.test','hash','active',false,false);
     INSERT INTO admin.portal_user_tenants(portal_user_id,tenant_id,member_type,status,ready,member_id)
       VALUES($4,$3,NULL,'active',true,NULL),($5,$3,'employee','active',true,gen_random_uuid())`,
    [cell, cellDatabase, tenant, root, target]
  );
  const tenantAdmin = (await listTenantRoles(admin, tenant)).find(
    role => role.code === 'tenant_admin'
  );
  const provider = createRoleProvider(adminDb.db, {
    get(id) {
      expect(id).toBe(cell);
      return runtime;
    },
  });
  const assignment = await grantRole(
    adminDb.db,
    provider,
    {
      id: randomUUID(),
      user: root,
      restricted: false,
      accessMode: 'normal',
    },
    {
      tenantId: tenant,
      userId: target,
      roleId: tenantAdmin.id,
      requestId: randomUUID(),
    }
  );
  expect(assignment).toMatchObject({
    user: target,
    tenant,
    role: tenantAdmin.id,
  });
  expect(
    Number(
      (
        await adminDb.db.one(
          "SELECT count(*) FROM admin.managed_events WHERE event_key='role.granted' AND target_id=$1",
          [target]
        )
      ).count
    )
  ).toBe(1);
  expect(
    await adminDb.db.any(
      "SELECT domain,entity FROM admin.cache_revisions WHERE domain='roles' ORDER BY entity"
    )
  ).toEqual(
    [tenant, target].sort().map(entity => ({ domain: 'roles', entity }))
  );
});

it('serves role lists and idempotent assignment changes through the API', async () => {
  const sessionPolicy = {
    secret: 'authorization-session-secret-of-ample-length',
    idleMinutes: 30,
    absoluteHours: 12,
  };
  const token = createSessionToken();
  await adminDb.db.none(
    `INSERT INTO admin.sessions
       (portal_user_id,token_hash,idle_expires_at,absolute_expires_at)
     VALUES($1,$2,now()+interval '30 minutes',now()+interval '12 hours')`,
    [root, hashSessionToken(sessionPolicy, token)]
  );
  const cells = { get: () => runtime };
  const app = createApp({
    api: {
      admin: adminDb,
      cells,
      sessionPolicy,
      authenticationPolicy: {},
      cookiePolicy: { secure: false, sameSite: 'lax' },
      applicationOrigin: 'http://localhost:5173',
      registrations: adminTenancyRoutesV1,
    },
  });
  const cookie = `nap_session=${token}`;
  const roles = await request(app)
    .get(`/api/admin-tenancy/v1/tenants/${tenant}/roles`)
    .set('Cookie', cookie);
  expect(roles.status).toBe(200);
  expect(roles.body.data.roles).toHaveLength(3);
  const assignments = await request(app)
    .get(`/api/admin-tenancy/v1/users/${target}/roles`)
    .set('Cookie', cookie);
  expect(assignments.status).toBe(200);
  expect(assignments.body.data.assignments).toHaveLength(1);
  const role = assignments.body.data.assignments[0].role;
  const path = `/api/admin-tenancy/v1/tenants/${tenant}/users/${target}/roles/${role}`;
  expect(
    (
      await request(app)
        .put(path)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
    ).status
  ).toBe(200);
  expect(
    (
      await request(app)
        .delete(path)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
    ).status
  ).toBe(204);
  expect(
    (
      await request(app)
        .delete(path)
        .set('Cookie', cookie)
        .set('Origin', 'http://localhost:5173')
    ).status
  ).toBe(204);
});

it('rejects self-grants and removal of the final non-root platform administrator', async () => {
  const provider = createRoleProvider(adminDb.db, { get: () => runtime });
  const session = {
    id: randomUUID(),
    user: root,
    restricted: false,
    accessMode: 'normal',
  };
  const platformAdmin = (await listTenantRoles(admin, tenant)).find(
    role => role.code === 'platform_admin'
  );
  await expect(
    grantRole(adminDb.db, provider, session, {
      tenantId: tenant,
      userId: root,
      roleId: platformAdmin.id,
    })
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await grantRole(adminDb.db, provider, session, {
    tenantId: tenant,
    userId: target,
    roleId: platformAdmin.id,
  });
  await expect(
    removeRole(adminDb.db, provider, session, {
      tenantId: tenant,
      userId: target,
      roleId: platformAdmin.id,
    })
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

it('accepts tenant-defined roles and rejects a role UUID from another tenant', async () => {
  const provider = createRoleProvider(adminDb.db, { get: () => runtime });
  const session = {
    id: randomUUID(),
    user: root,
    restricted: false,
    accessMode: 'normal',
  };
  const otherTenant = randomUUID();
  const custom = await admin.db.one(
    `INSERT INTO app.roles(tenant_id,code,name,capabilities)
     VALUES($1,'auditor','Auditor',$2::jsonb)
     RETURNING id`,
    [tenant, JSON.stringify(['admin-tenancy::events::read'])]
  );
  const wrongTenant = await admin.db.one(
    `INSERT INTO app.roles(tenant_id,code,name,capabilities)
     VALUES($1,'auditor','Auditor',$2::jsonb)
     RETURNING id`,
    [otherTenant, JSON.stringify(['admin-tenancy::events::read'])]
  );
  await expect(
    grantRole(adminDb.db, provider, session, {
      tenantId: tenant,
      userId: target,
      roleId: wrongTenant.id,
    })
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(
    grantRole(adminDb.db, provider, session, {
      tenantId: tenant,
      userId: target,
      roleId: custom.id,
    })
  ).resolves.toMatchObject({ role: custom.id });
});
