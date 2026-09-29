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
import { bootstrapNapsoft } from '../../src/modules/admin-tenancy/domain/bootstrap.js';
import { ARGON2_MINIMUM } from '../../src/modules/admin-tenancy/domain/password.js';
import { createSession } from '../../src/modules/admin-tenancy/domain/session.js';
import { selectTenant } from '../../src/modules/admin-tenancy/domain/tenantAccess.js';
import { createCellRegistry } from '../../src/infrastructure/runtime/cellRegistry.js';
import { createLocalCellDriver } from '../../src/infrastructure/provisioning/localCells.js';
import { createStages } from '../../src/application/provisioning/stages.js';
import { createProvisioningWorker } from '../../src/application/provisioning/worker.js';
import { accessControlRoutesV1 } from '../../src/modules/access-control/apiRoutes/v1/index.js';
import { businessDirectoryRoutesV1 } from '../../src/modules/business-directory/apiRoutes/v1/index.js';
import { randomBytes } from 'node:crypto';
import { createSyncWorker } from '../../src/application/sync/worker.js';
import { withTenantTransaction } from '../../src/infrastructure/runtime/tenantTransaction.js';

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
  secret: 'integration-business-directory-secret-of-ample-length',
  idleMinutes: 30,
  absoluteHours: 12,
};
const ORIGIN = 'http://localhost:5173';
const BASE = '/api/business-directory/v1';
const ACL = '/api/access-control/v1';
const taxIdPolicy = {
  encryptionKey: randomBytes(32),
  hashKey: 'integration-tax-id-hash-key-of-ample-length',
};
const created = new Set();
let handle, db, dir, registry, cell, app, napsoft, rootId, cookie;
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
 * Send an access-control request as the bootstrap login.
 * @param {string} method
 * @param {string} path Path below `ACL`.
 * @param {object} [body]
 */
function acl(method, path, body) {
  const pending = request(app)
    [method](ACL + path)
    .set('Origin', ORIGIN)
    .set('Cookie', cookie);
  return body === undefined ? pending : pending.send(body);
}

/**
 * Create an active Napsoft employee, admin and cell side, holding `roleCode`
 * (or no role), with a session that has selected Napsoft.
 * @param {string|null} roleCode
 * @returns {Promise<{id: string, cookie: string}>}
 */
