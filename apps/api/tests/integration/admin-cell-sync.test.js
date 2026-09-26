/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createAdminDatabase,
  using,
} from '../../src/infrastructure/runtime/adminDatabase.js';
import { setupLocal } from '../../src/infrastructure/provisioning/postgres.js';
import { migrateAdmin } from '../../src/application/maintenance/migrateAdmin.js';
import { roleUrl } from '../../src/application/shared/configuration.js';
import { registerCell } from '../../src/modules/admin-tenancy/domain/cells.js';
import { bootstrapRoot } from '../../src/modules/admin-tenancy/domain/bootstrap.js';
import {
  ARGON2_MINIMUM,
  verifyPassword,
} from '../../src/modules/admin-tenancy/domain/password.js';
import { createSession } from '../../src/modules/admin-tenancy/domain/session.js';
import { createCellRegistry } from '../../src/infrastructure/runtime/cellRegistry.js';
import { createLocalCellDriver } from '../../src/infrastructure/provisioning/localCells.js';
import { createStages } from '../../src/application/provisioning/stages.js';
import { createProvisioningWorker } from '../../src/application/provisioning/worker.js';
import { createSyncWorker } from '../../src/application/sync/worker.js';
import { deliverTenant } from '../../src/application/sync/engine.js';
import { requestPortalAccess } from '../../src/modules/cell-tenancy/domain/portalAccess.js';

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
  secret: 'integration-session-secret-of-ample-length',
  idleMinutes: 30,
  absoluteHours: 12,
};
const PASSWORD = 'temporary-Passw0rd-for-sync';
const created = new Set();
let handle, db, dir, registry, sync, cellId, cell, napsoftId, rootEmail;
let otherId;

/** Run enough ticks for a change to go both ways and come back. */
async function drain() {
  for (let i = 0; i < 3; i++) await sync.tick();
}

const copy = (table, id) =>
  cell.oneOrNone(`SELECT * FROM cell.${table} WHERE id=$1`, [id]);
const adminRow = (table, id) =>
  db.oneOrNone(`SELECT * FROM admin.${table} WHERE id=$1`, [id]);
const outboxRows = (topic, entityId) =>
  db.any(
    'SELECT * FROM admin.outbox WHERE topic=$1 AND entity_id=$2 ORDER BY revision',
    [topic, entityId]
  );
const requestRows = memberId =>
  cell.any(
    `SELECT * FROM cell.outbox WHERE topic='portal_access' AND entity_id=$1 ORDER BY revision`,
    [memberId]
  );
const loginByEmail = email =>
  db.oneOrNone('SELECT * FROM admin.portal_users WHERE lower(email)=$1', [
    email,
  ]);
const membershipOf = (portalUserId, tenantId) =>
  db.oneOrNone(
    `SELECT * FROM admin.portal_user_tenants
      WHERE portal_user_id=$1 AND tenant_id=$2 AND deactivated_at IS NULL`,
    [portalUserId, tenantId]
  );

/** Append a portal-access request in its own cell transaction. */
function request(tenantId, memberId, email, enabled, memberType = 'employee') {
  return cell.tx(tx =>
    requestPortalAccess(
      tx,
      {
        tenantId,
        memberId,
        memberType,
        email,
        enabled,
        ...(enabled ? { temporaryPassword: PASSWORD } : {}),
      },
      { hashingPolicy: ARGON2_MINIMUM }
    )
  );
}

/** Create a tenant on the test cell and deliver its copy. */
async function tenantOnCell() {
  const code = 'T' + randomUUID().replaceAll('-', '').slice(0, 10);
  const row = await db.tenants.insert({
    tenant_code: code,
    name: `Tenant ${code}`,
    status: 'active',
  });
  await db.tenants.update(row.id, { cell_id: cellId });
  await drain();
  expect(await copy('tenants', row.id)).not.toBeNull();
  return row.id;
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
  rootEmail = `root-${unique}@nap.test`;
  const boot = await bootstrapRoot(db, {
    tenantCode: `NAP-${unique}`,
    tenantName: `Test Napsoft ${unique}`,
    rootEmail,
    rootPassword: 'correct-horse-battery-staple',
    hashingPolicy: ARGON2_MINIMUM,
  });
  napsoftId = boot.tenant.id;

  dir = await mkdtemp(join(tmpdir(), 'nap-sync-'));
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
    { actorId: randomUUID(), granted: true, deniedTenantIds: [] },
    { operation: 'cell', suffix: 's' + randomUUID().slice(0, 8) }
  );
  created.add(registered.cell.database_name);
  cellId = registered.cell.id;
  await provisioning.tick();
  expect(registry.readiness(cellId)).toEqual({ ready: true });
  cell = registry.dbFor(cellId);
  sync = createSyncWorker({ admin: { db }, registry, intervalMs: 5 });
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

