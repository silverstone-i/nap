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
import { adminTenancyRoutesV1 } from '../../src/modules/admin-tenancy/apiRoutes/v1/index.js';
import { randomBytes } from 'node:crypto';
import { organizationDetailSchema, personDetailSchema } from '@nap/shared';
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
  const membership = await db.portal_user_tenants.insert({
    portal_user_id: user.id,
    tenant_id: napsoft.id,
    member_type: 'employee',
    member_id: memberId,
    status: 'active',
    ready: true,
  });
  // Same ID and revision as the admin row, so the sync worker's delivery of
  // that row is a no-op rather than a conflicting second copy.
  await cell.tenant_members.insert({
    id: membership.id,
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
      authenticationPolicy: {
        throttleSecret: 'integration-throttle-secret-of-ample-length',
        ...ARGON2_MINIMUM,
      },
      registrations: [
        ...adminTenancyRoutesV1,
        ...accessControlRoutesV1,
        ...businessDirectoryRoutesV1,
      ],
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
    const list = (await call('get', '/people?q=Li')).body.data.rows;
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
              firstName: 'Ann',
              lastName: 'Lee',
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
      firstName: 'Sam',
      lastName: 'Ruiz',
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
          firstName: 'Ann',
          lastName: 'Smith',
          taxId: '222-33-4444',
          isPrimaryTaxContact: true,
        },
        { firstName: 'Tom', lastName: 'Smith', taxId: '555-66-7777' },
      ],
    });
    const detail = (await call('get', `/organizations/${client.id}`)).body.data;
    const ann = detail.contacts.find(c => c.firstName === 'Ann');
    const tom = detail.contacts.find(c => c.firstName === 'Tom');
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

  it('names an organization contact as its primary and billing contact, and keeps each collection to its own kinds', async () => {
    const vendor = await create('organizations', {
      kind: 'vendor',
      legalName: 'Flag Supply LLC',
      taxId: '45-6789012',
    });
    const contact = await create('organization-contacts', {
      organizationId: vendor.id,
      firstName: 'Rita',
      lastName: 'Moss',
      isPrimaryContact: true,
    });
    expect(contact).toMatchObject({
      kind: 'vendor_contact',
      firstName: 'Rita',
      lastName: 'Moss',
      isPrimaryContact: true,
      isBillingContact: false,
    });
    const billed = await call('patch', `/organization-contacts/${contact.id}`, {
      isBillingContact: true,
      revision: contact.revision,
    });
    expect(billed.body.data).toMatchObject({
      isPrimaryContact: true,
      isBillingContact: true,
    });
    const emailLabel = (
      await call('post', '/labels', {
        appliesTo: 'email',
        name: 'Office ' + randomUUID().slice(0, 6),
      })
    ).body.data;
    await call('post', `/parties/${contact.id}/contact-methods`, {
      type: 'email',
      value: 'rita@flag.example',
      labelId: emailLabel.id,
      isPrimary: true,
    });
    const listed = (await call('get', `/organizations/${vendor.id}`)).body.data
      .contacts;
    expect(listed).toEqual([
      expect.objectContaining({
        primaryEmail: 'rita@flag.example',
        primaryEmailLabel: emailLabel.name,
        primaryPhoneLabel: null,
      }),
    ]);
    expect(
      organizationDetailSchema.safeParse(
        (await call('get', `/organizations/${vendor.id}`)).body.data
      ).success
    ).toBe(true);
    expect((await call('get', `/people/${contact.id}`)).status).toBe(404);
    expect(
      (await call('get', '/people?limit=100')).body.data.rows.some(
        p => p.id === contact.id
      )
    ).toBe(false);
    const person = await create('people', {
      kind: 'contact',
      firstName: 'Not',
      lastName: 'Aorg',
    });
    expect(
      (await call('get', `/organization-contacts/${person.id}`)).status
    ).toBe(404);
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
    const client = await create('organizations', {
      kind: 'client',
      legalName: 'Lot 30',
      contacts: [
        {
          firstName: 'Dup',
          lastName: 'Buyer',
          taxId: '321-54-9876',
          isPrimaryTaxContact: true,
        },
      ],
    });
    const buyer = (await call('get', `/organizations/${client.id}`)).body.data
      .contacts[0];
    const third = await call('patch', `/organization-contacts/${buyer.id}`, {
      taxId: '321549876',
      revision: buyer.revision,
    });
    // R013: a duplicate is reported across people, buyers, and organizations.
    expect(third.body.data.duplicateTaxIds.sort()).toEqual(
      [first.id, second.id].sort()
    );
    for (const query of ['321-54-9876', '321549876']) {
      const found = (await call('get', `/people?taxId=${query}`)).body.data
        .rows;
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
    const phone = await call('post', `/parties/${person.id}/contact-methods`, {
      type: 'phone',
      value: '512-555-0100',
      labelId: phoneLabel.id,
    });
    expect(phone.status).toBe(201);
    const detail = (await call('get', `/people/${person.id}`)).body.data;
    expect(detail.addresses.filter(a => a.isPrimary).map(a => a.line1)).toEqual(
      ['2 Oak St']
    );
    expect(detail.addresses.map(a => [a.line1, a.labelName])).toEqual([
      ['1 Oak St', label.body.data.name],
      ['2 Oak St', null],
    ]);
    expect(detail.contactMethods.map(m => m.labelName)).toEqual([
      phoneLabel.name,
    ]);
    // The web app parses this response with the shared schema.
    expect(personDetailSchema.safeParse(detail).success).toBe(true);
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

describe('organization contact flags (M0005-R004)', () => {
  it('archives an employee with no tenant contact step and serves no tenant-contacts route', async () => {
    const employee = await create('people', {
      kind: 'employee',
      firstName: 'Solo',
      lastName: 'Staff',
      primaryEmail: `solo-${randomUUID().slice(0, 6)}@example.test`,
    });
    const archived = await call('post', `/people/${employee.id}/archive`, {
      revision: employee.revision,
    });
    expect(archived.status).toBe(200);
    expect((await call('get', '/tenant-contacts')).status).toBe(404);
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

describe('portal access (I0008)', () => {
  const ADMIN = '/api/admin-tenancy/v1';
  const TEMP = 'temporary-pass';
  // I0010-R005: turning access on now names at least one role.
  let roleIds;
  beforeAll(async () => {
    const roles = (await acl('get', '/roles')).body.data;
    roleIds = [roles.find(role => role.code === 'support').id];
  });

  /** Deliver both directions until nothing moves: request, then its copy. */
  async function drain() {
    await sync.tick();
    await sync.tick();
  }

  /** A person's current portal-access status. */
  async function statusOf(collection, id) {
    return (await call('get', `/${collection}/${id}`)).body.data.portalAccess;
  }

  /** An employee with a fresh email; `body` overrides the create body. */
  function employee(body = {}) {
    return create('people', {
      kind: 'employee',
      firstName: 'Portal',
      lastName: 'User',
      primaryEmail: `portal-${randomUUID().slice(0, 8)}@example.test`,
      ...body,
    });
  }

  /** Pending `portal_access` rows for one person. */
  function requests(id) {
    return cell.outbox.findWhere(
      { tenant_id: napsoft.id, topic: 'portal_access', entity_id: id },
      'AND',
      { columnWhitelist: ['status', 'payload'] }
    );
  }

  /** Mark `person` as the directory record of `loginId`, access on. */
  async function link(person, loginId) {
    await withTenantTransaction(cell, napsoft.id, async tx => {
      await tx.none(
        'UPDATE app.people SET is_portal_user=true WHERE party_id=$1',
        [person.id]
      );
      await tx.none(
        `UPDATE cell.tenant_members SET member_id=$1
          WHERE tenant_id=$2 AND portal_user_id=$3`,
        [person.id, napsoft.id, loginId]
      );
    });
    return (await call('get', `/people/${person.id}`)).body.data;
  }

  it('AC01: turns access on; the person signs in, changes the password, and can select the tenant', async () => {
    const person = await employee({
      isPortalUser: true,
      temporaryPassword: TEMP,
      roleIds,
    });
    expect(person.portalAccess).toEqual({
      status: 'requested',
      failureCode: null,
    });
    const [row] = await requests(person.id);
    expect(JSON.stringify(row.payload)).not.toContain(TEMP);
    await drain();
    expect(await statusOf('people', person.id)).toEqual({
      status: 'invited',
      failureCode: null,
    });

    const login = await request(app)
      .post(`${ADMIN}/auth/login`)
      .set('Origin', ORIGIN)
      .send({ email: person.primaryEmail, password: TEMP });
    expect(login.status).toBe(200);
    const restricted = login.headers['set-cookie'][0].split(';')[0];
    const changed = await request(app)
      .post(`${ADMIN}/auth/password`)
      .set('Origin', ORIGIN)
      .set('Cookie', restricted)
      .send({ currentPassword: TEMP, newPassword: 'a-new-long-password' });
    expect(changed.status).toBe(200);
    const session = changed.headers['set-cookie'][0].split(';')[0];
    const tenants = await request(app)
      .get(`${ADMIN}/access/tenants`)
      .set('Cookie', session);
    expect(tenants.status).toBe(200);
    expect(JSON.stringify(tenants.body.data)).toContain(napsoft.id);
    await drain();
    expect((await statusOf('people', person.id)).status).toBe('on');
  }, 30_000);

  it('AC02: refuses access on without a primary email or temporary password, and on contact create', async () => {
    const before = await cell.outbox.findWhere(
      { tenant_id: napsoft.id, topic: 'portal_access' },
      'AND',
      { columnWhitelist: ['id'] }
    );
    const contact = await create('people', {
      kind: 'contact',
      firstName: 'No',
      lastName: 'Email',
    });
    const noEmail = await call('patch', `/people/${contact.id}`, {
      isPortalUser: true,
      temporaryPassword: TEMP,
      roleIds,
      revision: contact.revision,
    });
    expect(noEmail.body.error.code).toBe('INVALID_INPUT');
    const noPassword = await call('post', '/people', {
      kind: 'employee',
      firstName: 'No',
      lastName: 'Password',
      primaryEmail: `nopass-${randomUUID().slice(0, 6)}@example.test`,
      isPortalUser: true,
      roleIds,
    });
    expect(noPassword.body.error.code).toBe('INVALID_INPUT');
    const vendor = await create('organizations', {
      kind: 'vendor',
      legalName: 'Portal Vendor',
      taxId: '12-3456789',
    });
    const vendorContact = await call('post', '/organization-contacts', {
      organizationId: vendor.id,
      firstName: 'Vendor',
      lastName: 'Rep',
      isPortalUser: true,
    });
    expect(vendorContact.body.error.code).toBe('INVALID_INPUT');
    const after = await cell.outbox.findWhere(
      { tenant_id: napsoft.id, topic: 'portal_access' },
      'AND',
      { columnWhitelist: ['id'] }
    );
    expect(after.length).toBe(before.length);
  });

  it('AC03: turning off or archiving suspends the membership; restore leaves the flag off', async () => {
    const person = await employee({
      isPortalUser: true,
      temporaryPassword: TEMP,
      roleIds,
    });
    await drain();
    const off = await call('patch', `/people/${person.id}`, {
      isPortalUser: false,
      revision: person.revision,
    });
    expect(off.body.data.portalAccess.status).toBe('requested');
    await drain();
    expect((await statusOf('people', person.id)).status).toBe('off');
    const login = await db.portal_users.findOneBy(
      { email: person.primaryEmail },
      { columnWhitelist: ['id'] }
    );
    const membership = await db.portal_user_tenants.findOneBy(
      { portal_user_id: login.id, tenant_id: napsoft.id },
      { columnWhitelist: ['status'] }
    );
    expect(membership.status).toBe('suspended');

    const other = await employee({
      isPortalUser: true,
      temporaryPassword: TEMP,
      roleIds,
    });
    await drain();
    const archived = await call('post', `/people/${other.id}/archive`, {
      revision: other.revision,
    });
    expect(archived.body.data).toMatchObject({
      archived: true,
      isPortalUser: false,
    });
    await drain();
    const restored = await call('post', `/people/${other.id}/restore`, {
      revision: archived.body.data.revision,
    });
    expect(restored.body.data.isPortalUser).toBe(false);
    expect(restored.body.data.portalAccess.status).toBe('off');
  }, 30_000);

  it('AC04: refuses turning off or archiving a tenant_admin, or oneself', async () => {
    const admin = await staff('tenant_admin');
    const adminPerson = await link(await employee(), admin.id);
    const off = await call('patch', `/people/${adminPerson.id}`, {
      isPortalUser: false,
      revision: adminPerson.revision,
    });
    expect(off.body.error.code).toBe('ADMIN_ASSIGNED');
    const archived = await call('post', `/people/${adminPerson.id}/archive`, {
      revision: adminPerson.revision,
    });
    expect(archived.body.error.code).toBe('ADMIN_ASSIGNED');

    const writer = await staff(await role(['business-directory::*::*']));
    const self = await link(await employee(), writer.id);
    const own = await call(
      'patch',
      `/people/${self.id}`,
      { isPortalUser: false, revision: self.revision },
      writer.cookie
    );
    expect(own.body.error.code).toBe('INVALID_STATE');
  });

  it('AC05, AC07: a disabled login fails the request; retry works only on a failed status', async () => {
    const email = `disabled-${randomUUID().slice(0, 6)}@example.test`;
    const login = await db.tx(tx =>
      db.portal_users.insertBootstrapLogin(
        { email, passwordHash: 'unused' },
        { tx }
      )
    );
    await db.portal_users.update(login.id, { status: 'disabled' });
    const person = await employee({
      primaryEmail: email,
      isPortalUser: true,
      temporaryPassword: TEMP,
      roleIds,
    });
    expect(
      (
        await call('post', `/people/${person.id}/portal-access/retry`, {
          temporaryPassword: TEMP,
        })
      ).body.error.code
    ).toBe('INVALID_STATE');
    await drain();
    expect(await statusOf('people', person.id)).toEqual({
      status: 'failed',
      failureCode: 'LOGIN_UNAVAILABLE',
    });
    await db.portal_users.update(login.id, { status: 'active' });
    const missing = await call(
      'post',
      `/people/${person.id}/portal-access/retry`,
      {}
    );
    expect(missing.body.error.code).toBe('INVALID_INPUT');
    const retried = await call(
      'post',
      `/people/${person.id}/portal-access/retry`,
      {
        temporaryPassword: TEMP,
      }
    );
    expect(retried.body.data.portalAccess.status).toBe('requested');
    await drain();
    expect((await statusOf('people', person.id)).status).toBe('invited');
  }, 30_000);

  it('AC11: locks the primary email while access is on', async () => {
    const person = await employee({
      isPortalUser: true,
      temporaryPassword: TEMP,
      roleIds,
    });
    const detail = (await call('get', `/people/${person.id}`)).body.data;
    const [primary] = detail.contactMethods;
    const blocked = [
      await call('post', `/parties/${person.id}/contact-methods`, {
        type: 'email',
        value: 'replacement@example.test',
        isPrimary: true,
      }),
      await call(
        'patch',
        `/parties/${person.id}/contact-methods/${primary.id}`,
        {
          value: 'edited@example.test',
          revision: primary.revision,
        }
      ),
    ];
    for (const response of blocked)
      expect(response.body.error.code).toBe('INVALID_STATE');
    const secondary = await call(
      'post',
      `/parties/${person.id}/contact-methods`,
      {
        type: 'email',
        value: 'secondary@example.test',
      }
    );
    expect(secondary.status).toBe(201);
    const promote = await call(
      'patch',
      `/parties/${person.id}/contact-methods/${secondary.body.data.id}`,
      { isPrimary: true, revision: secondary.body.data.revision }
    );
    expect(promote.body.error.code).toBe('INVALID_STATE');

    await call('patch', `/people/${person.id}`, {
      isPortalUser: false,
      revision: person.revision,
    });
    const edited = await call(
      'patch',
      `/parties/${person.id}/contact-methods/${primary.id}`,
      { value: 'edited@example.test', revision: primary.revision }
    );
    expect(edited.status).toBe(200);
  });
});

describe('tenant-managed portal access and roles (I0010)', () => {
  const ADMIN = '/api/admin-tenancy/v1';
  const TEMP = 'temporary-pass';
  let support, platformAdmin, tenantAdmin;

  beforeAll(async () => {
    const roles = (await acl('get', '/roles')).body.data;
    support = roles.find(role => role.code === 'support').id;
    platformAdmin = roles.find(role => role.code === 'platform_admin').id;
    tenantAdmin = roles.find(role => role.code === 'tenant_admin').id;
  });

  async function drain() {
    await sync.tick();
    await sync.tick();
  }

  function employee(body = {}) {
    return create('people', {
      kind: 'employee',
      firstName: 'Role',
      lastName: 'Holder',
      primaryEmail: `roles-${randomUUID().slice(0, 8)}@example.test`,
      ...body,
    });
  }

  function detail(id) {
    return call('get', `/people/${id}`).then(response => response.body.data);
  }

  /** The person signs in with the temporary password and replaces it. */
  async function activate(person, password = TEMP) {
    await drain();
    const login = await request(app)
      .post(`${ADMIN}/auth/login`)
      .set('Origin', ORIGIN)
      .send({ email: person.primaryEmail, password });
    expect(login.status).toBe(200);
    const changed = await request(app)
      .post(`${ADMIN}/auth/password`)
      .set('Origin', ORIGIN)
      .set('Cookie', login.headers['set-cookie'][0].split(';')[0])
      .send({ currentPassword: password, newPassword: 'a-new-long-password' });
    expect(changed.status).toBe(200);
    await drain();
    const user = await db.portal_users.findOneBy(
      { email: person.primaryEmail },
      { columnWhitelist: ['id'] }
    );
    return user.id;
  }

  /** The login's assigned role IDs, sorted. */
  async function assigned(loginId) {
    const roles = (await acl('get', `/users/${loginId}/roles`)).body.data.roles;
    return roles.map(role => role.id).sort();
  }

  function heldRows(partyId) {
    return withTenantTransaction(cell, napsoft.id, tx =>
      tx.any(
        'SELECT role_id, created_by FROM app.held_roles WHERE party_id=$1 AND deactivated_at IS NULL',
        [partyId]
      )
    );
  }

  function roleEvents(partyOrLogin) {
    return withTenantTransaction(cell, napsoft.id, tx =>
      tx.any(
        `SELECT payload->>'event_key' AS key, payload->>'actor_id' AS actor
           FROM cell.outbox
          WHERE topic='role_change'
            AND (payload->'details'->>'party_id'=$1
                 OR payload->'details'->>'portal_user_id'=$1)
          ORDER BY created_at, id`,
        [partyOrLogin]
      )
    );
  }

  it('AC01: holds the chosen roles until the first sign-in, then assigns them', async () => {
    const person = await employee({
      isPortalUser: true,
      temporaryPassword: TEMP,
      roleIds: [support, tenantAdmin],
    });
    const before = await detail(person.id);
    expect(personDetailSchema.safeParse(before).success).toBe(true);
    expect(before.roles.map(role => [role.code, role.held])).toEqual([
      ['support', true],
      ['tenant_admin', true],
    ]);
    expect((await heldRows(person.id)).map(row => row.created_by)).toEqual([
      rootId,
      rootId,
    ]);
    expect((await roleEvents(person.id)).map(event => event.key)).toEqual([
      'role.held',
      'role.held',
    ]);

    const loginId = await activate(person);
    expect(await assigned(loginId)).toEqual([support, tenantAdmin].sort());
    expect(await heldRows(person.id)).toEqual([]);
    expect(
      (await detail(person.id)).roles.map(role => [role.code, role.held])
    ).toEqual([
      ['support', false],
      ['tenant_admin', false],
    ]);
    expect(await roleEvents(loginId)).toEqual([
      { key: 'role.granted', actor: rootId },
      { key: 'role.granted', actor: rootId },
    ]);
  }, 30_000);

  it('AC02: refuses access on without a role and sends no request', async () => {
    const response = await call('post', '/people', {
      kind: 'employee',
      firstName: 'No',
      lastName: 'Role',
      primaryEmail: `norole-${randomUUID().slice(0, 6)}@example.test`,
      isPortalUser: true,
      temporaryPassword: TEMP,
    });
    expect(response.body.error.code).toBe('INVALID_INPUT');
    const empty = await call('post', '/people', {
      kind: 'employee',
      firstName: 'Empty',
      lastName: 'Roles',
      primaryEmail: `empty-${randomUUID().slice(0, 6)}@example.test`,
      isPortalUser: true,
      temporaryPassword: TEMP,
      roleIds: [],
    });
    expect(empty.body.error.code).toBe('INVALID_INPUT');
  });

  it("AC04: edits an active member's assignments and refuses an empty role set", async () => {
    const person = await employee({
      isPortalUser: true,
      temporaryPassword: TEMP,
      roleIds: [tenantAdmin],
    });
    const loginId = await activate(person);
    let current = await detail(person.id);
    const added = await call('patch', `/people/${person.id}`, {
      roleIds: [tenantAdmin, support],
      revision: current.revision,
    });
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    expect(await assigned(loginId)).toEqual([support, tenantAdmin].sort());
    current = await detail(person.id);
    const none = await call('patch', `/people/${person.id}`, {
      roleIds: [],
      revision: current.revision,
    });
    expect(none.body.error.code).toBe('INVALID_INPUT');
    // Other tenant_admin holders exist here, so the removal is allowed; the
    // last-holder refusal is covered by the member-roles unit test.
    const removed = await call('patch', `/people/${person.id}`, {
      roleIds: [support],
      revision: current.revision,
    });
    expect(removed.status, JSON.stringify(removed.body)).toBe(200);
    expect(await assigned(loginId)).toEqual([support]);
  }, 30_000);

  it("AC05: replaces a not-yet-active person's held roles without assigning any", async () => {
    const person = await employee({
      isPortalUser: true,
      temporaryPassword: TEMP,
      roleIds: [support],
    });
    const changed = await call('patch', `/people/${person.id}`, {
      roleIds: [tenantAdmin],
      revision: person.revision,
    });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect((await heldRows(person.id)).map(row => row.role_id)).toEqual([
      tenantAdmin,
    ]);
    // One transaction, one timestamp: compare the events as a set.
    expect(
      (await roleEvents(person.id)).map(event => event.key).sort()
    ).toEqual(['role.held', 'role.held', 'role.released']);
  });

  it('AC06: keeps roles when access is turned off and applies exactly the new set when turned back on', async () => {
    // A second non-administrator role: turning off an administrator's
    // access is refused (I0008-R005).
    const other = (
      await acl('post', '/roles', {
        code: `other_${randomUUID().slice(0, 6)}`,
        name: 'Other',
        grants: [`${napsoft.tenant_code}::business-directory::directory::read`],
      })
    ).body.data.id;
    const person = await employee({
      isPortalUser: true,
      temporaryPassword: TEMP,
      roleIds: [support],
    });
    const loginId = await activate(person);
    let current = await detail(person.id);
    expect(
      (
        await call('patch', `/people/${person.id}`, {
          isPortalUser: false,
          revision: current.revision,
        })
      ).status
    ).toBe(200);
    await drain();
    expect(await assigned(loginId)).toEqual([support]);
    current = await detail(person.id);
    expect(current.roles.map(role => role.code)).toEqual(['support']);
    const roleWhileOff = await call('patch', `/people/${person.id}`, {
      roleIds: [other],
      revision: current.revision,
    });
    expect(roleWhileOff.body.error.code).toBe('INVALID_INPUT');

    const back = await call('patch', `/people/${person.id}`, {
      isPortalUser: true,
      temporaryPassword: TEMP,
      roleIds: [other],
      revision: current.revision,
    });
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    // I0008: re-enabling resets the temporary password, so the membership
    // activates at the next password change.
    await activate(person);
    expect(await assigned(loginId)).toEqual([other]);
    expect(await heldRows(person.id)).toEqual([]);

    current = await detail(person.id);
    expect(
      (
        await call('patch', `/people/${person.id}`, {
          isPortalUser: false,
          revision: current.revision,
        })
      ).status
    ).toBe(200);
    await drain();
    current = await detail(person.id);
    const kept = await call('patch', `/people/${person.id}`, {
      isPortalUser: true,
      temporaryPassword: TEMP,
      revision: current.revision,
    });
    expect(kept.status, JSON.stringify(kept.body)).toBe(200);
    await activate(person);
    expect(await assigned(loginId)).toEqual([other]);
  }, 30_000);

  it('AC07: needs access-control::assignments::write to send roles', async () => {
    const custom = await acl('post', '/roles', {
      code: `dir_${randomUUID().slice(0, 6)}`,
      name: 'Directory clerk',
      grants: [`${napsoft.tenant_code}::business-directory::*::*`],
    });
    expect(custom.status, JSON.stringify(custom.body)).toBe(201);
    const clerk = await staff(custom.body.data.code);
    const response = await call(
      'post',
      '/people',
      {
        kind: 'employee',
        firstName: 'Clerk',
        lastName: 'Made',
        primaryEmail: `clerk-${randomUUID().slice(0, 6)}@example.test`,
        isPortalUser: true,
        temporaryPassword: TEMP,
        roleIds: [support],
      },
      clerk.cookie
    );
    expect(response.status).toBe(403);
    const plain = await call(
      'post',
      '/people',
      {
        kind: 'employee',
        firstName: 'Clerk',
        lastName: 'Plain',
        primaryEmail: `plain-${randomUUID().slice(0, 6)}@example.test`,
      },
      clerk.cookie
    );
    expect(plain.status, JSON.stringify(plain.body)).toBe(201);
    expect(
      (
        await call(
          'get',
          `/people/${plain.body.data.id}`,
          undefined,
          clerk.cookie
        )
      ).body.data.roles
    ).toBeUndefined();
  });

  it('AC09: assigns a held role archived before activation; it grants nothing', async () => {
    const custom = (
      await acl('post', '/roles', {
        code: `temp_${randomUUID().slice(0, 6)}`,
        name: 'Temporary',
        grants: [`${napsoft.tenant_code}::business-directory::directory::read`],
      })
    ).body.data;
    const person = await employee({
      isPortalUser: true,
      temporaryPassword: TEMP,
      roleIds: [custom.id],
    });
    expect(
      (
        await acl('post', `/roles/${custom.id}/archive`, {
          revision: custom.revision,
        })
      ).status
    ).toBe(200);
    const loginId = await activate(person);
    expect(await assigned(loginId)).toEqual([custom.id]);
  }, 30_000);

  it('refuses a role the caller does not cover (M0003-R011)', async () => {
    const clerkRole = (
      await acl('post', '/roles', {
        code: `assign_${randomUUID().slice(0, 6)}`,
        name: 'Assigner',
        grants: [
          `${napsoft.tenant_code}::business-directory::*::*`,
          `${napsoft.tenant_code}::access-control::assignments::write`,
        ],
      })
    ).body.data;
    const clerk = await staff(clerkRole.code);
    const response = await call(
      'post',
      '/people',
      {
        kind: 'employee',
        firstName: 'Over',
        lastName: 'Reach',
        primaryEmail: `over-${randomUUID().slice(0, 6)}@example.test`,
        isPortalUser: true,
        temporaryPassword: TEMP,
        roleIds: [platformAdmin],
      },
      clerk.cookie
    );
    expect(response.body.error.code).toBe('GRANT_EXCEEDS_ACTOR');
  });
});

describe('directory lists and bulk actions (M0005-R027–R030)', () => {
  const tag = () => randomUUID().slice(0, 8);

  /** Every page of `path`, following `nextCursor`. */
  async function walk(path, limit) {
    const seen = [];
    let cursor;
    for (let page = 0; page < 20; page += 1) {
      const sep = path.includes('?') ? '&' : '?';
      const response = await call(
        'get',
        `${path}${sep}limit=${limit}${cursor ? `&cursor=${cursor}` : ''}`
      );
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      seen.push(...response.body.data.rows);
      cursor = response.body.data.nextCursor;
      if (!cursor) break;
    }
    return seen;
  }

  it("AC14: pages people, organizations, and an organization's contacts in name order with filters intact", async () => {
    const mark = tag();
    const people = [];
    for (const last of ['Cole', 'Abel', 'Baker', 'Abel'])
      people.push(
        await create('people', {
          kind: 'contact',
          firstName: `P${people.length}`,
          lastName: `${last}${mark}`,
        })
      );
    const walked = await walk(`/people?q=${mark}`, 2);
    expect(walked.map(p => `${p.lastName.slice(0, 4)} ${p.firstName}`)).toEqual(
      ['Abel P1', 'Abel P3', 'Bake P2', 'Cole P0']
    );

    const orgs = [];
    for (const legal of ['Zeta', 'Alpha', 'Mu'])
      orgs.push(
        await create('organizations', {
          kind: 'vendor',
          legalName: `${legal} ${mark}`,
          taxId: `9${String(orgs.length).padStart(1, '0')}-${mark.replace(/\D/g, '').padEnd(7, '1').slice(0, 7)}`,
        })
      );
    expect(
      (await walk(`/organizations?q=${mark}`, 1)).map(o => o.legalName)
    ).toEqual([`Alpha ${mark}`, `Mu ${mark}`, `Zeta ${mark}`]);

    for (const last of ['Two', 'One'])
      await create('organization-contacts', {
        organizationId: orgs[0].id,
        firstName: 'C',
        lastName: last,
      });
    expect(
      (
        await walk(`/organization-contacts?organizationId=${orgs[0].id}`, 1)
      ).map(c => c.lastName)
    ).toEqual(['One', 'Two']);

    const first = await call('get', `/people?q=${mark}&limit=2`);
    const replay = await call(
      'get',
      `/people?q=other&limit=2&cursor=${first.body.data.nextCursor}`
    );
    expect(replay.body.error.code).toBe('INVALID_INPUT');
    expect((await call('get', '/people?limit=101')).body.error.code).toBe(
      'INVALID_INPUT'
    );
  });

  it('AC16: archives and restores a page of records in one request', async () => {
    const mark = tag();
    const a = await create('people', {
      kind: 'contact',
      firstName: 'Bulk',
      lastName: `A${mark}`,
    });
    const b = await create('people', {
      kind: 'contact',
      firstName: 'Bulk',
      lastName: `B${mark}`,
    });
    const archived = await call('post', '/people/archive', {
      items: [
        { id: a.id, revision: a.revision },
        { id: b.id, revision: b.revision },
      ],
    });
    expect(archived.status, JSON.stringify(archived.body)).toBe(200);
    expect(archived.body.data.rows.map(row => row.archived)).toEqual([
      true,
      true,
    ]);
    expect((await call('get', `/people?q=${mark}`)).body.data.rows).toEqual([]);
    const again = await call('post', '/people/archive', {
      items: [{ id: a.id, revision: archived.body.data.rows[0].revision }],
    });
    expect(again.body.error).toMatchObject({
      code: 'BULK_FAILED',
      details: [{ id: a.id, code: 'INVALID_STATE' }],
    });
    const restored = await call('post', '/people/restore', {
      items: archived.body.data.rows.map(row => ({
        id: row.id,
        revision: row.revision,
      })),
    });
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);
    expect((await call('get', `/people?q=${mark}`)).body.data.rows.length).toBe(
      2
    );
    expect(
      (
        await call('post', '/people/archive', {
          items: [
            { id: a.id, revision: 1 },
            { id: a.id, revision: 1 },
          ],
        })
      ).body.error.code
    ).toBe('INVALID_INPUT');
  });

  it('AC17: refuses the whole batch and names each failed record', async () => {
    const mark = tag();
    const fine = await create('people', {
      kind: 'contact',
      firstName: 'Fine',
      lastName: `F${mark}`,
    });
    const stale = await create('people', {
      kind: 'contact',
      firstName: 'Stale',
      lastName: `S${mark}`,
    });
    const admin = await staff('tenant_admin');
    const adminPerson = await withTenantTransaction(cell, napsoft.id, tx =>
      tx.one(
        `SELECT member_id FROM cell.tenant_members
          WHERE tenant_id=$1 AND portal_user_id=$2`,
        [napsoft.id, admin.id]
      )
    );
    // The staff login's directory record: a person with access on.
    const person = await create('people', {
      kind: 'employee',
      firstName: 'Admin',
      lastName: `A${mark}`,
      primaryEmail: `admin-${mark}@example.test`,
    });
    await withTenantTransaction(cell, napsoft.id, async tx => {
      await tx.none(
        'UPDATE app.people SET is_portal_user=true WHERE party_id=$1',
        [person.id]
      );
      await tx.none(
        'UPDATE cell.tenant_members SET member_id=$1 WHERE member_id=$2',
        [person.id, adminPerson.member_id]
      );
    });
    const current = (await call('get', `/people/${person.id}`)).body.data;
    const response = await call('post', '/people/archive', {
      items: [
        { id: fine.id, revision: fine.revision },
        { id: stale.id, revision: stale.revision + 5 },
        { id: person.id, revision: current.revision },
      ],
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('BULK_FAILED');
    expect(response.body.error.details).toEqual([
      { id: stale.id, code: 'STALE_REVISION' },
      { id: person.id, code: 'ADMIN_ASSIGNED' },
    ]);
    expect((await call('get', `/people/${fine.id}`)).body.data.archived).toBe(
      false
    );
  });

  it('AC17: refuses a batch with a flagged primary tax contact', async () => {
    const client = await create('organizations', {
      kind: 'client',
      legalName: `Lot ${tag()}`,
      contacts: [
        {
          firstName: 'Flag',
          lastName: 'Holder',
          taxId: '444-55-6666',
          isPrimaryTaxContact: true,
        },
        { firstName: 'Other', lastName: 'Buyer' },
      ],
    });
    const contacts = (await call('get', `/organizations/${client.id}`)).body
      .data.contacts;
    const response = await call('post', '/organization-contacts/archive', {
      items: contacts.map(c => ({ id: c.id, revision: c.revision })),
    });
    expect(response.body.error.code).toBe('BULK_FAILED');
    expect(response.body.error.details).toEqual([
      {
        id: contacts.find(c => c.isPrimaryTaxContact).id,
        code: 'PRIMARY_TAX_CONTACT',
      },
    ]);
    const other = contacts.find(c => !c.isPrimaryTaxContact);
    expect(
      (await call('get', `/organization-contacts/${other.id}`)).body.data
        .archived
    ).toBe(false);
  });
});
