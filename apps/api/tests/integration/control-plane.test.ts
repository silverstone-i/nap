/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { beforeAll, afterAll, it, expect, vi } from 'vitest';
import request from 'supertest';
import { logger } from '../../src/util/logger.js';
import { readReference } from '../../src/util/sessionCookie.js';
import { createApp } from '../../src/app.js';
import { migrateDatabase } from '../../src/db/migrate.js';
import { adminModules } from '../../src/db/admin/modules.js';
import { randomUUID } from 'node:crypto';
import { authDatabase, authEnv } from '../fixtures/authDatabase.js';
import { withTenantTransaction } from '../../src/db/withTenantTransaction.js';
import {
  apiErrorSchema,
  sessionResponseSchema,
  controlCommandResponseSchema,
  identityResponseSchema,
  controlResponseSchema,
  membershipsResponseSchema,
  navigationResponseSchema,
} from '@nap/shared';

let test: Awaited<ReturnType<typeof authDatabase>>;
let rootCookie: string;
let cellId: string;
const auth = '/api/admin-tenancy/v1/auth';
const control = '/api/admin-tenancy/v1/control';
const temporary = 'temporary-password-123';
const replacement = 'replacement-password-123';
/** Does: Extracts only the browser cookie for following requests. Called by: test login/selection helpers. */
function cookie(r: { headers: Record<string, unknown> }) {
  const v = r.headers['set-cookie'];
  if (!Array.isArray(v) || typeof v[0] !== 'string')
    throw new Error('Missing test cookie');
  return v[0].split(';')[0];
}
/** Does: Sends a real credential request. Called by: authentication acceptance scenarios. */
function login(email = authEnv.ROOT_EMAIL, password = authEnv.ROOT_PASSWORD) {
  return request(test.server)
    .post(auth + '/login')
    .send({ email, password });
}
/** Does: Runs an operator action through its actual permission endpoint. Called by: fixture builders. */
async function command(action: string, body: object, session = rootCookie) {
  if (
    action === 'grants' &&
    'operation' in body &&
    body.operation === 'grant' &&
    'user' in body &&
    'permission' in body &&
    'enabled' in body
  ) {
    const assignment = await request(test.server)
      .post(control + '/role-policy')
      .set('Cookie', session)
      .send({
        operation: 'platform-role',
        user: body.user,
        role: 'support',
        enabled: true,
      });
    expect(assignment.status).toBe(200);
    const result = await request(test.server)
      .post(control + '/role-policy')
      .set('Cookie', session)
      .send({
        operation: 'support-policy',
        permissions: body.enabled ? [body.permission] : [],
      });
    expect(result.status).toBe(200);
    return;
  }
  const result = await request(test.server)
    .post(control + '/' + action)
    .set('Cookie', session)
    .send(body);
  expect(result.status).toBe(200);
  const job = controlCommandResponseSchema.parse(result.body).data.jobId;
  if (job && 'name' in body && typeof body.name === 'string')
    await command(
      'provision',
      { operation: 'retry', job, name: body.name },
      session
    );
}
/** Does: Creates an assigned pending tenant. Called by: isolated capability scenarios. */
async function tenant() {
  const code = randomUUID().slice(0, 12);
  await command('registry', {
    operation: 'tenant',
    code,
    name: 'Test company',
    cell: cellId,
  });
  return (await test.admin.db.tenants.findOneBy({ tenant_code: code }))!;
}
/** Does: Provisions a user through Core and returns its central binding. Called by: membership scenarios. */
async function member(
  target: string,
  kind = 'employee',
  email = randomUUID() + '@nap.test'
) {
  await command('members', {
    operation: 'member',
    target,
    kind,
    email,
    name: 'Test person',
    password: temporary,
  });
  const user = (await test.admin.db.portal_users.findOneBy({ email }))!;
  const binding = (await test.admin.db.portal_user_tenants.findOneBy({
    tenant_id: target,
    portal_user_id: user.id,
  }))!;
  expect(binding.ready).toBe(true);
  return { user, binding, email };
}
/** Does: Creates an active tenant with an initial employee. Called by: access scenarios. */
async function activeTenant() {
  const t = await tenant();
  const m = await member(t.id);
  await command('provision', { operation: 'activate', target: t.id });
  return { t, m };
}
/** Does: Completes mandatory onboarding and returns the surviving session. Called by: ordinary user tests. */
async function onboard(email: string) {
  const r = await login(email, temporary);
  expect(r.status).toBe(200);
  expect(sessionResponseSchema.parse(r.body).data.state).toBe(
    'password-change-required'
  );
  const c = cookie(r);
  expect(
    (
      await request(test.server)
        .put(auth + '/password')
        .set('Cookie', c)
        .send({ currentPassword: temporary, newPassword: replacement })
    ).status
  ).toBe(200);
  return c;
}
beforeAll(async () => {
  test = await authDatabase();
  vi.spyOn(logger, 'info').mockImplementation(() => {});
  rootCookie = cookie(await login());
  await command('registry', {
    operation: 'cell',
    code: 'cell-1',
    name: 'Test cell',
  });
  cellId = (await test.admin.db.cells.findOneBy({ code: 'cell-1' }))!.id;
  await command('provision', { operation: 'reconcile', cell: cellId });
}, 30000);
afterAll(async () => {
  await test?.cleanup();
  vi.restoreAllMocks();
}, 30000);

