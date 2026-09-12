/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterAll, beforeAll, expect, it } from 'vitest';
import request from 'supertest';
import {
  controlCommandResponseSchema,
  membershipsResponseSchema,
} from '@nap/shared';
import { randomUUID } from 'node:crypto';
import { multiCell } from '../fixtures/multiCell.js';
import { authEnv } from '../fixtures/authDatabase.js';
import { withTenantTransaction } from '../../src/db/withTenantTransaction.js';
import { createCellDatabase } from '../../src/db/cell/index.js';

let test: Awaited<ReturnType<typeof multiCell>>;
let root: string;
let cell1: string;
let cell2: string;
const auth = '/api/admin-tenancy/v1/auth';
const control = '/api/admin-tenancy/v1/control';
const profile = '/api/core/v1/identity/profile';
const temporary = 'temporary-password-123';
const replacement = 'replacement-password-123';

/**
 * Does: Extracts the browser cookie returned by a successful login or tenant selection.
 * Called by: test helpers and acceptance cases after session transitions.
 */
function cookie(reply: { headers: Record<string, unknown> }) {
  const values = reply.headers['set-cookie'];
  if (!Array.isArray(values) || typeof values[0] !== 'string')
    throw new Error('Missing cookie');
  return values[0].split(';')[0];
}
/**
 * Does: Sends an operator command through the single API and checks the response status.
 * Called by: fixture setup and acceptance cases when creating or updating test records.
 */
async function command(action: string, body: object, expected = 200) {
  const reply = await request(test.api.origin)
    .post(control + '/' + action)
    .set('Cookie', root)
    .send(body);
  expect(reply.status, JSON.stringify(reply.body)).toBe(expected);
  return reply;
}
/** Does: Creates a pending tenant in a chosen registered cell. Called by: acceptance cases. */
async function tenant(cell: string) {
  const code = randomUUID().slice(0, 12);
  await command('registry', {
    operation: 'tenant',
    code,
    name: 'Fixture tenant',
    cell,
  });
  return (await test.admin.db.tenants.findOneBy({ tenant_code: code }))!;
}
/** Does: Creates a durable identity job, optionally completing its cell write. Called by: acceptance cases. */
async function member(
  target: string,
  kind = 'employee',
  email = randomUUID() + '@nap.test',
  run = true
) {
  const reply = await command('members', {
    operation: 'member',
    target,
    kind,
    email,
    name: 'Fixture person',
    password: temporary,
  });
  const id = controlCommandResponseSchema.parse(reply.body).data.jobId;
  if (!id) throw new Error('Missing job');
  if (run)
    await command('provision', {
      operation: 'retry',
      job: id,
      name: 'Fixture person',
    });
  return { job: (await test.admin.db.provisioning_jobs.findById(id))!, email };
}
/** Does: Provisions an initial employee and activates a tenant. Called by: acceptance cases. */
async function active(cell: string) {
  const t = await tenant(cell);
  const m = await member(t.id);
  await command('provision', { operation: 'activate', target: t.id });
  return { t, m };
}
/** Does: Logs in and completes the first-password requirement. Called by: acceptance cases. */
async function onboard(email: string) {
  const result = await request(test.api.origin)
    .post(auth + '/login')
    .send({ email, password: temporary });
  expect(result.status).toBe(200);
  const c = cookie(result);
  expect(
    (await request(test.api.origin).get(profile).set('Cookie', c)).status
  ).toBe(403);
  expect(
    (
      await request(test.api.origin)
        .put(auth + '/password')
        .set('Cookie', c)
        .send({ currentPassword: temporary, newPassword: replacement })
    ).status
  ).toBe(200);
  return c;
}

beforeAll(async () => {
  test = await multiCell();
  const login = await request(test.api.origin)
    .post(auth + '/login')
    .send({
      email: authEnv.ROOT_EMAIL_TEST,
      password: authEnv.ROOT_PASSWORD_TEST,
    });
  expect(login.status).toBe(200);
  root = cookie(login);
  cell1 = (await test.admin.db.cells.findOneBy({ code: 'cell-1' }))!.id;
  await command('registry', {
    operation: 'cell',
    code: 'cell-2',
    name: 'Second cell',
  });
  cell2 = (await test.admin.db.cells.findOneBy({ code: 'cell-2' }))!.id;
  await command('provision', { operation: 'reconcile', cell: cell1 });
}, 30000);
afterAll(async () => {
  await test?.cleanup();
}, 30000);