describe('admin-cell sync (I0004)', () => {
  it('AC09: worker start backfills existing rows; a second start inserts nothing', async () => {
    const before = await db.one('SELECT count(*)::int AS n FROM admin.outbox');
    await db.none('DELETE FROM admin.outbox');
    const inserted = await sync.backfill();
    expect(inserted).toBeGreaterThan(0);
    expect(await sync.backfill()).toBe(0);
    await drain();
    const pending = await db.one(
      `SELECT count(*)::int AS n FROM admin.outbox WHERE status <> 'delivered'`
    );
    expect(pending.n).toBe(0);
    expect(before.n).toBeGreaterThan(0);
    const tenant = await adminRow('tenants', napsoftId);
    expect((await copy('tenants', napsoftId)).revision).toBe(tenant.revision);
  });

  it('AC04: a write that changes only ready adds no outbox row and no revision', async () => {
    const root = await db.one(
      'SELECT * FROM admin.portal_user_tenants WHERE tenant_id=$1',
      [napsoftId]
    );
    const rows = (await outboxRows('membership', root.id)).length;
    await db.tenants.update(napsoftId, { rbac_ready: true });
    await db.portal_user_tenants.update(root.id, { ready: root.ready });
    expect((await adminRow('portal_user_tenants', root.id)).revision).toBe(
      root.revision
    );
    expect(await outboxRows('membership', root.id)).toHaveLength(rows);
  });

  describe('portal access and memberships', () => {
    const memberId = randomUUID();
    const email = `member-${randomUUID().slice(0, 8)}@nap.test`;
    let login, membership;

    it('AC10: an on request creates a login and a pending membership that reaches the cell', async () => {
      await request(napsoftId, memberId, email, true);
      const [row] = await requestRows(memberId);
      expect(JSON.stringify(row.payload)).not.toContain(PASSWORD);
      expect(row.payload.password_hash).toMatch(/^\$argon2id\$/);
      await drain();

      expect((await requestRows(memberId))[0].status).toBe('delivered');
      login = await loginByEmail(email);
      expect(login.must_change_password).toBe(true);
      expect(await verifyPassword(login.password_hash, PASSWORD)).toBe(true);
      membership = await membershipOf(login.id, napsoftId);
      expect(membership).toMatchObject({
        status: 'pending',
        member_id: memberId,
        member_type: 'employee',
      });
      expect(await copy('tenant_members', membership.id)).toMatchObject({
        portal_user_id: login.id,
        member_id: memberId,
        status: 'pending',
        revision: membership.revision,
      });
    });

    it('AC01: activating, suspending, archiving, and restoring reach the cell', async () => {
      const actorId = randomUUID();
      const check = async () => {
        await drain();
        const admin = await adminRow('portal_user_tenants', membership.id);
        const copied = await copy('tenant_members', membership.id);
        expect(copied.revision).toBe(admin.revision);
        expect(copied.status).toBe(admin.status);
        expect(copied.deactivated_at === null).toBe(
          admin.deactivated_at === null
        );
        expect(copied.updated_by).toBe(actorId);
      };
      await db.portal_user_tenants.update(
        membership.id,
        { status: 'active' },
        { actorId }
      );
      await check();
      await db.portal_user_tenants.update(
        membership.id,
        { status: 'suspended' },
        { actorId }
      );
      await check();
      await db.portal_user_tenants.removeWhere(
        { id: membership.id },
        { actorId }
      );
      await check();
      await db.portal_user_tenants.restoreWhere(
        { id: membership.id },
        { actorId }
      );
      await check();
      await db.portal_user_tenants.update(
        membership.id,
        { status: 'active' },
        { actorId }
      );
      await check();
    });

    it('AC11: a login active elsewhere gets an active membership and keeps its password', async () => {
      otherId = await tenantOnCell();
      const hash = (await loginByEmail(email)).password_hash;
      await request(otherId, memberId, email, true);
      await drain();
      const other = await membershipOf(login.id, otherId);
      expect(other.status).toBe('active');
      expect((await loginByEmail(email)).password_hash).toBe(hash);
      expect((await copy('tenant_members', other.id)).status).toBe('active');
    });

    it('AC11: a pending invitation keeps its password and records invitation_pending', async () => {
      const pendingEmail = `pending-${randomUUID().slice(0, 8)}@nap.test`;
      await request(napsoftId, randomUUID(), pendingEmail, true);
      await drain();
      const invited = await loginByEmail(pendingEmail);
      const secondMember = randomUUID();
      await request(otherId, secondMember, pendingEmail, true);
      await drain();
      expect((await loginByEmail(pendingEmail)).password_hash).toBe(
        invited.password_hash
      );
      expect((await membershipOf(invited.id, otherId)).status).toBe('pending');
      const event = await db.one(
        `SELECT details FROM admin.managed_events
          WHERE event_key='portal_access.applied' AND target_id=$1`,
        [secondMember]
      );
      expect(event.details.invitation_pending).toBe(true);
    });

    it('AC12: an off request suspends the membership and revokes only that tenant’s sessions', async () => {
      const here = await createSession(db, sessionPolicy, {
        portalUserId: login.id,
      });
      const there = await createSession(db, sessionPolicy, {
        portalUserId: login.id,
      });
      await db.none('UPDATE admin.sessions SET tenant_id=$2 WHERE id=$1', [
        here.session.id,
        napsoftId,
      ]);
      await db.none('UPDATE admin.sessions SET tenant_id=$2 WHERE id=$1', [
        there.session.id,
        otherId,
      ]);
      await request(napsoftId, memberId, email, false);
      await drain();
      const suspended = await adminRow('portal_user_tenants', membership.id);
      expect(suspended.status).toBe('suspended');
      expect((await copy('tenant_members', membership.id)).status).toBe(
        'suspended'
      );
      expect(
        (await adminRow('sessions', here.session.id)).deactivated_at
      ).not.toBeNull();
      expect(
        (await adminRow('sessions', there.session.id)).deactivated_at
      ).toBeNull();
    });

    it('AC13: disabled, root, conflicting, and mismatched requests fail only their row', async () => {
      const disabledEmail = `disabled-${randomUUID().slice(0, 8)}@nap.test`;
      await request(napsoftId, randomUUID(), disabledEmail, true);
      await drain();
      const disabled = await loginByEmail(disabledEmail);
      await db.none(
        `UPDATE admin.portal_users SET status='disabled' WHERE id=$1`,
        [disabled.id]
      );

      const cases = [
        [otherId, randomUUID(), disabledEmail, 'LOGIN_UNAVAILABLE'],
        [otherId, randomUUID(), rootEmail, 'LOGIN_UNAVAILABLE'],
        [otherId, randomUUID(), email, 'MEMBER_CONFLICT'],
      ];
      for (const [tenantId, id, address] of cases)
        await request(tenantId, id, address, true);
      const mismatched = randomUUID();
      await cell.none(
        `INSERT INTO cell.outbox (tenant_id, topic, entity_id, revision, payload)
         VALUES ($1, 'portal_access', $2, 1, $3)`,
        [
          otherId,
          mismatched,
          {
            tenant_id: napsoftId,
            member_id: mismatched,
            member_type: 'employee',
            email: `x-${randomUUID().slice(0, 8)}@nap.test`,
            enabled: false,
          },
        ]
      );
      const good = randomUUID();
      const goodEmail = `good-${randomUUID().slice(0, 8)}@nap.test`;
      await request(otherId, good, goodEmail, true);
      await drain();

      for (const [, id, , code] of cases)
        expect((await requestRows(id))[0]).toMatchObject({
          status: 'failed',
          failure_code: code,
        });
      expect((await requestRows(mismatched))[0]).toMatchObject({
        status: 'failed',
        failure_code: 'TENANT_MISMATCH',
      });
      expect((await requestRows(good))[0].status).toBe('delivered');
      expect(await loginByEmail(goodEmail)).not.toBeNull();
    });

    it('AC14: an on then off request before delivery applies only the off', async () => {
      const id = randomUUID();
      const address = `flip-${randomUUID().slice(0, 8)}@nap.test`;
      await request(otherId, id, address, true);
      await request(otherId, id, address, false);
      await drain();
      const rows = await requestRows(id);
      expect(rows.map(row => row.status)).toEqual(['delivered', 'delivered']);
      expect(await loginByEmail(address)).toBeNull();
    });
  });

  it('AC02: granting and withdrawing an entitlement reach the cell', async () => {
    const row = await db.module_entitlements.insert({
      tenant_id: napsoftId,
      module: 'business-directory',
      enabled: true,
    });
    await drain();
    expect(await copy('module_entitlements', row.id)).toMatchObject({
      enabled: true,
      revision: 1,
    });
    await db.module_entitlements.update(row.id, { enabled: false });
    await drain();
    expect(await copy('module_entitlements', row.id)).toMatchObject({
      enabled: false,
      revision: 2,
    });
  });

  it('AC03: a failed outbox insert rolls back the admin change', async () => {
    const tenant = await adminRow('tenants', napsoftId);
    await db.none(
      `INSERT INTO admin.outbox (tenant_id, topic, entity_id, revision, payload, status, delivered_at)
       VALUES ($1, 'tenant', $1, $2, '{}', 'delivered', now())`,
      [napsoftId, tenant.revision + 1]
    );
    await expect(
      db.tenants.update(napsoftId, {
        status: tenant.status === 'active' ? 'suspended' : 'active',
      })
    ).rejects.toThrow();
    expect(await adminRow('tenants', napsoftId)).toMatchObject({
      status: tenant.status,
      revision: tenant.revision,
    });
    await db.none(
      `DELETE FROM admin.outbox WHERE topic='tenant' AND entity_id=$1 AND revision=$2`,
      [napsoftId, tenant.revision + 1]
    );
  });

  it('AC03: a failed caller transaction rolls back requestPortalAccess', async () => {
    const id = randomUUID();
    await expect(
      cell.tx(async tx => {
        await requestPortalAccess(
          tx,
          {
            tenantId: napsoftId,
            memberId: id,
            memberType: 'client',
            email: 'rollback@nap.test',
            enabled: false,
          },
          { hashingPolicy: ARGON2_MINIMUM }
        );
        throw new Error('caller failed');
      })
    ).rejects.toThrow('caller failed');
    expect(await requestRows(id)).toHaveLength(0);
  });

  it('AC05: with the cell unavailable, changes commit and retry with growing delays', async () => {
    const row = await db.module_entitlements.insert({
      tenant_id: napsoftId,
      module: 'retry-module',
      enabled: true,
    });
    registry.markDisabled(cellId);
    await sync.tick();
    let [pending] = await outboxRows('entitlement', row.id);
    expect(pending).toMatchObject({
      status: 'pending',
      attempts: 1,
      failure_code: 'CELL_UNAVAILABLE',
    });
    const firstDelay = new Date(pending.next_attempt_at) - Date.now();
    expect(firstDelay).toBeGreaterThan(0);
    await db.none(
      `UPDATE admin.outbox SET next_attempt_at=now() WHERE tenant_id=$1 AND status='pending'`,
      [napsoftId]
    );
    await sync.tick();
    [pending] = await outboxRows('entitlement', row.id);
    expect(pending.attempts).toBe(2);
    expect(new Date(pending.next_attempt_at) - Date.now()).toBeGreaterThan(
      firstDelay
    );

    await registry.recheck(cellId);
    await db.none(
      `UPDATE admin.outbox SET next_attempt_at=now() WHERE tenant_id=$1 AND status='pending'`,
      [napsoftId]
    );
    await sync.tick();
    [pending] = await outboxRows('entitlement', row.id);
    expect(pending).toMatchObject({ status: 'delivered', failure_code: null });
    expect(await copy('module_entitlements', row.id)).toMatchObject({
      enabled: true,
    });
    const events = await db.any(
      `SELECT event_key, details FROM admin.managed_events
        WHERE event_key LIKE 'sync.delivery.%' AND tenant_id=$1`,
      [napsoftId]
    );
    expect(events.map(event => event.event_key)).toEqual(
      expect.arrayContaining([
        'sync.delivery.failed',
        'sync.delivery.recovered',
      ])
    );
  });

  it('AC06: redelivery and an older revision leave the copy at the newer one', async () => {
    const [older, newer] = await outboxRows(
      'entitlement',
      (
        await db.one(
          `SELECT id FROM admin.module_entitlements WHERE module='business-directory'`
        )
      ).id
    );
    await db.none(
      `UPDATE admin.outbox SET status='pending', delivered_at=NULL WHERE id=$1`,
      [newer.id]
    );
    await drain();
    await db.none(
      `UPDATE admin.outbox SET status='pending', delivered_at=NULL WHERE id=$1`,
      [older.id]
    );
    await drain();
    expect(await copy('module_entitlements', older.entity_id)).toMatchObject({
      enabled: false,
      revision: newer.revision,
    });
  });

  it('AC07: a membership before its tenant fails with TENANT_NOT_SYNCED, then succeeds', async () => {
    const code = 'L' + randomUUID().replaceAll('-', '').slice(0, 10);
    const late = await db.tenants.insert({
      tenant_code: code,
      name: `Late ${code}`,
      status: 'active',
    });
    const [tenantRow] = await outboxRows('tenant', late.id);
    await db.none(`UPDATE admin.outbox SET status='failed' WHERE id=$1`, [
      tenantRow.id,
    ]);
    const login = await db.portal_users.insert({
      email: `late-${randomUUID().slice(0, 8)}@nap.test`,
      password_hash: 'not-a-real-digest',
      must_change_password: true,
      status: 'active',
      is_root: false,
    });
    const member = await db.portal_user_tenants.insert({
      portal_user_id: login.id,
      tenant_id: late.id,
      member_type: 'employee',
      member_id: randomUUID(),
      status: 'pending',
      ready: false,
    });
    await db.tenants.update(late.id, { cell_id: cellId });
    await sync.tick();
    const [memberRow] = await outboxRows('membership', member.id);
    expect(memberRow).toMatchObject({
      status: 'pending',
      failure_code: 'TENANT_NOT_SYNCED',
    });

    await db.none(
      `UPDATE admin.outbox SET status='pending', next_attempt_at=now() WHERE tenant_id=$1`,
      [late.id]
    );
    await sync.tick();
    expect((await outboxRows('membership', member.id))[0].status).toBe(
      'delivered'
    );
    expect(await copy('tenant_members', member.id)).not.toBeNull();
  });

  it('AC08: a second worker skips a tenant and direction already being delivered', async () => {
    const row = await db.module_entitlements.insert({
      tenant_id: napsoftId,
      module: 'locked-module',
      enabled: true,
    });
    const key = `sync:admin_to_cell:${napsoftId}`;
    const outcome = await db.task(async holder => {
      await holder.one('SELECT pg_advisory_lock(hashtextextended($1, 0))', [
        key,
      ]);
      try {
        return await deliverTenant({
          admin: db,
          direction: 'admin_to_cell',
          source: db,
          tenantId: napsoftId,
          apply: () => {
            throw new Error('must not apply');
          },
        });
      } finally {
        await holder.one('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [
          key,
        ]);
      }
    });
    expect(outcome).toBe('skipped');
    expect((await outboxRows('entitlement', row.id))[0].status).toBe('pending');
    await drain();
    expect((await outboxRows('entitlement', row.id))[0].status).toBe(
      'delivered'
    );
  });

  it('AC15: no event, snapshot, or outbox row holds a password or endpoint', async () => {
    const text = JSON.stringify([
      await db.any('SELECT details, reason FROM admin.managed_events'),
      await db.any('SELECT payload, failure_code FROM admin.outbox'),
      await cell.any('SELECT payload, failure_code FROM cell.outbox'),
    ]);
    expect(text).not.toContain(PASSWORD);
    expect(text).not.toContain(config.appPassword);
    expect(text).not.toContain(url.host);
    const events = await db.any(
      `SELECT details FROM admin.managed_events
        WHERE event_key LIKE 'portal_access.%' OR event_key LIKE 'sync.%'`
    );
    expect(events.length).toBeGreaterThan(0);
    for (const { details } of events)
      expect(JSON.stringify(details)).not.toMatch(/@|argon2/);
  });
});