it('provisions real Core records, requires password replacement and isolates the self read', async () => {
  const { t, m } = await activeTenant();
  const logged = await login(m.email, temporary);
  const c = cookie(logged);
  expect(
    (
      await request(test.server)
        .get(auth + '/memberships')
        .set('Cookie', c)
    ).status
  ).toBe(403);
  expect(
    (
      await request(test.server)
        .get('/api/core/v1/identity/profile')
        .set('Cookie', c)
    ).status
  ).toBe(403);
  expect(
    (
      await request(test.server)
        .get(control + '/overview')
        .set('Cookie', c)
    ).status
  ).toBe(403);
  const normal = await onboard(m.email);
  expect(
    identityResponseSchema.parse(
      (
        await request(test.server)
          .get('/api/core/v1/identity/profile')
          .set('Cookie', normal)
      ).body
    ).data.name
  ).toBe('Test person');
  expect(
    (
      await request(test.server)
        .get('/api/core/v1/identity/profile?record=' + randomUUID())
        .set('Cookie', normal)
    ).status
  ).toBe(403);
  const other = await tenant();
  await withTenantTransaction(test.cell, other.id, async tx => {
    expect(await tx.employees.findById(m.binding.entity_id!)).toBeNull();
  });
  expect((await test.admin.db.tenants.findById(t.id))?.provisioned).toBe(true);
});
it('rejects concurrent second employee/client bindings and mixed vendor bindings', async () => {
  const a = await tenant();
  const b = await tenant();
  const email = randomUUID() + '@nap.test';
  const responses = await Promise.all(
    [a, b].map(t =>
      request(test.server)
        .post(control + '/members')
        .set('Cookie', rootCookie)
        .send({
          operation: 'member',
          target: t.id,
          kind: 'client',
          name: 'Client',
          email,
          password: temporary,
        })
    )
  );
  expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
  const target = responses[0]?.status === 200 ? b : a;
  expect(
    (
      await request(test.server)
        .post(control + '/members')
        .set('Cookie', rootCookie)
        .send({
          operation: 'member',
          target: target.id,
          kind: 'vendor',
          name: 'Vendor',
          email,
          password: temporary,
        })
    ).status
  ).toBe(409);
});
it('supports vendor selection, reference rotation and independent sessions', async () => {
  const a = await activeTenant();
  const b = await activeTenant();
  const first = await member(a.t.id, 'vendor');
  await member(b.t.id, 'vendor', first.email);
  let c = await onboard(first.email);
  const logged = await login(first.email, replacement);
  const other = cookie(logged);
  expect(sessionResponseSchema.parse(logged.body).data.state).toBe(
    'tenant-selection-required'
  );
  const rows = membershipsResponseSchema.parse(
    (
      await request(test.server)
        .get(auth + '/memberships')
        .set('Cookie', c)
    ).body
  ).data;
  expect(rows).toHaveLength(2);
  expect(JSON.stringify(rows)).not.toContain('cell');
  const before = sessionResponseSchema.parse(
    (
      await request(test.server)
        .get(auth + '/session')
        .set('Cookie', c)
    ).body
  ).data.expiresAt;
  const selected = await request(test.server)
    .post(auth + '/select')
    .set('Cookie', c)
    .send({ membership: rows[0].id });
  expect(selected.status).toBe(200);
  expect(
    (
      await request(test.server)
        .get(auth + '/session')
        .set('Cookie', c)
    ).status
  ).toBe(401);
  c = cookie(selected);
  expect(
    sessionResponseSchema.parse(
      (
        await request(test.server)
          .get(auth + '/session')
          .set('Cookie', c)
      ).body
    ).data.state
  ).toBe('tenant-selected');
  expect(
    sessionResponseSchema.parse(
      (
        await request(test.server)
          .get(auth + '/session')
          .set('Cookie', other)
      ).body
    ).data.state
  ).toBe('tenant-selection-required');
  expect(before).toBeTruthy();
  expect(
    (
      await request(test.server)
        .post(auth + '/select')
        .set('Cookie', c)
        .send({ membership: randomUUID() })
    ).status
  ).toBe(403);
});
it('revokes centrally before synchronization and refuses stale cookies', async () => {
  const { t } = await activeTenant();
  const m = await member(t.id);
  const c = await onboard(m.email);
  await command('members', {
    operation: 'revoke',
    membership: m.binding.id,
    reason: 'Access removed',
  });
  expect(
    (
      await request(test.server)
        .get(auth + '/session')
        .set('Cookie', c)
    ).status
  ).toBe(401);
  const job = (await test.admin.db.provisioning_jobs.findOneBy({
    membership_id: m.binding.id,
  }))!;
  expect(job.stage).toBe('pending');
  await command('provision', { operation: 'retry', job: job.id });
  await withTenantTransaction(test.cell, m.binding.tenant_id, async tx => {
    expect((await tx.tenant_user_bindings.findById(m.binding.id))?.status).toBe(
      'locked'
    );
  });
});
it('refuses suspended tenants, missing assignments and disabled cells on the next request', async () => {
  const { t, m } = await activeTenant();
  const c = await onboard(m.email);
  await command('registry', {
    operation: 'status',
    target: t.id,
    status: 'suspended',
    reason: 'Hold',
  });
  expect(
    (
      await request(test.server)
        .get(auth + '/session')
        .set('Cookie', c)
    ).status
  ).toBe(401);
  await command('registry', {
    operation: 'status',
    target: t.id,
    status: 'active',
    reason: 'Resume',
  });
  await test.owner.none('UPDATE admin.tenants SET cell_id=NULL WHERE id=$1', [
    t.id,
  ]);
  expect(
    (
      await request(test.server)
        .get(auth + '/session')
        .set('Cookie', c)
    ).status
  ).toBe(401);
  await test.owner.none('UPDATE admin.tenants SET cell_id=$2 WHERE id=$1', [
    t.id,
    cellId,
  ]);
  await command('registry', {
    operation: 'cell',
    code: 'cell-1',
    name: 'Test cell',
    enabled: false,
  });
  expect(
    (
      await request(test.server)
        .get(auth + '/session')
        .set('Cookie', c)
    ).status
  ).toBe(401);
  await command('registry', {
    operation: 'cell',
    code: 'cell-1',
    name: 'Test cell',
    enabled: true,
  });
});
it('requires explicit support grants and audits impersonation without inheriting platform access', async () => {
  const target = await activeTenant();
  await onboard(target.m.email);
  const support = await activeTenant();
  const c = await onboard(support.m.email);
  expect(
    (
      await request(test.server)
        .post(auth + '/access')
        .set('Cookie', c)
        .send({ target: target.t.id, reason: 'Help' })
    ).status
  ).toBe(403);
  await command('grants', {
    operation: 'grant',
    user: support.m.user.id,
    role: 'support',
    permission: 'admin-tenancy::control::impersonate',
    enabled: true,
  });
  const r = await request(test.server)
    .post(auth + '/access')
    .set('Cookie', c)
    .send({
      target: target.t.id,
      user: target.m.user.id,
      reason: 'Investigate case',
    });
  expect(r.status).toBe(200);
  const impersonated = cookie(r);
  const view = sessionResponseSchema.parse(
    (
      await request(test.server)
        .get(auth + '/session')
        .set('Cookie', impersonated)
    ).body
  ).data;
  expect(view.actorId).toBe(target.m.user.id);
  expect(view.platformPermissions).toEqual([]);
  expect(
    (
      await request(test.server)
        .post(auth + '/access')
        .set('Cookie', impersonated)
        .send({ target: target.t.id, reason: 'Nested' })
    ).status
  ).toBe(403);
  expect(
    (
      await request(test.server)
        .put(auth + '/password')
        .set('Cookie', impersonated)
        .send({ currentPassword: replacement, newPassword: temporary })
    ).status
  ).toBe(403);
  expect(
    (
      await request(test.server)
        .get('/api/core/v1/identity/profile')
        .set('Cookie', impersonated)
    ).status
  ).toBe(200);
  const event = (await test.admin.db.managed_events.findOneBy({
    session_id: (await test.admin.db.sessions.findOneBy({
      portal_user_id: support.m.user.id,
    }))!.id,
    event: 'impersonation.start',
  }))!;
  expect(event.created_by).toBe(support.m.user.id);
  expect(event.effective_user_id).toBe(target.m.user.id);
  const exited = await request(test.server)
    .post(auth + '/end-access')
    .set('Cookie', impersonated);
  expect(exited.status).toBe(200);
  const again = await request(test.server)
    .post(auth + '/access')
    .set('Cookie', cookie(exited))
    .send({
      target: target.t.id,
      user: target.m.user.id,
      reason: 'Second case',
    });
  expect(again.status).toBe(200);
  await command('grants', {
    operation: 'grant',
    user: support.m.user.id,
    role: 'support',
    permission: 'admin-tenancy::control::impersonate',
    enabled: false,
  });
  expect(
    (
      await request(test.server)
        .get(auth + '/session')
        .set('Cookie', cookie(again))
    ).status
  ).toBe(401);
});
it('requires audit persistence before privileged changes and protects audit history', async () => {
  await test.owner.none('REVOKE INSERT ON admin.managed_events FROM $1:name', [
    test.fixture.role,
  ]);
  const code = randomUUID().slice(0, 12);
  const r = await request(test.server)
    .post(control + '/registry')
    .set('Cookie', rootCookie)
    .send({ operation: 'tenant', code, name: 'Blocked', cell: cellId });
  expect(r.status).toBe(500);
  expect(
    await test.admin.db.tenants.findOneBy({ tenant_code: code })
  ).toBeNull();
  await test.owner.none('GRANT INSERT ON admin.managed_events TO $1:name', [
    test.fixture.role,
  ]);
  await expect(
    test.owner.none("UPDATE admin.managed_events SET reason='rewrite'")
  ).rejects.toThrow();
});
it('recovers failed provisioning and seeds the missing initial administrator on activation', async () => {
  const t = await tenant();
  const cellOwner = test.fixture.owner(test.fixture.cellUrl);
  await cellOwner.none('REVOKE INSERT ON app.employees FROM $1:name', [
    test.fixture.role,
  ]);
  const email = randomUUID() + '@nap.test';
  await command('members', {
    operation: 'member',
    target: t.id,
    kind: 'employee',
    name: 'Retry person',
    email,
    password: temporary,
  });
  const u = (await test.admin.db.portal_users.findOneBy({ email }))!;
  const m = (await test.admin.db.portal_user_tenants.findOneBy({
    portal_user_id: u.id,
  }))!;
  expect(m.ready).toBe(false);
  const job = (await test.admin.db.provisioning_jobs.findOneBy({
    membership_id: m.id,
  }))!;
  expect(job.stage).toBe('failed');
  expect((await login(email, temporary)).status).toBe(401);
  await cellOwner.none('GRANT INSERT ON app.employees TO $1:name', [
    test.fixture.role,
  ]);
  await command('provision', {
    operation: 'retry',
    job: job.id,
    name: 'Retry person',
  });
  await command('provision', { operation: 'retry', job: job.id });
  await withTenantTransaction(test.cell, t.id, async tx => {
    expect(await tx.roles.findOneBy({ code: 'tenant_admin' })).toBeNull();
  });
  await command('provision', { operation: 'activate', target: t.id });
  expect((await test.admin.db.portal_user_tenants.findById(m.id))?.ready).toBe(
    true
  );
  await withTenantTransaction(test.cell, t.id, async tx => {
    expect(await tx.employees.countAll()).toBe(1);
    const role = await tx.roles.findOneBy({ code: 'tenant_admin' });
    expect(
      await tx.role_assignments.findWhere({
        role_id: role!.id,
        binding_id: m.id,
      })
    ).toHaveLength(1);
  });
});
it('refuses premature activation and root impersonation or membership changes', async () => {
  const t = await tenant();
  expect(
    (
      await request(test.server)
        .post(control + '/provision')
        .set('Cookie', rootCookie)
        .send({ operation: 'activate', target: t.id })
    ).status
  ).toBe(409);
  expect(
    (
      await request(test.server)
        .post(auth + '/access')
        .set('Cookie', rootCookie)
        .send({
          target: test.root.tenantId,
          user: test.root.actorId,
          reason: 'Forbidden',
        })
    ).status
  ).toBe(403);
  const rootMember = (await test.admin.db.portal_user_tenants.findOneBy({
    portal_user_id: test.root.actorId,
  }))!;
  expect(
    (
      await request(test.server)
        .post(control + '/members')
        .set('Cookie', rootCookie)
        .send({
          operation: 'revoke',
          membership: rootMember.id,
          reason: 'Forbidden',
        })
    ).status
  ).toBe(403);
  const result = await request(test.server)
    .get(control + '/overview')
    .set('Cookie', rootCookie);
  expect(result.status).toBe(200);
  controlResponseSchema.parse(result.body);
});