it('provisions in either cell, logs in a Cell 2-only user and ignores client-supplied cell selection', async () => {
  const a = await active(cell1);
  const b = await active(cell2);
  const c = await onboard(b.m.email);
  const result = await request(test.api.origin).get(profile).set('Cookie', c);
  expect(result.status).toBe(200);
  expect(JSON.stringify(result.body)).not.toContain('cell-');
  expect(
    (
      await request(test.api.origin)
        .get(profile)
        .set('Cookie', c)
        .set('x-cell-id', cell1)
    ).status
  ).toBe(200);
  await withTenantTransaction(test.cell, b.t.id, async tx =>
    expect(await tx.employees.findById(b.m.job.record_id)).toBeNull()
  );
  await withTenantTransaction(test.cell2, b.t.id, async tx =>
    expect((await tx.employees.findById(b.m.job.record_id))?.id).toBe(
      b.m.job.record_id
    )
  );
  await withTenantTransaction(test.cell, a.t.id, async tx =>
    expect((await tx.employees.findById(a.m.job.record_id))?.id).toBe(
      a.m.job.record_id
    )
  );
  // Replaying activation after a lost response is harmless and rechecks proof.
  await command('provision', { operation: 'activate', target: b.t.id });
}, 15000);

it('switches one vendor across cells, rotates cookies, and honors revocation despite stale projections', async () => {
  const a = await active(cell1);
  const b = await active(cell2);
  const vendor = await member(a.t.id, 'vendor');
  const second = await member(b.t.id, 'vendor', vendor.email);
  const c = await onboard(vendor.email);
  const listed = await request(test.api.origin)
    .get(auth + '/memberships')
    .set('Cookie', c);
  expect(membershipsResponseSchema.parse(listed.body).data).toHaveLength(2);
  let current = c;
  for (const membership of [
    vendor.job.membership_id,
    second.job.membership_id,
  ]) {
    const selected = await request(test.api.origin)
      .post(auth + '/select')
      .set('Cookie', current)
      .send({ membership });
    expect(selected.status).toBe(200);
    const next = cookie(selected);
    expect(
      (await request(test.api.origin).get(profile).set('Cookie', current))
        .status
    ).toBe(401);
    expect(
      (await request(test.api.origin).get(profile).set('Cookie', next)).status
    ).toBe(200);
    current = next;
  }
  await command('members', {
    operation: 'revoke',
    membership: second.job.membership_id,
    reason: 'Acceptance test',
  });
  expect(
    (await request(test.api.origin).get(profile).set('Cookie', current)).status
  ).toBe(401);
  await command('provision', { operation: 'retry', job: second.job.id });
  await withTenantTransaction(test.cell2, b.t.id, async tx =>
    expect(
      (await tx.tenant_user_bindings.findById(second.job.membership_id))?.status
    ).toBe('locked')
  );
}, 15000);

it('keeps central operations and Cell 1 available during Cell 2 outage and resumes pending work', async () => {
  const a = await active(cell1);
  const b = await active(cell2);
  const ca = await onboard(a.m.email);
  const cb = await onboard(b.m.email);
  const pending = await member(b.t.id, 'client', undefined, false);
  await test.database2.stop();
  try {
    expect(
      (await request(test.api.origin).get(profile).set('Cookie', cb)).status
    ).toBe(503);
    expect(
      (await request(test.api.origin).get(profile).set('Cookie', ca)).status
    ).toBe(200);
    expect(
      (
        await request(test.api.origin)
          .get(auth + '/session')
          .set('Cookie', cb)
      ).status
    ).toBe(200);
    await command(
      'provision',
      { operation: 'retry', job: pending.job.id, name: 'Recovered person' },
      200
    );
    expect(
      (await test.admin.db.provisioning_jobs.findById(pending.job.id))?.stage
    ).toBe('failed');
    expect((await request(test.api.origin).get('/health/ready')).status).toBe(
      200
    );
  } finally {
    await test.database2.start();
  }
  await command('provision', {
    operation: 'retry',
    job: pending.job.id,
    name: 'Recovered person',
  });
  expect(
    (await test.admin.db.provisioning_jobs.findById(pending.job.id))?.stage
  ).toBe('complete');
}, 15000);

it('recovers cell commits after failed central finalization without duplicate records', async () => {
  const t = await tenant(cell2);
  const m = await member(t.id, 'employee', undefined, false);
  await test.owner.none(
    "CREATE FUNCTION admin.fail_multi_finish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.stage='complete' THEN RAISE EXCEPTION 'Injected'; END IF; RETURN NEW; END $$; CREATE TRIGGER fail_multi BEFORE UPDATE ON admin.provisioning_jobs FOR EACH ROW EXECUTE FUNCTION admin.fail_multi_finish()"
  );
  try {
    await command(
      'provision',
      { operation: 'retry', job: m.job.id, name: 'Replay person' },
      500
    );
  } finally {
    await test.owner.none(
      'DROP TRIGGER fail_multi ON admin.provisioning_jobs; DROP FUNCTION admin.fail_multi_finish()'
    );
  }
  expect(
    (await test.admin.db.portal_user_tenants.findById(m.job.membership_id))
      ?.ready
  ).toBe(false);
  await test.database2.stop();
  await test.database2.start();
  await command('provision', { operation: 'retry', job: m.job.id });
  await command('provision', { operation: 'activate', target: t.id });
  await withTenantTransaction(test.cell2, t.id, async tx =>
    expect(await tx.employees.countAll()).toBe(1)
  );
}, 15000);

