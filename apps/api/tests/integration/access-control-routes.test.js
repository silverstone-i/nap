/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import {
  createAdminDatabase,
  using,
} from '../../src/infrastructure/runtime/adminDatabase.js';
import { setupLocal } from '../../src/infrastructure/provisioning/postgres.js';
import { migrateAdmin } from '../../src/application/maintenance/migrateAdmin.js';
import { roleUrl } from '../../src/application/shared/configuration.js';
import { registerCell } from '../../src/modules/admin-tenancy/domain/cells.js';
import { bootstrapRoot } from '../../src/modules/admin-tenancy/domain/bootstrap.js';
import { ARGON2_MINIMUM } from '../../src/modules/admin-tenancy/domain/password.js';
import { createSession } from '../../src/modules/admin-tenancy/domain/session.js';
import { selectTenant } from '../../src/modules/admin-tenancy/domain/tenantAccess.js';
import { createCellRegistry } from '../../src/infrastructure/runtime/cellRegistry.js';
import { createLocalCellDriver } from '../../src/infrastructure/provisioning/localCells.js';
import { createStages } from '../../src/application/provisioning/stages.js';
import { createProvisioningWorker } from '../../src/application/provisioning/worker.js';
import { accessControlRoutesV1 } from '../../src/modules/access-control/apiRoutes/v1/index.js';
import { resolvePatterns } from '../../src/modules/access-control/domain/callerPatterns.js';
import { withTenantTransaction } from '../../src/infrastructure/runtime/tenantTransaction.js';
import { createSyncWorker } from '../../src/application/sync/worker.js';
import { createRole } from '../../src/modules/access-control/domain/roles.js';
import { roleChangeRecorder } from '../../src/modules/access-control/domain/events.js';
import { capabilityCatalogue } from '../../src/modules/access-control/domain/catalogue.js';

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
const sessionPolicy = {
  secret: 'integration-access-control-secret-of-ample-length',
  idleMinutes: 30,
  absoluteHours: 12,
};
const ORIGIN = 'http://localhost:5173';
const BASE = '/api/access-control/v1';
const created = new Set();
let handle, db, dir, registry, cell, app, napsoft, rootId, cookie, noTenant;
let sync;

/**
 * Send a request as the bootstrap login.
 * @param {'get'|'post'|'patch'|'put'|'delete'} method
 * @param {string} path Path below `BASE`.
 * @param {object} [body]
 * @param {string} [as] Cookie header to send.
 */
function call(method, path, body, as = cookie) {
  const pending = request(app)
    [method](BASE + path)
    .set('Origin', ORIGIN)
    .set('Cookie', as);
  return body === undefined ? pending : pending.send(body);
}

/**
 * Add an active (or other status) member to the Napsoft tenant's cell copy.
 * @param {string} [status]
 * @returns {Promise<string>} The portal user ID.
 */
async function member(status = 'active') {
  const portalUserId = randomUUID();
  await cell.tenant_members.insert({
    id: randomUUID(),
    tenant_id: napsoft.id,
    portal_user_id: portalUserId,
    member_type: 'employee',
    member_id: randomUUID(),
    status,
    revision: 1,
  });
  return portalUserId;
}

/** Events recorded against a role, oldest first. */
/** Events for a role, in the order the cell changes happened. */
async function eventsFor(roleId) {
  const rows = await db.managed_events.findWhere({ target_id: roleId }, 'AND', {
    columnWhitelist: ['event_key', 'actor_id', 'tenant_id', 'details'],
  });
  return rows.sort((a, b) =>
    String(a.details?.changed_at).localeCompare(String(b.details?.changed_at))
  );
}

/** Pending `role_change` outbox rows for the Napsoft tenant. */
function pendingRoleChanges() {
  return cell.outbox.findWhere(
    { tenant_id: napsoft.id, topic: 'role_change', status: 'pending' },
    'AND',
    { columnWhitelist: ['id', 'entity_id', 'payload'] }
  );
}