it('retains absolute expiry across switching and rejects another deployment cell', async () => {
  const a = await activeTenant();
  const b = await activeTenant();
  const m = await member(a.t.id, 'vendor');
  await member(b.t.id, 'vendor', m.email);
  const c = await onboard(m.email);
  const reference = await readReference(c, test.config.sessionSecret);
  if (!reference) throw new Error('No reference');
  const before = (await test.admin.db.sessions.reference(reference.id))!;
  expect(
    (
      await request(test.server)
        .post(auth + '/select')
        .set('Cookie', c)
        .send({ membership: m.binding.id })
    ).status
  ).toBe(200);
  expect(
    (await test.admin.db.sessions.reference(reference.id))?.absolute_expires_at
  ).toEqual(before.absolute_expires_at);
  const selected = cookie(await login(m.email, replacement));
  const switchReply = await request(test.server)
    .post(auth + '/select')
    .set('Cookie', selected)
    .send({ membership: m.binding.id });
  const wrong = createApp(
    undefined,
    { admin: test.admin, cell: test.cell },
    { auth: { ...test.config, cellCode: 'another-cell' } }
  );
  expect(
    (
      await request(wrong)
        .get('/api/core/v1/identity/profile')
        .set('Cookie', cookie(switchReply))
    ).status
  ).toBe(403);
});
it('enforces RLS and immutable tenant keys on every new Core and projection table', async () => {
  const a = await activeTenant();
  const b = await activeTenant();
  await member(a.t.id, 'client');
  await member(a.t.id, 'vendor');
  const tables = [
    'employees',
    'clients',
    'vendors',
    'vendor_contacts',
    'cell_tenants',
    'tenant_user_bindings',
  ] as const;
  for (const table of tables) {
    const schema =
      table === 'cell_tenants' || table === 'tenant_user_bindings'
        ? 'cell'
        : 'app';
    const physical = table === 'cell_tenants' ? 'tenants' : table;
    const rows = await withTenantTransaction(test.cell, a.t.id, tx =>
      tx.any<{ id: string; tenant_id: string } & Record<string, unknown>>(
        'SELECT * FROM $1:name.$2:name',
        [schema, physical]
      )
    );
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0];
    if (!row) throw new Error('Missing isolation record');
    await withTenantTransaction(test.cell, b.t.id, async tx => {
      expect(await tx[table].findById(row.id)).toBeNull();
    });
    await expect(
      withTenantTransaction(test.cell, a.t.id, tx =>
        tx.none('UPDATE $1:name.$2:name SET tenant_id=$3 WHERE id=$4', [
          schema,
          physical,
          b.t.id,
          row.id,
        ])
      )
    ).rejects.toThrow();
    await expect(
      withTenantTransaction(test.cell, b.t.id, tx =>
        tx.none(
          'INSERT INTO $1:name.$2:name SELECT * FROM json_populate_record(NULL::$1:name.$2:name,$3::json)',
          [schema, physical, JSON.stringify({ ...row, id: randomUUID() })]
        )
      )
    ).rejects.toThrow();
  }
  const vendor = await withTenantTransaction(test.cell, a.t.id, tx =>
    tx.vendors.findWhere({})
  );
  await expect(
    withTenantTransaction(test.cell, b.t.id, tx =>
      tx.vendor_contacts.insert({
        id: randomUUID(),
        tenant_id: b.t.id,
        vendor_id: vendor[0].id,
        code: 'bad-link',
        name: 'Bad',
        email: 'bad@nap.test',
        is_app_user: false,
      })
    )
  ).rejects.toThrow();
  const owner = test.fixture.owner(test.fixture.cellUrl);
  const policies = await owner.any<{ relrowsecurity: boolean }>(
    "SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('app','cell') AND c.relkind='r' AND c.relname<>'schema_migrations'"
  );
  expect(policies.every(p => p.relrowsecurity)).toBe(true);
});
it('refuses upgrades with unexplained non-root bindings and rolls back the additive migration', async () => {
  const url = await test.fixture.createDatabase('legacy_membership');
  const descriptor = adminModules[0];
  await migrateDatabase('admin', url, [
    { ...descriptor, migrations: descriptor.migrations.slice(0, 5) },
  ]);
  const owner = test.fixture.owner(url);
  await owner.none(
    "WITH t AS (INSERT INTO admin.tenants(tenant_code,company,status) VALUES('LEGACY','Legacy','active') RETURNING id), u AS (INSERT INTO admin.portal_users(email,password_hash,status) VALUES('legacy@nap.test','unused','active') RETURNING id) INSERT INTO admin.portal_user_tenants(portal_user_id,tenant_id,status) SELECT u.id,t.id,'active' FROM u,t"
  );
  await expect(migrateDatabase('admin', url, adminModules)).rejects.toThrow();
  expect(await owner.one("SELECT to_regclass('admin.cells') AS table")).toEqual(
    { table: null }
  );
});
it('audits controlled access as the operator, denies active assignment changes and ignores forged tenant context', async () => {
  const { t, m } = await activeTenant();
  const accessed = await request(test.server)
    .post(auth + '/access')
    .set('Cookie', rootCookie)
    .send({ target: t.id, reason: 'Review identity' });
  expect(accessed.status).toBe(200);
  const c = cookie(accessed);
  expect(
    (
      await request(test.server)
        .get(
          `/api/core/v1/identity/profile?record=${m.binding.entity_id}&kind=employee`
        )
        .set('Cookie', c)
    ).status
  ).toBe(200);
  expect(
    (
      await request(test.server)
        .get(
          `/api/core/v1/identity/profile?record=${m.binding.entity_id}&kind=employee`
        )
        .set('Cookie', c)
        .set('X-Tenant-ID', test.root.tenantId)
    ).status
  ).toBe(400);
  expect(
    (
      await request(test.server)
        .post(auth + '/logout')
        .set('Cookie', c)
    ).status
  ).toBe(200);
  rootCookie = cookie(await login());
  expect(
    (await test.admin.db.managed_events.findWhere({ event: 'access.end' }))
      .length
  ).toBeGreaterThan(0);
  await command('registry', {
    operation: 'cell',
    code: 'cell-2',
    name: 'Other cell',
  });
  const other = (await test.admin.db.cells.findOneBy({ code: 'cell-2' }))!;
  expect(
    (
      await request(test.server)
        .post(control + '/registry')
        .set('Cookie', rootCookie)
        .send({
          operation: 'tenant-update',
          target: t.id,
          tier: 'enterprise',
          cell: other.id,
        })
    ).status
  ).toBe(409);
});