it('refuses missing or stale activation proofs and recovers after a final projection survives rollback', async () => {
  const t = await tenant(cell2);
  const m = await member(t.id);
  const owner = test.fixture.owner(test.url2);
  await owner.none(
    'UPDATE cell.tenant_user_bindings SET revision=0 WHERE id=$1',
    [m.job.membership_id]
  );
  await command('provision', { operation: 'activate', target: t.id }, 409);
  expect((await test.admin.db.tenants.findById(t.id))?.status).toBe('pending');
  await command('provision', { operation: 'retry', job: m.job.id });
  // Deferred trigger fires at COMMIT, after the final cell projection has committed.
  await test.owner.none(
    "CREATE FUNCTION admin.fail_multi_activation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status='active' THEN RAISE EXCEPTION 'Injected'; END IF; RETURN NEW; END $$; CREATE CONSTRAINT TRIGGER fail_activation AFTER UPDATE ON admin.tenants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION admin.fail_multi_activation()"
  );
  try {
    await command('provision', { operation: 'activate', target: t.id }, 500);
  } finally {
    await test.owner.none(
      'DROP TRIGGER fail_activation ON admin.tenants; DROP FUNCTION admin.fail_multi_activation()'
    );
  }
  expect((await test.admin.db.tenants.findById(t.id))?.status).toBe('pending');
  await withTenantTransaction(test.cell2, t.id, async tx =>
    expect((await tx.cell_tenants.findById(t.id))?.status).toBe('active')
  );
  await command('provision', { operation: 'activate', target: t.id });
  expect((await test.admin.db.tenants.findById(t.id))?.status).toBe('active');
}, 15000);

it('enforces separate database role credentials for each cell', async () => {
  for (const [url, role] of [
    [test.url2, test.fixture.role],
    [test.fixture.cellUrl, test.role2],
  ]) {
    const db = createCellDatabase(test.fixture.runtimeUrl(url, role));
    try {
      await expect(db.db.one('SELECT 1')).rejects.toMatchObject({
        code: '42501',
      });
    } finally {
      await db.close();
    }
  }
});

it('audits controlled access across cells and denies spoofed targets or privilege escalation', async () => {
  const b = await active(cell2);
  const ordinary = await onboard(b.m.email);
  expect(
    (
      await request(test.api.origin)
        .post(control + '/provision')
        .set('Cookie', ordinary)
        .set('X-Nap-Cell', 'cell-1')
        .set('X-Forwarded-For', '1.2.3.4')
        .send({ operation: 'activate', target: b.t.id })
    ).status
  ).toBe(403);
  const enter = await request(test.api.origin)
    .post(auth + '/access')
    .set('Cookie', root)
    .send({
      target: b.t.id,
      user: (await test.admin.db.portal_user_tenants.findById(
        b.m.job.membership_id
      ))!.portal_user_id,
      reason: 'Verify cross-cell support',
    });
  expect(enter.status).toBe(200);
  const controlled = cookie(enter);
  const reply = await request(test.api.origin)
    .get(profile)
    .set('Cookie', controlled)
    .set('X-Nap-Tenant', randomUUID())
    .set('X-Nap-Cell', 'cell-1');
  expect(reply.status).toBe(200);
  expect(JSON.stringify(reply.body)).toContain(b.m.job.record_id);
  expect(
    (
      await request(test.api.origin)
        .get(control + '/overview')
        .set('Cookie', controlled)
    ).status
  ).toBe(403);
  const exit = await request(test.api.origin)
    .post(auth + '/end-access')
    .set('Cookie', controlled);
  expect(exit.status).toBe(200);
  root = cookie(exit);
  const events = await test.admin.db.managed_events.findWhere({
    target_id: b.t.id,
  });
  expect(
    events.filter(
      e => e.event === 'impersonation.start' || e.event === 'impersonation.end'
    )
  ).toHaveLength(2);
  expect(events.every(e => e.operator_id === test.root.actorId)).toBe(true);
}, 15000);