/** The Napsoft tenant's `roles` cache revision. */
async function rolesRevision() {
  const [row] = await db.cache_revisions.current([
    { domain: 'roles', entity: napsoft.id },
  ]);
  return Number(row.revision);
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

  const unique = randomUUID().slice(0, 8);
  const boot = await bootstrapRoot(db, {
    tenantCode: `NAP-${unique.toUpperCase()}`,
    tenantName: `Test Napsoft ${unique}`,
    rootEmail: `bootstrap-${unique}@nap.test`,
    rootPassword: 'correct-horse-battery-staple',
    hashingPolicy: ARGON2_MINIMUM,
  });
  rootId = boot.rootUser.id;

  dir = await mkdtemp(join(tmpdir(), 'nap-acl-routes-'));
  const envFile = join(dir, '.env');
  await writeFile(envFile, 'A=1\n', { mode: 0o600 });
  const driver = createLocalCellDriver({
    adminPassword: config.adminPassword,
    appPassword: config.appPassword,
    setup: config.maintenance,
    stateFile: join(dir, 'state.json'),
    envFile,
  });
  registry = createCellRegistry({ admin: db });
  const provisioning = createProvisioningWorker({
    admin: { db },
    driver,
    stages: createStages({ driver, registry, environment: 'test' }),
    intervalMs: 5,
  });
  const registered = await registerCell(
    db,
    'test',
    { actorId: randomUUID(), granted: true },
    { operation: 'cell', suffix: 'a' + randomUUID().slice(0, 8) }
  );
  created.add(registered.cell.database_name);
  await provisioning.tick();
  cell = registry.dbFor(registered.cell.id);
  napsoft = await db.tenants.findOneBy(
    { id: boot.tenant.id },
    { columnWhitelist: ['id', 'tenant_code', 'rbac_ready'] }
  );
  expect(napsoft.rbac_ready).toBe(true);

  const session = await createSession(db, sessionPolicy, {
    portalUserId: rootId,
  });
  noTenant = `nap_session=${session.token}`;
  const other = await createSession(db, sessionPolicy, {
    portalUserId: rootId,
  });
  const selected = await selectTenant(
    db,
    sessionPolicy,
    other.token,
    { user: rootId },
    { tenant: napsoft.id },
    { runtime: registry }
  );
  cookie = `nap_session=${selected.token}`;

  sync = createSyncWorker({ admin: { db }, registry });
  // Deliver the rows the bootstrap and cell setup queued, so each test sees
  // only its own changes.
  await sync.tick();

  app = createApp({
    api: {
      admin: handle,
      environment: 'test',
      sessionPolicy,
      cookiePolicy: { secure: false, sameSite: 'lax' },
      applicationOrigin: ORIGIN,
      runtime: registry,
      registrations: accessControlRoutesV1,
    },
  });
}, 120000);