it('commits a job before cell work and recovers after cell commit but central finalization failure', async () => {
  const t = await tenant();
  const email = randomUUID() + '@nap.test';
  const created = await request(test.server)
    .post(control + '/members')
    .set('Cookie', rootCookie)
    .send({
      operation: 'member',
      target: t.id,
      kind: 'employee',
      name: 'Durable person',
      email,
      password: temporary,
    });
  expect(created.status).toBe(200);
  const id = controlCommandResponseSchema.parse(created.body).data.jobId;
  if (!id) throw new Error('Missing durable job');
  const job = (await test.admin.db.provisioning_jobs.findById(id))!;
  expect(job.stage).toBe('pending');
  await withTenantTransaction(test.cell, t.id, async tx => {
    expect(await tx.employees.findById(job.record_id)).toBeNull();
  });
  await test.owner.none(
    "CREATE FUNCTION admin.fail_job_finish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.stage='complete' THEN RAISE EXCEPTION 'Injected failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_job BEFORE UPDATE ON admin.provisioning_jobs FOR EACH ROW EXECUTE FUNCTION admin.fail_job_finish()"
  );
  const failed = await request(test.server)
    .post(control + '/provision')
    .set('Cookie', rootCookie)
    .send({ operation: 'retry', job: id, name: 'Durable person' });
  expect(failed.status).toBe(500);
  expect((await test.admin.db.provisioning_jobs.findById(id))?.stage).toBe(
    'pending'
  );
  expect(
    (await test.admin.db.portal_user_tenants.findById(job.membership_id))?.ready
  ).toBe(false);
  await withTenantTransaction(test.cell, t.id, async tx => {
    expect(await tx.employees.countAll()).toBe(1);
  });
  await test.owner.none(
    'DROP TRIGGER fail_job ON admin.provisioning_jobs; DROP FUNCTION admin.fail_job_finish()'
  );
  await command('provision', { operation: 'retry', job: id });
  expect((await test.admin.db.provisioning_jobs.findById(id))?.stage).toBe(
    'complete'
  );
  await withTenantTransaction(test.cell, t.id, async tx => {
    expect(await tx.employees.countAll()).toBe(1);
  });
});