async function staff(roleCode) {
  const memberId = randomUUID();
  const user = await db.tx(tx =>
    db.portal_users.insertBootstrapLogin(
      { email: `staff-${randomUUID()}@nap.test`, passwordHash: 'unused' },
      { tx }
    )
  );
  await db.portal_user_tenants.insert({
    portal_user_id: user.id,
    tenant_id: napsoft.id,
    member_type: 'employee',
    member_id: memberId,
    status: 'active',
    ready: true,
  });
  await cell.tenant_members.insert({
    id: randomUUID(),
    tenant_id: napsoft.id,
    portal_user_id: user.id,
    member_type: 'employee',
    member_id: memberId,
    status: 'active',
    revision: 1,
  });
  if (roleCode) {
    const roles = (await acl('get', '/roles')).body.data;
    const role = roles.find(r => r.code === roleCode);
    expect(
      (await acl('put', `/users/${user.id}/roles/${role.id}`)).status
    ).toBe(200);
  }
  const session = await createSession(db, sessionPolicy, {
    portalUserId: user.id,
  });
  const selected = await selectTenant(
    db,
    sessionPolicy,
    session.token,
    { user: user.id },
    { tenant: napsoft.id },
    { runtime: registry }
  );
  return { id: user.id, cookie: `nap_session=${selected.token}` };
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
  const boot = await bootstrapNapsoft(db, {
    tenantCode: `NAP-${unique.toUpperCase()}`,
    tenantName: `Test Napsoft ${unique}`,
    rootEmail: `bootstrap-${unique}@nap.test`,
    rootPassword: 'correct-horse-battery-staple',
    hashingPolicy: ARGON2_MINIMUM,
  });
  rootId = boot.login.id;

  dir = await mkdtemp(join(tmpdir(), 'nap-bd-routes-'));
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
  await sync.tick();

  app = createApp({
    api: {
      admin: handle,
      environment: 'test',
      sessionPolicy,
      cookiePolicy: { secure: false, sameSite: 'lax' },
      applicationOrigin: ORIGIN,
      runtime: registry,
      taxIdPolicy,
      registrations: [...accessControlRoutesV1, ...businessDirectoryRoutesV1],
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

/** A custom role with exactly `grants` in the Napsoft tenant; returns its code. */
async function role(grants) {
  const code = 'r' + randomUUID().slice(0, 8);
  const response = await acl('post', '/roles', {
    code,
    name: code,
    grants: grants.map(g => `${napsoft.tenant_code}::${g}`),
  });
  expect(response.status).toBe(201);
  return code;
}

/** Create a record and return its view. */
async function create(collection, body, as = cookie) {
  const response = await call('post', `/${collection}`, body, as);
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  return response.body.data;
}

/** Pending `directory_change` outbox rows for the Napsoft tenant. */
function pendingDirectoryChanges() {
  return cell.outbox.findWhere(
    { tenant_id: napsoft.id, topic: 'directory_change', status: 'pending' },
    'AND',
    { columnWhitelist: ['payload'] }
  );
}

describe('people (M0005-R002, R016)', () => {
  it('creates an employee with a primary email and records the change', async () => {
    const before = (await pendingDirectoryChanges()).length;
    const jane = await create('people', {
      kind: 'employee',
      firstName: 'Jane',
      lastName: 'Doe',
      primaryEmail: 'Jane@Example.test',
    });
    expect(jane).toMatchObject({
      kind: 'employee',
      firstName: 'Jane',
      primaryEmail: 'jane@example.test',
      taxIdLast4: null,
      revision: 1,
    });
    const rows = await pendingDirectoryChanges();
    expect(rows.length).toBe(before + 1);
    expect(rows.at(-1).payload).toMatchObject({
      event_key: 'directory.record.created',
      record_id: jane.id,
    });
  });

  it('rejects an employee without a primary email and a bad kind', async () => {
    for (const body of [
      { kind: 'employee', firstName: 'A', lastName: 'B' },
      { kind: 'vendor', firstName: 'A', lastName: 'B' },
    ])
      expect((await call('post', '/people', body)).body.error.code).toBe(
        'INVALID_INPUT'
      );
  });

  it("refuses to remove an employee's only primary email", async () => {
    const jane = await create('people', {
      kind: 'employee',
      firstName: 'Jane',
      lastName: 'Roe',
      primaryEmail: 'roe@example.test',
    });
    const detail = (await call('get', `/people/${jane.id}`)).body.data;
    const [email] = detail.contactMethods;
    const removed = await call(
      'delete',
      `/parties/${jane.id}/contact-methods/${email.id}`
    );
    expect(removed.body.error.code).toBe('INVALID_STATE');
    const added = await call('post', `/parties/${jane.id}/contact-methods`, {
      type: 'email',
      value: 'second@example.test',
      isPrimary: true,
    });
    expect(added.status).toBe(201);
    const after = (await call('get', `/people/${jane.id}`)).body.data;
    expect(after.primaryEmail).toBe('second@example.test');
    expect(
      after.contactMethods.filter(m => m.isPrimary && m.type === 'email')
    ).toHaveLength(1);
  });

  it('edits with optimistic concurrency, archives, and restores', async () => {
    const bob = await create('people', {
      kind: 'contact',
      firstName: 'Bob',
      lastName: 'Lee',
    });
    const edited = await call('patch', `/people/${bob.id}`, {
      lastName: 'Li',
      revision: 1,
    });
    expect(edited.body.data).toMatchObject({ lastName: 'Li', revision: 2 });
    expect(
      (await call('patch', `/people/${bob.id}`, { lastName: 'X', revision: 1 }))
        .body.error.code
    ).toBe('STALE_REVISION');
    const archived = await call('post', `/people/${bob.id}/archive`, {
      revision: 2,
    });
    expect(archived.body.data.archived).toBe(true);
    const list = (await call('get', '/people?q=Li')).body.data;
    expect(list.some(p => p.id === bob.id)).toBe(false);
    const restored = await call('post', `/people/${bob.id}/restore`, {
      revision: 3,
    });
    expect(restored.body.data.archived).toBe(false);
  });
});

describe('tax IDs (M0005-R006–R013)', () => {
  it('AC03: rejects a vendor without a tax ID, a client with neither or both tax sources, and a vendor contact with a tax ID', async () => {
    const bad = [
      ['organizations', { kind: 'vendor', legalName: 'No EIN LLC' }],
      ['organizations', { kind: 'client', legalName: 'Lot 1' }],
      [
        'organizations',
        {
          kind: 'client',
          legalName: 'Lot 2',
          taxId: '12-3456789',
          contacts: [
            {
              fullName: 'Ann',
              taxId: '111-22-3333',
              isPrimaryTaxContact: true,
            },
          ],
        },
      ],
    ];
    for (const [collection, body] of bad)
      expect((await call('post', `/${collection}`, body)).body.error.code).toBe(
        'INVALID_INPUT'
      );
    const vendor = await create('organizations', {
      kind: 'vendor',
      legalName: 'ABC Plumbing LLC',
      taxId: '12-3456789',
    });
    expect(vendor.taxIdLast4).toBe('6789');
    const contact = await call('post', '/organization-contacts', {
      organizationId: vendor.id,
      fullName: 'Sam Ruiz',
      taxId: '111-22-3333',
    });
    expect(contact.body.error.code).toBe('INVALID_INPUT');
  });

  it('AC04: a home buyer client takes its primary tax ID from one flagged buyer who cannot be archived', async () => {
    const client = await create('organizations', {
      kind: 'client',
      legalName: 'Lot 12, Maple Ridge',
      contacts: [
        {
          fullName: 'Ann Smith',
          taxId: '222-33-4444',
          isPrimaryTaxContact: true,
        },
        { fullName: 'Tom Smith', taxId: '555-66-7777' },
      ],
    });
    const detail = (await call('get', `/organizations/${client.id}`)).body.data;
    const ann = detail.contacts.find(c => c.fullName === 'Ann Smith');
    const tom = detail.contacts.find(c => c.fullName === 'Tom Smith');
    expect(ann).toMatchObject({
      isPrimaryTaxContact: true,
      kind: 'client_contact',
    });
    expect(
      (
        await call('post', `/organization-contacts/${ann.id}/archive`, {
          revision: ann.revision,
        })
      ).body.error.code
    ).toBe('PRIMARY_TAX_CONTACT');
    const moved = await call('patch', `/organizations/${client.id}`, {
      primaryTaxContactId: tom.id,
      revision: detail.revision,
    });
    expect(moved.status).toBe(200);
    const after = (await call('get', `/organizations/${client.id}`)).body.data;
    expect(after.contacts.find(c => c.id === tom.id).isPrimaryTaxContact).toBe(
      true
    );
    expect(after.contacts.find(c => c.id === ann.id).isPrimaryTaxContact).toBe(
      false
    );
    const other = await create('organizations', {
      kind: 'client',
      legalName: 'Lot 13',
      taxId: '98-7654321',
    });
    expect(
      (
        await call('patch', `/organizations/${other.id}`, {
          primaryTaxContactId: tom.id,
          revision: other.revision,
        })
      ).body.error.code
    ).toBe('INVALID_INPUT');
  });

  it('AC11: masks tax IDs without tax-ids::read and needs tax-ids::write to save one', async () => {
    const limited = await staff(
      await role([
        'business-directory::directory::read',
        'business-directory::directory::write',
      ])
    );
    const person = await create('people', {
      kind: 'contact',
      firstName: 'Tax',
      lastName: 'Payer',
      taxId: '123-45-6789',
    });
    const seen = await call(
      'get',
      `/people/${person.id}`,
      undefined,
      limited.cookie
    );
    expect(seen.body.data.taxIdLast4).toBe('6789');
    expect(JSON.stringify(seen.body)).not.toContain('123456789');
    const reveal = await call(
      'get',
      `/people/${person.id}/tax-id`,
      undefined,
      limited.cookie
    );
    expect(reveal.status).toBe(403);
    expect(
      (await call('get', '/people?taxId=123456789', undefined, limited.cookie))
        .body.error.code
    ).toBe('FORBIDDEN');
    expect(
      (
        await call(
          'post',
          '/people',
          {
            kind: 'contact',
            firstName: 'No',
            lastName: 'Write',
            taxId: '987-65-4321',
          },
          limited.cookie
        )
      ).body.error.code
    ).toBe('FORBIDDEN');
    expect(
      (
        await call(
          'patch',
          `/people/${person.id}`,
          { taxId: null, revision: person.revision },
          limited.cookie
        )
      ).body.error.code
    ).toBe('FORBIDDEN');

    const before = (await pendingDirectoryChanges()).length;
    const full = await call('get', `/people/${person.id}/tax-id`);
    expect(full.body.data).toEqual({ taxId: '123456789' });
    const rows = await pendingDirectoryChanges();
    expect(rows.length).toBe(before + 1);
    expect(rows.at(-1).payload).toMatchObject({
      event_key: 'directory.tax_id.revealed',
      record_id: person.id,
    });
    for (const row of rows)
      expect(JSON.stringify(row.payload)).not.toContain('123456789');
  });

  it('AC12: finds a tax ID entered with or without dashes and reports duplicates', async () => {
    const first = await create('people', {
      kind: 'contact',
      firstName: 'Dup',
      lastName: 'One',
      taxId: '321-54-9876',
    });
    const second = await create('people', {
      kind: 'contact',
      firstName: 'Dup',
      lastName: 'Two',
      taxId: '321549876',
    });
    expect(second.duplicateTaxIds).toEqual([first.id]);
    for (const query of ['321-54-9876', '321549876']) {
      const found = (await call('get', `/people?taxId=${query}`)).body.data;
      expect(found.map(p => p.id).sort()).toEqual([first.id, second.id].sort());
    }
  });
});

describe('addresses and labels (M0005-R015, R017)', () => {
  it('keeps one primary address, rejects an unknown country, and checks label groups', async () => {
    const person = await create('people', {
      kind: 'contact',
      firstName: 'Addr',
      lastName: 'Ess',
    });
    const label = await call('post', '/labels', {
      appliesTo: 'address',
      name: 'Site ' + randomUUID().slice(0, 6),
    });
    expect(label.status).toBe(201);
    expect(
      (
        await call('post', '/labels', {
          appliesTo: 'address',
          name: label.body.data.name,
        })
      ).body.error.code
    ).toBe('CONFLICT');
    const phoneLabel = (
      await call('post', '/labels', {
        appliesTo: 'phone',
        name: 'Cell ' + randomUUID().slice(0, 6),
      })
    ).body.data;
    const base = { line1: '1 Oak St', city: 'Austin', country: 'us' };
    const first = await call('post', `/parties/${person.id}/addresses`, {
      ...base,
      isPrimary: true,
      labelId: label.body.data.id,
    });
    expect(first.body.data).toMatchObject({ country: 'US', isPrimary: true });
    const second = await call('post', `/parties/${person.id}/addresses`, {
      ...base,
      line1: '2 Oak St',
      isPrimary: true,
    });
    expect(second.status).toBe(201);
    const detail = (await call('get', `/people/${person.id}`)).body.data;
    expect(detail.addresses.filter(a => a.isPrimary).map(a => a.line1)).toEqual(
      ['2 Oak St']
    );
    expect(
      (
        await call('post', `/parties/${person.id}/addresses`, {
          ...base,
          country: 'ZZ',
        })
      ).body.error.code
    ).toBe('INVALID_INPUT');
    expect(
      (
        await call('post', `/parties/${person.id}/addresses`, {
          ...base,
          labelId: phoneLabel.id,
        })
      ).body.error.code
    ).toBe('INVALID_INPUT');
  });
});

describe('tenant contacts (M0005-R018, R019)', () => {
  it('AC06: allows several primary and billing contacts, only employees, and never zero primaries', async () => {
    const employee = async name =>
      create('people', {
        kind: 'employee',
        firstName: name,
        lastName: 'Staff',
        primaryEmail: `${name.toLowerCase()}-${randomUUID().slice(0, 6)}@example.test`,
      });
    const jane = await employee('Jane');
    const owner = await employee('Owner');
    const jim = await employee('Jim');
    const contact = await create('people', {
      kind: 'contact',
      firstName: 'Not',
      lastName: 'Employee',
    });
    expect(
      (await call('put', `/tenant-contacts/${jane.id}/primary`)).status
    ).toBe(200);
    expect(
      (await call('put', `/tenant-contacts/${jane.id}/primary`)).status
    ).toBe(200);
    expect(
      (await call('put', `/tenant-contacts/${owner.id}/primary`)).status
    ).toBe(200);
    expect(
      (await call('put', `/tenant-contacts/${jim.id}/billing`)).status
    ).toBe(200);
    expect(
      (await call('put', `/tenant-contacts/${contact.id}/primary`)).body.error
        .code
    ).toBe('NOT_EMPLOYEE');
    const list = (await call('get', '/tenant-contacts')).body.data;
    expect(list.filter(c => c.designation === 'primary')).toHaveLength(2);
    expect(
      (await call('delete', `/tenant-contacts/${owner.id}/primary`)).status
    ).toBe(200);
    expect(
      (await call('delete', `/tenant-contacts/${jane.id}/primary`)).body.error
        .code
    ).toBe('LAST_PRIMARY_CONTACT');
    expect(
      (
        await call('post', `/people/${jane.id}/archive`, {
          revision: jane.revision,
        })
      ).body.error.code
    ).toBe('LAST_PRIMARY_CONTACT');
    const archivedJim = await call('post', `/people/${jim.id}/archive`, {
      revision: jim.revision,
    });
    expect(archivedJim.status).toBe(200);
    expect(
      (await call('get', '/tenant-contacts')).body.data.some(
        c => c.partyId === jim.id
      )
    ).toBe(false);
  });
});

describe('event delivery (M0005-R025)', () => {
  it('AC09: delivers directory changes to admin as events with the tax ID masked', async () => {
    const person = await create('people', {
      kind: 'contact',
      firstName: 'Event',
      lastName: 'Trail',
      taxId: '468-13-5790',
    });
    await call('patch', `/people/${person.id}`, {
      lastName: 'Trails',
      revision: person.revision,
    });
    await call('get', `/people/${person.id}/tax-id`);
    await sync.tick();
    expect(await pendingDirectoryChanges()).toEqual([]);
    const events = await db.managed_events.findWhere(
      { target_id: person.id },
      'AND',
      {
        columnWhitelist: [
          'event_key',
          'target_type',
          'actor_id',
          'tenant_id',
          'details',
        ],
      }
    );
    expect(events.map(e => e.event_key).sort()).toEqual([
      'directory.record.created',
      'directory.record.updated',
      'directory.tax_id.revealed',
    ]);
    for (const event of events) {
      expect(event).toMatchObject({
        target_type: 'directory_record',
        actor_id: rootId,
        tenant_id: napsoft.id,
      });
      expect(JSON.stringify(event.details)).not.toContain('468135790');
    }
    const updated = events.find(
      e => e.event_key === 'directory.record.updated'
    );
    expect(JSON.parse(updated.details.after)).toMatchObject({
      lastName: 'Trails',
      taxIdLast4: '5790',
    });
  });

  it('fails an uncatalogued directory event alone and delivers the rest', async () => {
    await withTenantTransaction(cell, napsoft.id, tx =>
      cell.outbox.insert(
        {
          tenant_id: napsoft.id,
          topic: 'directory_change',
          entity_id: randomUUID(),
          revision: 1,
          payload: {
            tenant_id: napsoft.id,
            event_key: 'directory.record.exploded',
            record_id: randomUUID(),
            actor_id: rootId,
            session_id: null,
            request_id: null,
            details: {},
          },
        },
        { tx }
      )
    );
    const label = await call('post', '/labels', {
      appliesTo: 'email',
      name: 'Sync ' + randomUUID().slice(0, 6),
    });
    await sync.tick();
    const failed = await cell.outbox.findWhere(
      { tenant_id: napsoft.id, topic: 'directory_change', status: 'failed' },
      'AND',
      { columnWhitelist: ['payload'] }
    );
    expect(failed.map(row => row.payload.event_key)).toContain(
      'directory.record.exploded'
    );
    const [event] = await db.managed_events.findWhere(
      { target_id: label.body.data.id },
      'AND',
      { columnWhitelist: ['event_key', 'target_type'] }
    );
    expect(event).toEqual({
      event_key: 'directory.label.created',
      target_type: 'contact_label',
    });
  });
});