it('isolates concurrent requests with identical employee IDs in different cells', async () => {
  const a = await active(cell1);
  const b = await tenant(cell2);
  const m = await member(b.id, 'employee', undefined, false);
  await test.admin.db.provisioning_jobs.update(m.job.id, {
    record_id: a.m.job.record_id,
  });
  await test.admin.db.portal_user_tenants.update(m.job.membership_id, {
    entity_id: a.m.job.record_id,
  });
  await command('provision', {
    operation: 'retry',
    job: m.job.id,
    name: 'Second employee',
  });
  await command('provision', { operation: 'activate', target: b.id });
  const ca = await onboard(a.m.email);
  const cb = await onboard(m.email);
  const responses = await Promise.all(
    Array.from({ length: 20 }, async (_, index) => {
      const email = index % 2 ? a.m.email : m.email;
      const response = await request(test.api.origin)
        .get(profile)
        .set('Cookie', index % 2 ? ca : cb)
        .set('x-cell-id', index % 2 ? cell2 : cell1);
      expect(response.status).toBe(200);
      expect(JSON.stringify(response.body)).toContain(email);
      return response;
    })
  );
  expect(responses).toHaveLength(20);
  const id = randomUUID();
  for (const [handle, tenantId] of [
    [test.cell, a.t.id],
    [test.cell2, b.id],
  ] as const) {
    await withTenantTransaction(handle, tenantId, tx =>
      tx.none(
        "INSERT INTO app.companies(id,tenant_id,code,name,created_at,updated_at) VALUES($1,$2,'SAME','Before',now(),now())",
        [id, tenantId]
      )
    );
  }
  await Promise.all(
    Array.from({ length: 20 }, async (_, index) => {
      const name = index % 2 ? 'Cell A company' : 'Cell B company';
      const reply = await request(test.api.origin)
        .put(
          '/api/core/v1/companies/update?cell_id=' + (index % 2 ? cell2 : cell1)
        )
        .set('Cookie', index % 2 ? ca : cb)
        .set('x-cell-id', index % 2 ? cell2 : cell1)
        .send({ ids: [id], changes: { name } });
      expect(reply.status, JSON.stringify(reply.body)).toBe(200);
    })
  );
  expect(
    (
      await request(test.api.origin)
        .put('/api/core/v1/companies/update')
        .set('Cookie', ca)
        .send({ ids: [id], changes: { name: 'Spoofed' }, cell_id: cell2 })
    ).status
  ).toBe(400);
  await withTenantTransaction(test.cell, a.t.id, async tx =>
    expect((await tx.companies.findById(id))?.name).toBe('Cell A company')
  );
  await withTenantTransaction(test.cell2, b.id, async tx =>
    expect((await tx.companies.findById(id))?.name).toBe('Cell B company')
  );
}, 15000);

it('quarantines unsafe roles and missing relations without blocking admin or the other cell', async () => {
  const owner = test.fixture.owner(test.url2);
  try {
    await test.fixture.control.none('ALTER ROLE $1:name BYPASSRLS', [
      test.role2,
    ]);
    await test.cells.check();
    expect(() => test.cells.get(cell2)).toThrow();
    expect(test.cells.get(cell1)).toBe(test.cell);
    expect((await request(test.api.origin).get('/health/ready')).status).toBe(
      200
    );
    await test.fixture.control.none('ALTER ROLE $1:name NOBYPASSRLS', [
      test.role2,
    ]);
    await owner.none(
      'ALTER TABLE app.companies RENAME TO companies_unavailable'
    );
    await test.cells.check();
    expect(() => test.cells.get(cell2)).toThrow();
    await owner.none(
      'ALTER TABLE app.companies_unavailable RENAME TO companies'
    );
    await test.cells.check();
    expect(test.cells.get(cell2)).toBe(test.cell2);
  } finally {
    await test.fixture.control.none('ALTER ROLE $1:name NOBYPASSRLS', [
      test.role2,
    ]);
    if (
      await owner.oneOrNone(
        "SELECT 1 FROM pg_class WHERE oid=to_regclass('app.companies_unavailable')"
      )
    )
      await owner.none(
        'ALTER TABLE app.companies_unavailable RENAME TO companies'
      );
    await test.cells.check();
  }
});

it('starts with an unavailable cell and recovers on the scheduled probe without restart', async () => {
  const isolated = await multiCell({}, true);
  try {
    const origin = isolated.api.origin;
    expect((await request(origin).get('/health/ready')).status).toBe(200);
    expect(isolated.cells.get(isolated.cellId)).toBe(isolated.cell);
    expect(() => isolated.cells.get(isolated.cell2Id)).toThrow();
    await isolated.fixture.control.none('ALTER ROLE $1:name LOGIN', [
      isolated.role2,
    ]);
    await expect
      .poll(
        () => {
          try {
            return isolated.cells.get(isolated.cell2Id) === isolated.cell2;
          } catch {
            return false;
          }
        },
        { timeout: 35000, interval: 250 }
      )
      .toBe(true);
    expect(isolated.api.origin).toBe(origin);
  } finally {
    await isolated.cleanup();
  }
}, 45000);