it('protects the original root binding when its owner or readiness is changed directly', async () => {
  const { m } = await activeTenant();
  const binding = (await test.admin.db.portal_user_tenants.findOneBy({
    portal_user_id: test.root.actorId,
  }))!;
  await expect(
    test.owner.none(
      'UPDATE admin.portal_user_tenants SET portal_user_id=$1 WHERE id=$2',
      [m.user.id, binding.id]
    )
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    test.owner.none(
      'UPDATE admin.portal_user_tenants SET ready=false WHERE id=$1',
      [binding.id]
    )
  ).rejects.toMatchObject({ code: '23514' });
});

it('rejects a missing first-write name without marking a cell failure and replays existing records without it', async () => {
  const t = await tenant();
  const created = await request(test.server)
    .post(control + '/members')
    .set('Cookie', rootCookie)
    .send({
      operation: 'member',
      target: t.id,
      kind: 'employee',
      name: 'Retry input',
      email: randomUUID() + '@nap.test',
      password: temporary,
    });
  expect(created.status).toBe(200);
  const job = controlCommandResponseSchema.parse(created.body).data.jobId!;
  const missing = await request(test.server)
    .post(control + '/provision')
    .set('Cookie', rootCookie)
    .send({ operation: 'retry', job });
  expect(missing.status).toBe(400);
  expect(apiErrorSchema.parse(missing.body).code).toBe('INVALID_INPUT');
  const pending = await test.admin.db.provisioning_jobs.findById(job);
  expect(pending?.stage).toBe('pending');
  expect(pending?.failure_code).toBeNull();
  expect(
    (await test.admin.db.portal_user_tenants.findById(pending!.membership_id))
      ?.ready
  ).toBe(false);
  await command('provision', { operation: 'retry', job, name: 'Retry input' });
  await command('provision', { operation: 'retry', job });
  expect((await test.admin.db.provisioning_jobs.findById(job))?.stage).toBe(
    'complete'
  );
  await withTenantTransaction(test.cell, t.id, async tx => {
    expect(await tx.employees.countAll()).toBe(1);
  });
});