afterAll(async () => {
  await registry?.close();
  await handle?.close();
  await using(fixture, async tx => {
    for (const database of [...created, name])
      await tx.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [database]);
  });
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('caller pattern set (I0005-R004)', () => {
  it("resolves the bootstrap login's platform_admin grants from the Napsoft cell", async () => {
    expect(
      await resolvePatterns(cell, {
        tenantId: napsoft.id,
        portalUserId: rootId,
      })
    ).toEqual(['*::*::*::*', `${napsoft.tenant_code}::*::*::*`].sort());
  });

  it('resolves nothing for a user who is not a member', async () => {
    expect(
      await resolvePatterns(cell, {
        tenantId: napsoft.id,
        portalUserId: randomUUID(),
      })
    ).toEqual([]);
  });
});

describe('access-control routes (M0003 §10)', () => {
  it('requires a selected tenant', async () => {
    const response = await call('get', '/roles', undefined, noTenant);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('INVALID_STATE');
  });

  it('lists the catalogue and the seeded immutable roles', async () => {
    const capabilities = await call('get', '/capabilities');
    expect(capabilities.status).toBe(200);
    expect(capabilities.body.data.map(c => c.capability)).toContain(
      'access-control::assignments::write'
    );
    const roles = await call('get', '/roles');
    expect(
      roles.body.data.map(r => [r.code, r.isImmutable, r.archived])
    ).toEqual([
      ['platform_admin', true, false],
      ['support', true, false],
      ['tenant_admin', true, false],
    ]);
  });

  it('creates, edits, archives, and restores a custom role with events and revisions (AC08, AC09)', async () => {
    const start = await rolesRevision();
    const createdRole = await call('post', '/roles', {
      code: 'auditor',
      name: 'Auditor',
      grants: ['*::access-control::roles::read'],
    });
    expect(createdRole.status).toBe(201);
    const id = createdRole.body.data.id;
    expect(createdRole.body.data).toMatchObject({
      code: 'auditor',
      isImmutable: false,
      revision: 1,
      grants: ['*::access-control::roles::read'],
    });

    const edited = await call('patch', `/roles/${id}`, {
      name: 'Auditors',
      grants: [
        '*::access-control::roles::read',
        '*::admin-tenancy::events::read',
      ],
      revision: 1,
    });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ name: 'Auditors', revision: 2 });

    const stale = await call('patch', `/roles/${id}`, {
      name: 'Late',
      revision: 1,
    });
    expect(stale.body.error.code).toBe('STALE_REVISION');

    const user = await member();
    expect((await call('put', `/users/${user}/roles/${id}`)).status).toBe(200);

    const archived = await call('post', `/roles/${id}/archive`, {
      revision: 2,
    });
    expect(archived.body.data).toMatchObject({ archived: true, revision: 3 });
    expect(
      (await call('get', '/roles')).body.data.map(r => r.code)
    ).not.toContain('auditor');
    expect(
      (await call('get', '/roles?includeArchived=true')).body.data.map(
        r => r.code
      )
    ).toContain('auditor');
    // R014: an archived role grants nothing, but its assignment is kept.
    expect(
      await resolvePatterns(cell, { tenantId: napsoft.id, portalUserId: user })
    ).toEqual([]);
    expect(
      (await call('get', `/users/${user}/roles`)).body.data.roles.map(
        r => r.code
      )
    ).toEqual(['auditor']);

    const restored = await call('post', `/roles/${id}/restore`, {
      revision: 3,
    });
    expect(restored.body.data).toMatchObject({
      archived: false,
      grants: [
        '*::access-control::roles::read',
        '*::admin-tenancy::events::read',
      ],
    });
    expect(
      await resolvePatterns(cell, { tenantId: napsoft.id, portalUserId: user })
    ).toEqual([
      '*::access-control::roles::read',
      '*::admin-tenancy::events::read',
    ]);

    // R015: each change queued one outbox row in its own transaction; the
    // admin event and cache revision appear only once the worker delivers.
    const pending = await pendingRoleChanges();
    expect(pending.map(row => row.payload.event_key)).toEqual([
      'role.created',
      'role.updated',
      'role.granted',
      'role.archived',
      'role.restored',
    ]);
    expect(await eventsFor(id)).toEqual([]);
    expect(await rolesRevision()).toBe(start);
    await sync.tick();
    expect(await pendingRoleChanges()).toEqual([]);

    const events = await eventsFor(id);
    expect(events.map(e => e.event_key)).toEqual([
      'role.created',
      'role.updated',
      'role.granted',
      'role.archived',
      'role.restored',
    ]);
    expect(events.every(e => e.actor_id === rootId)).toBe(true);
    expect(events.every(e => e.tenant_id === napsoft.id)).toBe(true);
    expect(JSON.parse(events[1].details.before).name).toBe('Auditor');
    expect(JSON.parse(events[1].details.after).name).toBe('Auditors');
    expect(await rolesRevision()).toBe(start + 5);

    // A redelivery (admin committed, cell never marked the rows delivered)
    // writes no second event and leaves the revision alone.
    await cell.none(
      `UPDATE cell.outbox SET status='pending', delivered_at=NULL
        WHERE id = ANY($1::uuid[])`,
      [pending.map(row => row.id)]
    );
    await sync.tick();
    expect(await pendingRoleChanges()).toEqual([]);
    expect(await eventsFor(id)).toHaveLength(5);
    expect(await rolesRevision()).toBe(start + 5);
  });

  it('rolls the outbox row back with the change when the transaction fails (R015, AC09)', async () => {
    const record = roleChangeRecorder(cell, {
      tenantId: napsoft.id,
      actorId: rootId,
    });
    const context = {
      cell,
      tenant: {
        id: napsoft.id,
        code: napsoft.tenant_code,
        isNapsoft: true,
      },
      napsoftCode: napsoft.tenant_code,
      actorId: rootId,
      actorPatterns: async () => ['*::*::*::*'],
      catalogue: capabilityCatalogue(),
      record: async (change, tx) => {
        await record(change, tx);
        throw new Error('after the outbox insert');
      },
    };
    await expect(
      createRole(context, { code: 'doomed', name: 'Doomed', grants: [] })
    ).rejects.toMatchObject({ code: 'INTERNAL_ERROR' });
    expect(await pendingRoleChanges()).toEqual([]);
    expect(
      (await call('get', '/roles?includeArchived=true')).body.data.map(
        r => r.code
      )
    ).not.toContain('doomed');
  });

  it('rejects invalid and uncatalogued grants, immutable codes, and duplicate codes (AC02, R013)', async () => {
    for (const grants of [['nap::*::*::*'], ['*::unknown::*::*']]) {
      const response = await call('post', '/roles', {
        code: 'bad',
        name: 'Bad',
        grants,
      });
      expect(response.body.error.code).toBe('INVALID_INPUT');
    }
    for (const code of ['support', 'auditor']) {
      const response = await call('post', '/roles', {
        code,
        name: 'Dup',
        grants: [],
      });
      expect(response.body.error.code).toBe('CONFLICT');
    }
  });

  it('rejects editing or archiving an immutable role (AC08)', async () => {
    const roles = (await call('get', '/roles')).body.data;
    const support = roles.find(r => r.code === 'support');
    expect(
      (
        await call('patch', `/roles/${support.id}`, {
          name: 'x',
          revision: support.revision,
        })
      ).body.error.code
    ).toBe('ROLE_IMMUTABLE');
    expect(
      (
        await call('post', `/roles/${support.id}/archive`, {
          revision: support.revision,
        })
      ).body.error.code
    ).toBe('ROLE_IMMUTABLE');
  });

  it('assigns only active members and refuses the last Napsoft platform_admin (R012, AC07)', async () => {
    const roles = (await call('get', '/roles')).body.data;
    const platform = roles.find(r => r.code === 'platform_admin');
    const suspended = await member('suspended');
    expect(
      (await call('put', `/users/${suspended}/roles/${platform.id}`)).body.error
        .code
    ).toBe('NOT_MEMBER');
    expect(
      (await call('delete', `/users/${rootId}/roles/${platform.id}`)).body.error
        .code
    ).toBe('LAST_ADMIN');

    const second = await member();
    const assigned = await call('put', `/users/${second}/roles/${platform.id}`);
    expect(assigned.body.data.roles.map(r => r.code)).toEqual([
      'platform_admin',
    ]);
    const repeat = await call('put', `/users/${second}/roles/${platform.id}`);
    expect(repeat.status).toBe(200);
    const removed = await call(
      'delete',
      `/users/${second}/roles/${platform.id}`
    );
    expect(removed.body.data).toEqual({ userId: second, roles: [] });
    expect(
      (await call('delete', `/users/${rootId}/roles/${platform.id}`)).body.error
        .code
    ).toBe('LAST_ADMIN');

    // A suspended member's assignment does not count toward the last admin.
    const lapsed = await member();
    await call('put', `/users/${lapsed}/roles/${platform.id}`);
    await cell.none(
      `UPDATE cell.tenant_members SET status='suspended'
        WHERE tenant_id=$1 AND portal_user_id=$2`,
      [napsoft.id, lapsed]
    );
    expect(
      (await call('delete', `/users/${rootId}/roles/${platform.id}`)).body.error
        .code
    ).toBe('LAST_ADMIN');
    expect(
      (await call('delete', `/users/${lapsed}/roles/${platform.id}`)).status
    ).toBe(200);
  });

  it('keeps role rows invisible to a transaction scoped to another tenant (RLS)', async () => {
    const rows = await withTenantTransaction(cell, randomUUID(), tx =>
      tx.any('SELECT id FROM app.roles')
    );
    expect(rows).toEqual([]);
  });
});