it('requires a sole vendor to select after each login while preserving a selected reload', async () => {
  const { t } = await activeTenant();
  const vendor = await member(t.id, 'vendor');
  const initial = await onboard(vendor.email);
  const afterPassword = await request(test.server)
    .get(auth + '/session')
    .set('Cookie', initial);
  expect(sessionResponseSchema.parse(afterPassword.body).data).toMatchObject({
    state: 'tenant-selection-required',
    tenantId: null,
    canChangeTenant: true,
  });
  const fresh = await login(vendor.email, replacement);
  expect(sessionResponseSchema.parse(fresh.body).data.state).toBe(
    'tenant-selection-required'
  );
  const selected = await request(test.server)
    .post(auth + '/select')
    .set('Cookie', cookie(fresh))
    .send({ membership: vendor.binding.id });
  expect(selected.status).toBe(200);
  const checked = await request(test.server)
    .get(auth + '/session')
    .set('Cookie', cookie(selected));
  expect(sessionResponseSchema.parse(checked.body).data).toMatchObject({
    tenantId: t.id,
    tenantName: t.company,
    userType: 'vendor',
    canChangeTenant: true,
    state: 'tenant-selected',
  });
  const nextLogin = await login(vendor.email, replacement);
  expect(sessionResponseSchema.parse(nextLogin.body).data.tenantId).toBeNull();
});

it('exposes safe provisioning relationships and bounded employee navigation without central grants', async () => {
  const { m } = await activeTenant();
  const c = await onboard(m.email);
  const navigation = await request(test.server)
    .get('/api/core/v1/identity/navigation')
    .set('Cookie', c);
  expect(navigation.status).toBe(200);
  expect(navigationResponseSchema.parse(navigation.body).data).toEqual({
    employees: true,
  });
  expect(
    (
      await request(test.server)
        .get(control + '/overview')
        .set('Cookie', c)
    ).status
  ).toBe(403);
  const result = await request(test.server)
    .get(control + '/overview')
    .set('Cookie', rootCookie);
  const data = controlResponseSchema.parse(result.body).data;
  expect(data.users.find(u => u.id === m.user.id)).toEqual({
    id: m.user.id,
    email: m.email,
    status: 'active',
  });
  expect(data.members.find(b => b.id === m.binding.id)?.entity_id).toBe(
    m.binding.entity_id
  );
  expect(data.jobs.find(j => j.membership_id === m.binding.id)?.record_id).toBe(
    m.binding.entity_id
  );
  expect(JSON.stringify(result.body)).not.toMatch(
    /password_hash|must_change_password|temporary-password/
  );
  expect(
    (
      await request(test.server)
        .get('/api/core/v1/identity/profile')
        .query({ record: m.binding.entity_id, kind: 'employee' })
        .set('Cookie', c)
    ).status
  ).toBe(403);
});

it('retains central administration for a vendor whose only assignment is unavailable', async () => {
  const { t } = await activeTenant();
  const vendor = await member(t.id, 'vendor');
  await onboard(vendor.email);
  await request(test.server)
    .post(control + '/role-policy')
    .set('Cookie', rootCookie)
    .send({
      operation: 'platform-role',
      user: vendor.user.id,
      role: 'platform_admin',
      enabled: true,
    })
    .expect(200);
  await test.owner.none(
    'UPDATE admin.tenants SET provisioned=false WHERE id=$1',
    [t.id]
  );
  const response = await login(vendor.email, replacement);
  expect(response.status).toBe(200);
  const initial = sessionResponseSchema.parse(response.body).data;
  expect(initial).toMatchObject({ tenantId: null, canChangeTenant: false });
  expect(initial.platformPermissions).toContain(
    'admin-tenancy::control::overview'
  );
  const checked = await request(test.server)
    .get(auth + '/session')
    .set('Cookie', cookie(response));
  expect(sessionResponseSchema.parse(checked.body).data.canChangeTenant).toBe(
    false
  );
  const choices = await request(test.server)
    .get(auth + '/memberships')
    .set('Cookie', cookie(response));
  expect(membershipsResponseSchema.parse(choices.body).data).toEqual([]);
});

it('lists only available assignments across multiple vendor memberships', async () => {
  const first = await activeTenant();
  const second = await activeTenant();
  const vendor = await member(first.t.id, 'vendor');
  await member(second.t.id, 'vendor', vendor.email);
  const session = await onboard(vendor.email);
  await test.owner.none(
    'UPDATE admin.tenants SET provisioned=false WHERE id=$1',
    [second.t.id]
  );
  const choices = await request(test.server)
    .get(auth + '/memberships')
    .set('Cookie', session)
    .expect(200);
  expect(membershipsResponseSchema.parse(choices.body).data).toEqual([
    {
      id: vendor.binding.id,
      tenantId: first.t.id,
      tenantCode: first.t.tenant_code,
      company: first.t.company,
      userType: 'vendor',
    },
  ]);
  expect(await test.admin.db.cells.availableAssignments([])).toEqual([]);
  await test.owner.none('UPDATE admin.cells SET enabled=false WHERE id=$1', [
    cellId,
  ]);
  try {
    expect(
      await test.admin.db.cells.availableAssignments([first.t.id])
    ).toEqual([]);
  } finally {
    await test.owner.none('UPDATE admin.cells SET enabled=true WHERE id=$1', [
      cellId,
    ]);
  }
});
