/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
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
import { setTenant } from '../../src/infrastructure/runtime/tenantTransaction.js';
import { tenantSettingsRoutesV1 } from '../../src/modules/tenant-settings/apiRoutes/v1/index.js';
import { adminTenancyRoutesV1 } from '../../src/modules/admin-tenancy/apiRoutes/v1/index.js';
import { randomBytes } from 'node:crypto';
import {
  organizationDetailSchema,
  personDetailSchema,
  taxIdFormatViewSchema,
  generalSettingsViewSchema,
  effectiveSettingsSchema,
} from '@nap/shared';
import { createSyncWorker } from '../../src/application/sync/worker.js';
import { withTenantTransaction } from '../../src/infrastructure/runtime/tenantTransaction.js';
import { membershipIn } from './helpers/tenantRows.js';

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
const SETTINGS = '/api/tenant-settings/v1';
const taxIdPolicy = {
  encryptionKey: randomBytes(32),
  hashKey: 'integration-tax-id-hash-key-of-ample-length',
};
const fileStoragePolicy = { encryptionKey: randomBytes(32) };

/**
 * An in-memory stand-in for S3-compatible buckets (M0006-02). The bucket
 * `acme-files` exists and accepts access key `AKIDEXAMPLE` with secret
 * `bucket-secret`; `https://down.example` is unreachable. `objects` holds
 * every stored object by bucket and key, and `failing.delete` makes
 * deletions fail.
 */
const bucket = {
  objects: new Map(),
  failing: { delete: false, all: false },
  factory(connection) {
    const fail = (name, status) =>
      Object.assign(new Error(name), {
        name,
        $metadata: { httpStatusCode: status },
      });
    const check = () => {
      if (bucket.failing.all || connection.endpoint === 'https://down.example')
        throw Object.assign(new Error('connect ECONNREFUSED'), {
          code: 'ECONNREFUSED',
        });
      if (connection.bucket !== 'acme-files') throw fail('NoSuchBucket', 404);
      if (
        connection.accessKeyId !== 'AKIDEXAMPLE' ||
        connection.secretAccessKey !== 'bucket-secret'
      )
        throw fail('SignatureDoesNotMatch', 403);
    };
    const id = key => `${connection.bucket}/${key}`;
    return {
      async put(key, body) {
        check();
        bucket.objects.set(id(key), Buffer.from(body));
      },
      async get(key) {
        check();
        if (!bucket.objects.has(id(key))) throw fail('NoSuchKey', 404);
        return bucket.objects.get(id(key));
      },
      async delete(key) {
        check();
        if (bucket.failing.delete) throw fail('InternalError', 500);
        bucket.objects.delete(id(key));
      },
      async signedGetUrl(key, seconds) {
        return `https://bucket.example/${id(key)}?X-Amz-Expires=${seconds}`;
      },
    };
  },
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
  return body === undefined ? pending : pending.send(withFormats(body));
}

/** Seeded US tax ID format IDs by name (M0005-R037), read once the app runs. */
let formats = {};

/**
 * Name a format for every tax ID a body sets without one (M0005-R038): EIN
 * for `12-3456789`, SSN otherwise. A test that names its own keeps it.
 * @param {unknown} body
 * @returns {unknown}
 */
function withFormats(body) {
  if (Array.isArray(body)) return body.map(withFormats);
  if (!body || typeof body !== 'object') return body;
  const out = Object.fromEntries(
    Object.entries(body).map(([key, value]) => [key, withFormats(value)])
  );
  if (typeof out.taxId === 'string' && !('taxIdFormatId' in out))
    out.taxIdFormatId = /^[0-9]{2}-[0-9]{7}$/.test(out.taxId)
      ? formats.EIN
      : formats.SSN;
  return out;
}

/**
 * Send a tenant-settings request, as the bootstrap login unless `as` says.
 * @param {string} method
 * @param {string} path Path below `SETTINGS`.
 * @param {object} [body]
 * @param {string} [as] Session cookie.
 */
function settings(method, path, body, as = cookie) {
  const pending = request(app)
    [method](SETTINGS + path)
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
      (await acl('put', `/memberships/${membership.id}/roles/${role.id}`))
        .status
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
    { membership: membership.id },
    { runtime: registry }
  );
  return {
    id: user.id,
    memberId: membership.id,
    cookie: `nap_session=${selected.token}`,
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
    { membership: await membershipIn(db, rootId, napsoft.id) },
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
      fileStoragePolicy,
      objectStoreFactory: bucket.factory,
      authenticationPolicy: {
        throttleSecret: 'integration-throttle-secret-of-ample-length',
        knownDeviceSecret: 'integration-known-device-secret-of-ample-length',
        ...ARGON2_MINIMUM,
      },
      registrations: [
        ...adminTenancyRoutesV1,
        ...accessControlRoutesV1,
        ...businessDirectoryRoutesV1,
        ...tenantSettingsRoutesV1,
      ],
    },
  });
  const listed = await call('get', '/tax-id-formats');
  expect(listed.status).toBe(200);
  formats = Object.fromEntries(listed.body.data.map(f => [f.name, f.id]));
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
    // I0011-R009: the archived view lists only archived records.
    const archivedList = (await call('get', '/people?q=Li&archived=true')).body
      .data.rows;
    expect(archivedList.some(p => p.id === bob.id)).toBe(true);
    expect(archivedList.every(p => p.archived)).toBe(true);
    for (const query of ['includeArchived=true', 'archived=yes'])
      expect((await call('get', `/people?${query}`)).body.error.code).toBe(
        'INVALID_INPUT'
      );
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

  it('AC12, AC30: finds a tax ID with or without dashes and refuses a same-kind duplicate, archived or not', async () => {
    const first = await create('people', {
      kind: 'contact',
      firstName: 'Dup',
      lastName: 'One',
      taxId: '321-54-9876',
    });
    const contact = {
      kind: 'contact',
      firstName: 'Dup',
      lastName: 'Two',
      taxId: '321549876',
    };
    // R047, R048: the holder is named, the number is not.
    const refused = await call('post', '/people', contact);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({
      code: 'DUPLICATE_TAX_ID',
      details: { id: first.id, archived: false },
    });
    // The holder's random UUID can contain any digits, so leave it out.
    expect(JSON.stringify(refused.body).replaceAll(first.id, '')).not.toContain(
      '9876'
    );

    // AC30: an archived holder still counts, and says so.
    const archived = await call('post', `/people/${first.id}/archive`, {
      revision: first.revision,
    });
    expect(archived.status).toBe(200);
    expect((await call('post', '/people', contact)).body.error).toEqual(
      expect.objectContaining({
        code: 'DUPLICATE_TAX_ID',
        details: { id: first.id, archived: true },
      })
    );
    const restored = await call('post', `/people/${first.id}/restore`, {
      revision: archived.body.data.revision,
    });
    expect(restored.status).toBe(200);
    expect(restored.body.data.taxIdLast4).toBe('9876');

    // AC31: another kind may hold the same number.
    const employee = await create('people', {
      kind: 'employee',
      firstName: 'Dup',
      lastName: 'Staff',
      primaryEmail: `dup-${randomUUID().slice(0, 6)}@example.test`,
      taxId: '321-54-9876',
    });
    for (const query of ['321-54-9876', '321549876']) {
      const found = (await call('get', `/people?taxId=${query}`)).body.data
        .rows;
      expect(found.map(p => p.id).sort()).toEqual(
        [first.id, employee.id].sort()
      );
    }
  });

  it('AC31: lets one buyer be a contact on two clients', async () => {
    const buyer = {
      firstName: 'Two',
      lastName: 'Homes',
      taxId: '432-65-1987',
      isPrimaryTaxContact: true,
    };
    await create('organizations', {
      kind: 'client',
      legalName: 'Lot 31',
      contacts: [buyer],
    });
    await create('organizations', {
      kind: 'client',
      legalName: 'Lot 32',
      contacts: [buyer],
    });
  });

  it('R047: lets only one of two concurrent saves of the same number win', async () => {
    const body = n => ({
      kind: 'contact',
      firstName: 'Race',
      lastName: `Run ${n}`,
      taxId: '543-76-2198',
    });
    const results = await Promise.all([
      call('post', '/people', body(1)),
      call('post', '/people', body(2)),
    ]);
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
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

  it('AC42, AC43: refuses a matching email, phone, or address on one party only', async () => {
    const [pat, lee] = await Promise.all(
      ['Pat', 'Lee'].map(firstName =>
        create('people', { kind: 'contact', firstName, lastName: 'Dup' })
      )
    );
    const add = (party, route, body) =>
      call('post', `/parties/${party.id}/${route}`, body);
    const email = await add(pat, 'contact-methods', {
      type: 'email',
      value: 'pat@example.com',
    });
    const phone = await add(pat, 'contact-methods', {
      type: 'phone',
      value: '(212) 555-1234',
    });
    const address = await add(pat, 'addresses', {
      line1: '123 Main St',
      city: 'Austin',
      country: 'US',
    });
    expect([email.status, phone.status, address.status]).toEqual([
      201, 201, 201,
    ]);
    const twins = [
      ['contact-methods', { type: 'email', value: ' Pat@Example.com' }],
      ['contact-methods', { type: 'phone', value: '212.555.1234' }],
      ['addresses', { line1: ' 123  main st ', city: 'AUSTIN', country: 'us' }],
    ];
    for (const [route, body] of twins) {
      const refused = await add(pat, route, body);
      expect(refused.status).toBe(409);
      expect(refused.body.error.code).toBe('DUPLICATE_DETAIL');
      // AC43: another party may hold the same value.
      expect((await add(lee, route, body)).status).toBe(201);
    }
    // A blank optional field matches a missing one.
    expect(
      (
        await add(pat, 'addresses', {
          line1: '123 Main St',
          line2: null,
          city: 'Austin',
          region: null,
          country: 'US',
        })
      ).body.error.code
    ).toBe('DUPLICATE_DETAIL');
    // Editing a row to match another is refused; saving its own value is not.
    const other = (
      await add(pat, 'contact-methods', {
        type: 'email',
        value: 'pat2@example.com',
      })
    ).body.data;
    const edit = value =>
      call('patch', `/parties/${pat.id}/contact-methods/${other.id}`, {
        value,
        revision: other.revision,
      });
    expect((await edit('PAT@example.com')).body.error.code).toBe(
      'DUPLICATE_DETAIL'
    );
    expect((await edit('pat2@example.com')).status).toBe(200);
    const second = (
      await add(pat, 'addresses', {
        line1: '9 Elm St',
        city: 'Austin',
        country: 'US',
      })
    ).body.data;
    expect(
      (
        await call('patch', `/parties/${pat.id}/addresses/${second.id}`, {
          line1: '123 MAIN ST',
          revision: second.revision,
        })
      ).body.error.code
    ).toBe('DUPLICATE_DETAIL');
    // AC43: a removed one can be added again; whitespace is saved collapsed.
    for (const [route, row] of [
      ['contact-methods', email.body.data],
      ['addresses', address.body.data],
    ])
      expect(
        (await call('delete', `/parties/${pat.id}/${route}/${row.id}`)).status
      ).toBe(200);
    expect((await add(pat, ...twins[0])).status).toBe(201);
    const readded = await add(pat, ...twins[2]);
    expect(readded.status).toBe(201);
    expect(readded.body.data).toMatchObject({
      line1: '123 main st',
      city: 'AUSTIN',
      country: 'US',
    });
  });
  it('AC44, AC45: lists the other records holding an email, phone, or address', async () => {
    const tag = randomUUID().slice(0, 8);
    const email = `shared-${tag}@example.test`;
    const [me, zed, old] = await Promise.all(
      [
        ['Me', 'Self'],
        ['Zed', 'Alpha'],
        ['Old', 'Archived'],
      ].map(([firstName, lastName]) =>
        create('people', { kind: 'contact', firstName, lastName })
      )
    );
    const digits = () =>
      String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
    const ein = digits();
    const vendor = await create('organizations', {
      kind: 'vendor',
      legalName: `Acme ${tag} LLC`,
      taxId: `${ein.slice(0, 2)}-${ein.slice(2)}`,
    });
    const rep = await create('organization-contacts', {
      organizationId: vendor.id,
      firstName: 'Ann',
      lastName: 'Rep',
    });
    const add = (party, route, body) =>
      call('post', `/parties/${party.id}/${route}`, body);
    const phone = `(212) 555-${digits().slice(0, 4)}`;
    const street = `${tag} Main St`;
    for (const party of [zed, old, rep]) {
      await add(party, 'contact-methods', { type: 'email', value: email });
      await add(party, 'contact-methods', { type: 'phone', value: phone });
      await add(party, 'addresses', {
        line1: street,
        city: 'Austin',
        country: 'US',
      });
    }
    // A removed one no longer counts; the asking party is never listed.
    const removed = (
      await add(vendor, 'contact-methods', { type: 'email', value: email })
    ).body.data;
    await call('delete', `/parties/${vendor.id}/contact-methods/${removed.id}`);
    await add(me, 'contact-methods', { type: 'email', value: email });
    const archived = await call('post', `/people/${old.id}/archive`, {
      revision: old.revision,
    });
    expect(archived.body.data.archived).toBe(true);

    const matches = async body =>
      call('post', `/parties/${me.id}/matches`, body);
    const expected = [
      {
        id: rep.id,
        kind: 'vendor_contact',
        name: 'Ann Rep',
        archived: false,
        organization: {
          id: vendor.id,
          name: vendor.legalName,
          archived: false,
        },
      },
      {
        id: old.id,
        kind: 'contact',
        name: 'Old Archived',
        archived: true,
        organization: null,
      },
      {
        id: zed.id,
        kind: 'contact',
        name: 'Zed Alpha',
        archived: false,
        organization: null,
      },
    ];
    for (const body of [
      { type: 'email', value: email.toUpperCase() },
      { type: 'phone', value: phone.replace(/[() -]/g, '.') },
      {
        type: 'address',
        line1: ` ${street.toLowerCase()}  `,
        city: 'AUSTIN',
        country: 'us',
      },
    ]) {
      const found = await matches(body);
      expect(found.status).toBe(200);
      expect(found.body.data).toEqual({ matches: expected });
    }
    expect(
      (await matches({ type: 'email', value: 'nobody@x.test' })).body.data
    ).toEqual({ matches: [] });
    expect(
      (await matches({ type: 'email', value: 'not-an-email' })).body.error.code
    ).toBe('INVALID_INPUT');
    expect((await matches({ type: 'fax', value: '1' })).body.error.code).toBe(
      'INVALID_INPUT'
    );
    expect(
      (
        await call('post', `/parties/${randomUUID()}/matches`, {
          type: 'email',
          value: email,
        })
      ).body.error.code
    ).toBe('NOT_FOUND');
    const outsider = await staff(
      await role(['business-directory::directory::read'])
    );
    expect(
      (
        await call(
          'post',
          `/parties/${me.id}/matches`,
          { type: 'email', value: email },
          outsider.cookie
        )
      ).status
    ).toBe(403);
    // Other records' names are read data: write alone is refused too.
    const writer = await staff(
      await role(['business-directory::directory::write'])
    );
    const refused = await call(
      'post',
      `/parties/${me.id}/matches`,
      { type: 'email', value: email },
      writer.cookie
    );
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('FORBIDDEN');
  });

  it('R066: returns at most 20 matches, ordered by name', async () => {
    const value = `crowd-${randomUUID().slice(0, 8)}@example.test`;
    const people = await Promise.all(
      Array.from({ length: 22 }, (_, i) =>
        create('people', {
          kind: 'contact',
          firstName: `P${String(i).padStart(2, '0')}`,
          lastName: 'Crowd',
        })
      )
    );
    for (const person of people)
      await call('post', `/parties/${person.id}/contact-methods`, {
        type: 'email',
        value,
      });
    const found = (
      await call('post', `/parties/${people[0].id}/matches`, {
        type: 'email',
        value,
      })
    ).body.data.matches;
    expect(found.map(m => m.name)).toEqual(
      people.slice(1, 21).map(p => `${p.firstName} Crowd`)
    );
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
      taxId: '12-3456782',
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

  it('M0005-R049, R051: saves each detail section on its own', async () => {
    const vendor = await create('organizations', {
      kind: 'vendor',
      legalName: 'Section Supply LLC',
      taxId: '12-3456783',
    });
    const contact = await create('organization-contacts', {
      organizationId: vendor.id,
      firstName: 'Sam',
      lastName: 'Section',
    });
    const named = await call('patch', `/organization-contacts/${contact.id}`, {
      lastName: 'Sections',
      revision: contact.revision,
    });
    expect(named.status).toBe(200);
    expect(named.body.data).toMatchObject({
      firstName: 'Sam',
      lastName: 'Sections',
      isPrimaryContact: false,
    });
    const flagged = await call(
      'patch',
      `/organization-contacts/${contact.id}`,
      {
        isBillingContact: true,
        revision: named.body.data.revision,
      }
    );
    expect(flagged.status).toBe(200);
    expect(flagged.body.data).toMatchObject({
      lastName: 'Sections',
      isBillingContact: true,
    });
    const renamed = await call('patch', `/organizations/${vendor.id}`, {
      legalName: 'Section Supply Co',
      dbaName: null,
      revision: vendor.revision,
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.taxIdLast4).toBe(vendor.taxIdLast4);
  });

  it('I0012-R007: a vendor contact carries its vendor label, and renaming the vendor relabels it', async () => {
    const vendor = await create('organizations', {
      kind: 'vendor',
      legalName: 'Black Plumbing LLC',
      taxId: '12-3456780',
    });
    const contact = await create('organization-contacts', {
      organizationId: vendor.id,
      firstName: 'Jack',
      lastName: 'Black',
    });
    const address = `jack-${randomUUID().slice(0, 6)}@example.test`;
    await call('post', `/parties/${contact.id}/contact-methods`, {
      type: 'email',
      value: address,
      isPrimary: true,
    });
    const current = (await call('get', `/organization-contacts/${contact.id}`))
      .body.data;
    const on = await call('patch', `/organization-contacts/${contact.id}`, {
      isPortalUser: true,
      temporaryPassword: TEMP,
      roleIds,
      revision: current.revision,
    });
    expect(on.status).toBe(200);
    await drain();
    const labelOf = async () =>
      (
        await db.one(
          `SELECT member_label FROM admin.portal_user_tenants
            WHERE tenant_id=$1 AND member_id=$2 AND deactivated_at IS NULL`,
          [napsoft.id, contact.id]
        )
      ).member_label;
    expect(await labelOf()).toBe('Vendor · Black Plumbing LLC');

    const renamed = await call('patch', `/organizations/${vendor.id}`, {
      dbaName: 'Black Plumbing',
      revision: vendor.revision,
    });
    expect(renamed.status).toBe(200);
    await drain();
    expect(await labelOf()).toBe('Vendor · Black Plumbing');
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

  /** The role IDs assigned to the login's Napsoft membership, sorted. */
  async function assigned(loginId) {
    const membershipId = await membershipIn(db, loginId, napsoft.id);
    const roles = (await acl('get', `/memberships/${membershipId}/roles`)).body
      .data.roles;
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

describe('label bulk archive and restore (M0005-R032)', () => {
  /** A new Email label with a unique name. */
  async function label() {
    const response = await call('post', '/labels', {
      appliesTo: 'email',
      name: `bulk-${randomUUID().slice(0, 8)}`,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body.data;
  }

  it('AC18: archives and restores several labels in one request', async () => {
    const first = await label();
    const second = await label();
    const archived = await call('post', '/labels/archive', {
      items: [
        { id: first.id, revision: first.revision },
        { id: second.id, revision: second.revision },
      ],
    });
    expect(archived.status, JSON.stringify(archived.body)).toBe(200);
    expect(archived.body.data.rows.map(row => [row.id, row.archived])).toEqual([
      [first.id, true],
      [second.id, true],
    ]);

    const restored = await call('post', '/labels/restore', {
      items: archived.body.data.rows.map(row => ({
        id: row.id,
        revision: row.revision,
      })),
    });
    expect(restored.status).toBe(200);
    expect(restored.body.data.rows.every(row => !row.archived)).toBe(true);
  });

  it('AC18: changes nothing and names each failed label', async () => {
    const fine = await label();
    const stale = await label();
    const already = await label();
    await call('post', `/labels/${already.id}/archive`, {
      revision: already.revision,
    });
    const response = await call('post', '/labels/archive', {
      items: [
        { id: fine.id, revision: fine.revision },
        { id: stale.id, revision: stale.revision + 5 },
        { id: already.id, revision: already.revision + 1 },
      ],
    });
    expect(response.status).toBe(409);
    expect(response.body.error.details).toEqual([
      { id: stale.id, code: 'STALE_REVISION' },
      { id: already.id, code: 'INVALID_STATE' },
    ]);
    const labels = (await call('get', '/labels')).body.data;
    expect(labels.find(row => row.id === fine.id).archived).toBe(false);
  });

  it('rejects an empty or duplicated item list', async () => {
    const one = await label();
    for (const items of [
      [],
      [
        { id: one.id, revision: one.revision },
        { id: one.id, revision: one.revision },
      ],
    ]) {
      const response = await call('post', '/labels/archive', { items });
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_INPUT');
    }
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

describe('archived labels (I0011-R009, R010)', () => {
  /** A new Email label with a unique name. */
  async function label(name = `view-${randomUUID().slice(0, 8)}`) {
    const response = await call('post', '/labels', {
      appliesTo: 'email',
      name,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    return response.body.data;
  }

  /** Archive `row` and return its archived view. */
  async function archive(row) {
    const response = await call('post', `/labels/${row.id}/archive`, {
      revision: row.revision,
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    return response.body.data;
  }

  it('lists only archived labels with archived=true and refuses includeArchived', async () => {
    const kept = await label();
    const gone = await archive(await label());
    const active = (await call('get', '/labels?appliesTo=email')).body.data;
    expect(active.map(row => row.id)).toContain(kept.id);
    expect(active.map(row => row.id)).not.toContain(gone.id);
    const archived = (
      await call('get', '/labels?appliesTo=email&archived=true')
    ).body.data;
    expect(archived.map(row => row.id)).toContain(gone.id);
    expect(archived.every(row => row.archived)).toBe(true);
    expect(
      (await call('get', '/labels?includeArchived=true')).body.error.code
    ).toBe('INVALID_INPUT');
  });

  it('names the archived label that holds a name on create and rename', async () => {
    const gone = await archive(await label());
    const created = await call('post', '/labels', {
      appliesTo: 'email',
      name: gone.name,
    });
    expect(created.status).toBe(409);
    expect(created.body.error).toMatchObject({
      code: 'CONFLICT',
      details: { id: gone.id, archived: true },
    });

    const other = await label();
    const renamed = await call('patch', `/labels/${other.id}`, {
      name: gone.name,
      revision: other.revision,
    });
    expect(renamed.status).toBe(409);
    expect(renamed.body.error.details).toEqual({ id: gone.id, archived: true });

    // An active holder is refused without details; keeping its own name is not a conflict.
    const active = await call('patch', `/labels/${other.id}`, {
      name: (await label()).name,
      revision: other.revision,
    });
    expect(active.body.error).toMatchObject({ code: 'CONFLICT' });
    expect(active.body.error.details).toBeUndefined();
    const same = await call('patch', `/labels/${other.id}`, {
      name: other.name,
      revision: other.revision,
    });
    expect(same.status, JSON.stringify(same.body)).toBe(200);
  });
});

describe('phones (M0005-R033)', () => {
  it('AC19: stores entered numbers in E.164 form and refuses invalid ones', async () => {
    const person = await create('people', {
      kind: 'contact',
      firstName: 'Phone',
      lastName: 'Owner',
    });
    const add = value =>
      call('post', `/parties/${person.id}/contact-methods`, {
        type: 'phone',
        value,
      });
    const plain = await add('(212) 555-1234');
    expect(plain.status).toBe(201);
    expect(plain.body.data.value).toBe('+12125551234');
    expect((await add('212 555 1234 x12')).body.data.value).toBe(
      '+12125551234;ext=12'
    );
    expect((await add('+44 20 7946 0958')).body.data.value).toBe(
      '+442079460958'
    );
    const invalid = await add('555-1234');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_INPUT');
    const edited = await call(
      'patch',
      `/parties/${person.id}/contact-methods/${plain.body.data.id}`,
      { value: '212.555.9876', revision: plain.body.data.revision }
    );
    expect(edited.body.data.value).toBe('+12125559876');
  });
});

describe('tax ID formats (M0005-R036–R042)', () => {
  const unique = () => randomUUID().slice(0, 6);

  it('AC22: seeds the US formats', async () => {
    const listed = (await call('get', '/tax-id-formats')).body.data;
    const us = listed
      .filter(f => f.country === 'US')
      .map(f => [f.name, f.mask]);
    expect(us).toEqual(
      expect.arrayContaining([
        ['SSN', '###-##-####'],
        ['EIN', '##-#######'],
        ['ITIN', '###-##-####'],
      ])
    );
    expect(listed.every(f => taxIdFormatViewSchema.safeParse(f).success)).toBe(
      true
    );
  });

  it('creates a format, refusing a duplicate name, a bad mask, an unknown country, or a caller without the capability', async () => {
    const name = 'VAT ' + unique();
    const made = await call('post', '/tax-id-formats', {
      country: 'GB',
      name,
      mask: 'GB ### #### ##',
    });
    expect(made.status).toBe(201);
    expect(made.body.data).toMatchObject({ country: 'GB', archived: false });
    const again = await call('post', '/tax-id-formats', {
      country: 'GB',
      name,
      mask: '#########',
    });
    expect(again.body.error.code).toBe('CONFLICT');
    for (const body of [
      { country: 'GB', name: 'x' + unique(), mask: '###' },
      { country: 'ZZ', name: 'x' + unique(), mask: '####' },
      { country: 'gb', name: 'x' + unique(), mask: '####' },
    ])
      expect(
        (await call('post', '/tax-id-formats', body)).body.error.code
      ).toBe('INVALID_INPUT');
    const limited = await staff(
      await role([
        'business-directory::directory::read',
        'business-directory::directory::write',
      ])
    );
    expect(
      (await call('get', '/tax-id-formats', undefined, limited.cookie)).status
    ).toBe(200);
    expect(
      (
        await call(
          'post',
          '/tax-id-formats',
          { country: 'GB', name: 'x' + unique(), mask: '####' },
          limited.cookie
        )
      ).status
    ).toBe(403);
  });

  it('AC23: saves, reveals, and finds a tax ID in its format, and needs an active format', async () => {
    const vat = (
      await call('post', '/tax-id-formats', {
        country: 'GB',
        name: 'VAT ' + unique(),
        mask: 'GB ### #### ##',
      })
    ).body.data;
    const person = await create('people', {
      kind: 'contact',
      firstName: 'Vat',
      lastName: 'Payer',
      taxId: 'GB 731 4567 89',
      taxIdFormatId: vat.id,
    });
    expect(person).toMatchObject({
      taxIdLast4: '6789',
      taxIdFormatId: vat.id,
    });
    expect(
      (await call('get', `/people/${person.id}/tax-id`)).body.data
    ).toEqual({ taxId: '731456789' });
    for (const query of ['GB 731 4567 89', '731456789', '731-45-6789']) {
      const found = (
        await call('get', `/people?taxId=${encodeURIComponent(query)}`)
      ).body.data.rows.map(row => row.id);
      expect(found, query).toContain(person.id);
    }
    const refuse = async body =>
      (
        await call('post', '/people', {
          kind: 'contact',
          firstName: 'No',
          lastName: 'Format',
          ...body,
        })
      ).body.error.code;
    expect(await refuse({ taxId: '731456789', taxIdFormatId: undefined })).toBe(
      'INVALID_INPUT'
    );
    expect(await refuse({ taxIdFormatId: vat.id })).toBe('INVALID_INPUT');
    expect(await refuse({ taxId: '12-34', taxIdFormatId: vat.id })).toBe(
      'INVALID_INPUT'
    );
    const archived = await call('post', `/tax-id-formats/${vat.id}/archive`, {
      revision: vat.revision,
    });
    expect(archived.body.data.archived).toBe(true);
    expect(await refuse({ taxId: '731456780', taxIdFormatId: vat.id })).toBe(
      'INVALID_INPUT'
    );
    // R041: an archived format keeps formatting the tax IDs that use it.
    expect(
      (await call('get', `/people/${person.id}`)).body.data.taxIdFormatId
    ).toBe(vat.id);
  });

  it('AC24: treats the same digits under SSN and EIN as one number within a kind', async () => {
    const first = await create('people', {
      kind: 'contact',
      firstName: 'Same',
      lastName: 'Digits',
      taxId: '613-57-9135',
    });
    const second = await call('post', '/people', {
      kind: 'contact',
      firstName: 'Same',
      lastName: 'Digits Again',
      taxId: '61-3579135',
      taxIdFormatId: formats.EIN,
    });
    expect(second.body.error).toMatchObject({
      code: 'DUPLICATE_TAX_ID',
      details: { id: first.id, archived: false },
    });
    // AC31: a vendor is another kind, so the number is free there.
    const vendor = await call('post', '/organizations', {
      kind: 'vendor',
      legalName: 'Same Digits LLC',
      taxId: '61-3579135',
    });
    expect(vendor.status).toBe(201);
    expect(vendor.body.data.taxIdFormatId).toBe(formats.EIN);
  });

  it('AC25: lets a used format change its name and separators but not its slots', async () => {
    const used = (
      await call('post', '/tax-id-formats', {
        country: 'CA',
        name: 'SIN ' + unique(),
        mask: '###-###-###',
      })
    ).body.data;
    await create('people', {
      kind: 'contact',
      firstName: 'Can',
      lastName: 'Ada',
      taxId: '046 454 286',
      taxIdFormatId: used.id,
    });
    const renamed = await call('patch', `/tax-id-formats/${used.id}`, {
      name: used.name + ' renamed',
      mask: '### ### ###',
      revision: used.revision,
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.mask).toBe('### ### ###');
    const resized = await call('patch', `/tax-id-formats/${used.id}`, {
      name: renamed.body.data.name,
      mask: '####-#####',
      revision: renamed.body.data.revision,
    });
    expect(resized.status).toBe(200);
    const retyped = await call('patch', `/tax-id-formats/${used.id}`, {
      name: renamed.body.data.name,
      mask: 'A##-###-###',
      revision: resized.body.data.revision,
    });
    expect(retyped.status).toBe(409);
    expect(retyped.body.error.code).toBe('INVALID_STATE');
    const unused = (
      await call('post', '/tax-id-formats', {
        country: 'CA',
        name: 'BN ' + unique(),
        mask: '#########',
      })
    ).body.data;
    expect(
      (
        await call('patch', `/tax-id-formats/${unused.id}`, {
          name: unused.name,
          mask: '#########AA####',
          revision: unused.revision,
        })
      ).status
    ).toBe(200);
  });

  it('archives and restores formats in bulk, all or nothing, and delivers their events', async () => {
    const make = async () =>
      (
        await call('post', '/tax-id-formats', {
          country: 'FR',
          name: 'SIREN ' + unique(),
          mask: '### ### ###',
        })
      ).body.data;
    const [a, b] = [await make(), await make()];
    const items = [a, b].map(({ id, revision }) => ({ id, revision }));
    const archived = await call('post', '/tax-id-formats/archive', { items });
    expect(archived.status).toBe(200);
    expect(archived.body.data.rows.map(row => row.archived)).toEqual([
      true,
      true,
    ]);
    const again = await call('post', '/tax-id-formats/archive', {
      items: archived.body.data.rows.map(({ id, revision }) => ({
        id,
        revision,
      })),
    });
    expect(again.body.error.code).toBe('BULK_FAILED');
    const restored = await call('post', '/tax-id-formats/restore', {
      items: archived.body.data.rows.map(({ id, revision }) => ({
        id,
        revision,
      })),
    });
    expect(restored.body.data.rows.map(row => row.archived)).toEqual([
      false,
      false,
    ]);
    await sync.tick();
    const events = await db.managed_events.findWhere(
      { target_id: a.id },
      'AND',
      { columnWhitelist: ['event_key', 'target_type'] }
    );
    expect(events).toEqual(
      expect.arrayContaining([
        {
          event_key: 'directory.tax_id_format.created',
          target_type: 'tax_id_format',
        },
        {
          event_key: 'directory.tax_id_format.archived',
          target_type: 'tax_id_format',
        },
        {
          event_key: 'directory.tax_id_format.restored',
          target_type: 'tax_id_format',
        },
      ])
    );
  });
});

describe('general settings (M0006-01)', () => {
  it('AC01: the Napsoft tenant starts with a settings row of defaults', async () => {
    const row = await cell.tx(async tx => {
      await setTenant(tx, napsoft.id);
      return tx.one('SELECT settings FROM app.tenant_settings');
    });
    expect(row.settings).toEqual({});
    const general = await settings('get', '/general');
    expect(general.status).toBe(200);
    expect(generalSettingsViewSchema.safeParse(general.body.data).success).toBe(
      true
    );
    expect(general.body.data.settings.recordsPerPage).toEqual({
      value: 25,
      stored: false,
    });
  });

  it('AC02, AC03, AC07: saves, refuses, resets, and drives the phone country', async () => {
    const { revision } = (await settings('get', '/general')).body.data;
    const refuse = async body =>
      (await settings('patch', '/general', body)).body.error.code;
    expect(await refuse({ settings: { unknown: 1 }, revision })).toBe(
      'INVALID_INPUT'
    );
    expect(await refuse({ settings: { recordsPerPage: 30 }, revision })).toBe(
      'INVALID_INPUT'
    );
    expect(
      await refuse({ settings: { timeZone: 'Mars/Olympus' }, revision })
    ).toBe('INVALID_INPUT');
    expect(await refuse({ settings: { defaultCountry: 'ZZ' }, revision })).toBe(
      'INVALID_INPUT'
    );
    expect(await refuse({ settings: { currency: 'ZZZ' }, revision })).toBe(
      'INVALID_INPUT'
    );
    expect(
      await refuse({ settings: { timeZone: 'UTC' }, revision: revision + 5 })
    ).toBe('STALE_REVISION');

    const saved = await settings('patch', '/general', {
      settings: { defaultCountry: 'GB', timeZone: 'America/Chicago' },
      revision,
    });
    expect(saved.status).toBe(200);
    expect(saved.body.data.revision).toBe(revision + 1);
    expect(saved.body.data.settings.timeZone).toEqual({
      value: 'America/Chicago',
      stored: true,
    });
    expect(saved.body.data.settings.dateFormat.stored).toBe(false);

    // M0005-R046: a phone without `+` is read in the tenant's country.
    const person = await create('people', {
      kind: 'contact',
      firstName: 'Brit',
      lastName: 'Phone',
    });
    const phone = await call('post', `/parties/${person.id}/contact-methods`, {
      type: 'phone',
      value: '020 7946 0958',
    });
    expect(phone.body.data.value).toBe('+442079460958');

    const reset = await settings('patch', '/general', {
      settings: { defaultCountry: null, timeZone: null },
      revision: saved.body.data.revision,
    });
    expect(reset.body.data.settings.timeZone).toEqual({
      value: 'America/New_York',
      stored: false,
    });
    expect(
      (
        await call('post', `/parties/${person.id}/contact-methods`, {
          type: 'phone',
          value: '020 7946 0958',
        })
      ).body.error.code
    ).toBe('INVALID_INPUT');

    await sync.tick();
    const events = await db.managed_events.findWhere(
      { event_key: 'tenant_settings.updated', tenant_id: napsoft.id },
      'AND',
      { columnWhitelist: ['target_type', 'details'] }
    );
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].target_type).toBe('tenant_settings');
    expect(events.map(e => e.details.changed_fields)).toContain(
      'defaultCountry,timeZone'
    );
  });

  it('AC05: any member reads effective values; general routes need the capabilities', async () => {
    const effective = await settings('get', '/effective');
    expect(effectiveSettingsSchema.safeParse(effective.body.data).success).toBe(
      true
    );
    const member = await staff(null);
    const seen = await settings('get', '/effective', undefined, member.cookie);
    expect(seen.status).toBe(200);
    expect(seen.body.data.defaultCountry).toBe('US');
    expect(
      (await settings('get', '/general', undefined, member.cookie)).status
    ).toBe(403);
    expect(
      (
        await settings(
          'patch',
          '/general',
          { settings: { language: 'en' }, revision: 1 },
          member.cookie
        )
      ).status
    ).toBe(403);
  });
});

/** A tiny valid PNG header followed by `size - 8` bytes. */
function png(size = 64) {
  const body = Buffer.alloc(size);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(body);
  return body;
}

/** Upload `body` as the logo with `contentType`. */
function uploadLogo(body, contentType = 'image/png', as = cookie) {
  return request(app)
    .put(`${SETTINGS}/logo`)
    .set('Origin', ORIGIN)
    .set('Cookie', as)
    .attach('file', body, { filename: '../../evil name.png', contentType });
}

const CONNECTION = {
  endpoint: 'https://bucket.example',
  region: 'auto',
  bucket: 'acme-files',
  accessKeyId: 'AKIDEXAMPLE',
};

describe('file storage and tenant logo (M0006-02)', () => {
  it('AC05, AC08: with no storage, uploads are refused and the shell gets no logo', async () => {
    expect((await settings('get', '/storage')).body.data).toBeNull();
    const upload = await uploadLogo(png());
    expect(upload.body.error.code).toBe('STORAGE_NOT_CONFIGURED');
    const effective = (await settings('get', '/effective')).body.data;
    expect(effective.logoFileId).toBeNull();
    expect(effective.storageConnected).toBe(false);
  });

  it('AC03: a wrong key, a missing bucket, and an unreachable endpoint fail the test and save nothing', async () => {
    const attempt = async change =>
      (
        await settings('put', '/storage', {
          ...CONNECTION,
          secretAccessKey: 'bucket-secret',
          revision: null,
          ...change,
        })
      ).body.error;
    expect(await attempt({ secretAccessKey: 'wrong' })).toMatchObject({
      code: 'STORAGE_TEST_FAILED',
      reason: 'ACCESS_DENIED',
    });
    expect(await attempt({ bucket: 'missing' })).toMatchObject({
      code: 'STORAGE_TEST_FAILED',
      reason: 'BUCKET_NOT_FOUND',
    });
    expect(await attempt({ endpoint: 'https://down.example' })).toMatchObject({
      code: 'STORAGE_TEST_FAILED',
      reason: 'UNREACHABLE',
    });
    expect((await attempt({ endpoint: 'http://bucket.example' })).code).toBe(
      'INVALID_INPUT'
    );
    expect((await attempt({ secretAccessKey: undefined })).code).toBe(
      'INVALID_INPUT'
    );
    expect((await settings('get', '/storage')).body.data).toBeNull();
  });

  it('AC01, AC02: connects after a test, stores the secret only encrypted, and never returns it', async () => {
    const saved = await settings('put', '/storage', {
      ...CONNECTION,
      secretAccessKey: 'bucket-secret',
      revision: null,
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data).toEqual({
      ...CONNECTION,
      secretSet: true,
      revision: 1,
    });
    // The test object was written and deleted.
    expect(
      [...bucket.objects.keys()].some(key => key.includes('_connection-test'))
    ).toBe(false);
    const row = await cell.tx(async tx => {
      await setTenant(tx, napsoft.id);
      return tx.one('SELECT * FROM app.file_storage');
    });
    expect(row.secret_encrypted).not.toContain('bucket-secret');
    expect(
      Buffer.from(row.secret_encrypted, 'base64').includes('bucket-secret')
    ).toBe(false);
    expect(JSON.stringify(await settings('get', '/storage'))).not.toContain(
      'bucket-secret'
    );
    const outbox = await cell.tx(async tx => {
      await setTenant(tx, napsoft.id);
      return tx.any(
        "SELECT payload::text AS payload FROM cell.outbox WHERE topic = 'settings_change'"
      );
    });
    expect(outbox.some(r => r.payload.includes('storage_connected'))).toBe(
      true
    );
    expect(outbox.every(r => !r.payload.includes('bucket-secret'))).toBe(true);
    await sync.tick();
    const [event] = await db.managed_events.findWhere(
      {
        event_key: 'tenant_settings.storage_connected',
        tenant_id: napsoft.id,
      },
      'AND',
      { columnWhitelist: ['target_type', 'details'] }
    );
    expect(event.target_type).toBe('tenant_settings');
    expect(event.details.changed_fields).toBe(
      'endpoint,region,bucket,access_key_id,secret_access_key'
    );
    expect(JSON.stringify(event)).not.toContain('bucket-secret');
    expect(
      (await settings('get', '/effective')).body.data.storageConnected
    ).toBe(true);
  });

  it('AC04: a region change keeps the secret; an access key change needs it', async () => {
    const changed = await settings('put', '/storage', {
      ...CONNECTION,
      region: 'us-east-1',
      revision: 1,
    });
    expect(changed.status, JSON.stringify(changed.body)).toBe(200);
    expect(changed.body.data.revision).toBe(2);
    const refused = await settings('put', '/storage', {
      ...CONNECTION,
      accessKeyId: 'AKIDOTHER',
      revision: 2,
    });
    expect(refused.body.error.code).toBe('INVALID_INPUT');
    const stale = await settings('put', '/storage', {
      ...CONNECTION,
      revision: 1,
    });
    expect(stale.body.error.code).toBe('STALE_REVISION');
  });

  it('AC05: stores a 1 MB PNG under its own key and refuses large, fake, and mistyped files', async () => {
    const upload = await uploadLogo(png(1024 * 1024));
    expect(upload.status, JSON.stringify(upload.body)).toBe(200);
    const id = upload.body.data.logoFileId;
    const file = await cell.tx(async tx => {
      await setTenant(tx, napsoft.id);
      return tx.one('SELECT * FROM app.files WHERE id = $1', [id]);
    });
    expect(file.object_key).toBe(`${napsoft.id}/logo/${id}`);
    expect(file).toMatchObject({
      purpose: 'logo',
      content_type: 'image/png',
      size_bytes: 1024 * 1024,
    });
    expect(bucket.objects.has(`acme-files/${file.object_key}`)).toBe(true);
    expect((await settings('get', '/effective')).body.data.logoFileId).toBe(id);

    expect((await uploadLogo(png(3 * 1024 * 1024))).body.error.code).toBe(
      'INVALID_INPUT'
    );
    expect(
      (await uploadLogo(Buffer.from('not an image'))).body.error.code
    ).toBe('INVALID_INPUT');
    expect((await uploadLogo(png(), 'image/gif')).body.error.code).toBe(
      'INVALID_INPUT'
    );
    const json = await settings('put', '/logo', { file: 'x' });
    expect(json.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('AC06: gives any member a 15-minute signed link to the logo', async () => {
    const { logoFileId } = (await settings('get', '/effective')).body.data;
    const member = await staff(null);
    const link = await settings(
      'get',
      `/files/${logoFileId}/link`,
      undefined,
      member.cookie
    );
    expect(link.status).toBe(200);
    expect(link.body.data.url).toContain('X-Amz-Expires=900');
    expect(
      new Date(link.body.data.expiresAt).getTime() - Date.now()
    ).toBeLessThanOrEqual(15 * 60 * 1000);
    expect(
      (await settings('get', `/files/${randomUUID()}/link`)).body.error.code
    ).toBe('NOT_FOUND');
    expect((await uploadLogo(png(), 'image/png', member.cookie)).status).toBe(
      403
    );
    expect(
      (await settings('get', '/storage', undefined, member.cookie)).status
    ).toBe(403);
  });

  it('AC07: replacing deletes the old object; a failed deletion still saves and logs the key', async () => {
    const first = (await settings('get', '/effective')).body.data.logoFileId;
    const firstKey = `acme-files/${napsoft.id}/logo/${first}`;
    const replaced = await uploadLogo(png(128));
    expect(replaced.status).toBe(200);
    expect(bucket.objects.has(firstKey)).toBe(false);

    const secondKey = `${napsoft.id}/logo/${replaced.body.data.logoFileId}`;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    bucket.failing.delete = true;
    try {
      const again = await uploadLogo(png(256));
      expect(again.status).toBe(200);
      expect((await settings('get', '/effective')).body.data.logoFileId).toBe(
        again.body.data.logoFileId
      );
      expect(warn).toHaveBeenCalledWith(
        JSON.stringify({ event: 'file.delete_failed', object_key: secondKey })
      );
    } finally {
      bucket.failing.delete = false;
      warn.mockRestore();
    }
    const archived = await cell.tx(async tx => {
      await setTenant(tx, napsoft.id);
      return tx.one(
        "SELECT count(*)::int AS n FROM app.files WHERE purpose = 'logo' AND deactivated_at IS NOT NULL"
      );
    });
    expect(archived.n).toBe(2);
    await sync.tick();
    const events = await db.managed_events.findWhere(
      { event_key: 'tenant_settings.logo_changed', tenant_id: napsoft.id },
      'AND',
      { columnWhitelist: ['details'] }
    );
    expect(events.map(e => e.details.action).sort()).toEqual([
      'replaced',
      'replaced',
      'uploaded',
    ]);
  });

  it('AC08: with storage down the link fails; after disconnecting the logo is kept but unavailable', async () => {
    const { logoFileId } = (await settings('get', '/effective')).body.data;
    bucket.failing.all = true;
    try {
      expect((await uploadLogo(png())).body.error.code).toBe(
        'STORAGE_UNAVAILABLE'
      );
    } finally {
      bucket.failing.all = false;
    }
    const { revision } = (await settings('get', '/storage')).body.data;
    const gone = await settings('delete', `/storage?revision=${revision}`);
    expect(gone.status).toBe(204);
    expect((await settings('get', '/storage')).body.data).toBeNull();
    const effective = (await settings('get', '/effective')).body.data;
    expect(effective).toMatchObject({ logoFileId, storageConnected: false });
    expect(
      (await settings('get', `/files/${logoFileId}/link`)).body.error.code
    ).toBe('STORAGE_NOT_CONFIGURED');
    // R006: the object stays in the bucket.
    expect(
      bucket.objects.has(`acme-files/${napsoft.id}/logo/${logoFileId}`)
    ).toBe(true);
  });

  it('R011, R013: removing the logo archives it even with no storage, and logs the key', async () => {
    const { logoFileId } = (await settings('get', '/effective')).body.data;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const removed = await settings('delete', '/logo');
      expect(removed.status).toBe(204);
      expect(warn).toHaveBeenCalledWith(
        JSON.stringify({
          event: 'file.delete_failed',
          object_key: `${napsoft.id}/logo/${logoFileId}`,
        })
      );
    } finally {
      warn.mockRestore();
    }
    expect(
      (await settings('get', '/effective')).body.data.logoFileId
    ).toBeNull();
    expect((await settings('delete', '/logo')).body.error.code).toBe(
      'NOT_FOUND'
    );
    await sync.tick();
    const [event] = await db.managed_events.findWhere(
      {
        event_key: 'tenant_settings.storage_disconnected',
        tenant_id: napsoft.id,
      },
      'AND',
      { columnWhitelist: ['details'] }
    );
    expect(event.details.revision).toBe(2);
  });
});

/** Upload `body` as the signed-in member's profile image. */
function uploadProfileImage(body, as = cookie) {
  return request(app)
    .put(`${SETTINGS}/profile/image`)
    .set('Origin', ORIGIN)
    .set('Cookie', as)
    .attach('file', body, { filename: 'me.png', contentType: 'image/png' });
}

describe('member profiles (M0006-03)', () => {
  let member;
  const outboxCount = () =>
    cell.tx(async tx => {
      await setTenant(tx, napsoft.id);
      return (
        await tx.one(
          "SELECT count(*)::int AS n FROM cell.outbox WHERE topic = 'settings_change'"
        )
      ).n;
    });

  it('AC01: a member overrides a setting for themselves only', async () => {
    member = await staff(null);
    const before = (await settings('get', '/effective')).body.data;
    expect(before.timeZone).toBe('America/New_York');
    expect(before.profileImage).toBeNull();
    const empty = (await settings('get', '/profile')).body.data;
    expect(empty).toMatchObject({
      overrides: {},
      defaultImage: null,
      imageFileId: null,
      revision: 0,
    });
    expect(empty.tenantValues.timeZone).toBe('America/New_York');

    const events = await outboxCount();
    const saved = await settings('patch', '/profile', {
      overrides: { timeZone: 'Europe/London', recordsPerPage: 100 },
      revision: 0,
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body.data).toMatchObject({
      overrides: { timeZone: 'Europe/London', recordsPerPage: 100 },
      tenantValues: { timeZone: 'America/New_York', recordsPerPage: 25 },
      revision: 1,
    });
    // §12: profile changes record no administrative event.
    expect(await outboxCount()).toBe(events);

    const mine = (await settings('get', '/effective')).body.data;
    expect(mine).toMatchObject({
      timeZone: 'Europe/London',
      recordsPerPage: 100,
      defaultCountry: 'US',
    });
    const theirs = (
      await settings('get', '/effective', undefined, member.cookie)
    ).body.data;
    expect(theirs).toMatchObject({
      timeZone: 'America/New_York',
      recordsPerPage: 25,
    });
  });

  it('AC02: refuses non-overridable settings and bad values; null returns the tenant value', async () => {
    const refuse = async body =>
      (await settings('patch', '/profile', body)).body.error.code;
    expect(
      await refuse({ overrides: { defaultCountry: 'GB' }, revision: 1 })
    ).toBe('INVALID_INPUT');
    expect(await refuse({ overrides: { currency: 'EUR' }, revision: 1 })).toBe(
      'INVALID_INPUT'
    );
    expect(
      await refuse({ overrides: { recordsPerPage: 30 }, revision: 1 })
    ).toBe('INVALID_INPUT');
    expect(await refuse({ overrides: { timeZone: 'UTC' }, revision: 0 })).toBe(
      'STALE_REVISION'
    );
    const reset = await settings('patch', '/profile', {
      overrides: { timeZone: null },
      revision: 1,
    });
    expect(reset.body.data.overrides).toEqual({ recordsPerPage: 100 });
    expect((await settings('get', '/effective')).body.data.timeZone).toBe(
      'America/New_York'
    );
  });

  it('AC07: each member reads and changes only their own profile', async () => {
    const theirs = await settings('get', '/profile', undefined, member.cookie);
    expect(theirs.body.data.revision).toBe(0);
    const saved = await settings(
      'patch',
      '/profile',
      { overrides: { dateFormat: 'YYYY-MM-DD' }, revision: 0 },
      member.cookie
    );
    expect(saved.body.data.overrides).toEqual({ dateFormat: 'YYYY-MM-DD' });
    const mine = (await settings('get', '/profile')).body.data;
    expect(mine.overrides).toEqual({ recordsPerPage: 100 });
    expect(mine.revision).toBe(2);
    expect((await settings('get', `/profile/${member.memberId}`)).status).toBe(
      404
    );
    const rows = await cell.tx(async tx => {
      await setTenant(tx, napsoft.id);
      return tx.any('SELECT membership_id FROM app.member_profiles');
    });
    expect(rows.map(r => r.membership_id)).toContain(member.memberId);
    expect(rows).toHaveLength(2);
  });

  it('AC04: with no storage, uploads are refused and default images work', async () => {
    expect((await uploadProfileImage(png())).body.error.code).toBe(
      'STORAGE_NOT_CONFIGURED'
    );
    const chosen = await settings('patch', '/profile', {
      defaultImage: 'orbit',
      revision: 2,
    });
    expect(chosen.body.data.defaultImage).toBe('orbit');
    expect(
      (await settings('get', '/effective')).body.data.profileImage
    ).toEqual({ defaultImage: 'orbit' });
    expect(
      (
        await settings('patch', '/profile', {
          defaultImage: 'unknown',
          revision: 3,
        })
      ).body.error.code
    ).toBe('INVALID_INPUT');
  });

  it('AC03, R005: uploads, replaces, and removes an uploaded image, deleting old objects', async () => {
    const { revision } = (
      await settings('put', '/storage', {
        ...CONNECTION,
        secretAccessKey: 'bucket-secret',
        revision: null,
      })
    ).body.data;
    expect(revision).toBe(1);
    const first = await uploadProfileImage(png(100));
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    expect(first.body.data.defaultImage).toBeNull();
    const firstId = first.body.data.imageFileId;
    const firstKey = `acme-files/${napsoft.id}/profile_image/${firstId}`;
    expect(bucket.objects.has(firstKey)).toBe(true);
    expect(
      (await settings('get', '/effective')).body.data.profileImage
    ).toEqual({ fileId: firstId });
    // Any member gets a signed link to another member's image (§4).
    expect(
      (
        await settings(
          'get',
          `/files/${firstId}/link`,
          undefined,
          member.cookie
        )
      ).status
    ).toBe(200);

    const second = await uploadProfileImage(png(120));
    const secondId = second.body.data.imageFileId;
    expect(bucket.objects.has(firstKey)).toBe(false);

    const toDefault = await settings('patch', '/profile', {
      defaultImage: 'wave',
      revision: second.body.data.revision,
    });
    expect(toDefault.body.data).toMatchObject({
      defaultImage: 'wave',
      imageFileId: null,
    });
    expect(
      bucket.objects.has(`acme-files/${napsoft.id}/profile_image/${secondId}`)
    ).toBe(false);

    const third = await uploadProfileImage(png(140));
    const thirdId = third.body.data.imageFileId;
    expect(third.body.data.defaultImage).toBeNull();
    const removed = await settings('delete', '/profile/image');
    expect(removed.body.data.imageFileId).toBeNull();
    expect(
      bucket.objects.has(`acme-files/${napsoft.id}/profile_image/${thirdId}`)
    ).toBe(false);
    expect((await settings('delete', '/profile/image')).body.error.code).toBe(
      'NOT_FOUND'
    );
    expect(
      (await settings('get', '/effective')).body.data.profileImage
    ).toBeNull();
    const archived = await cell.tx(async tx => {
      await setTenant(tx, napsoft.id);
      return tx.one(
        "SELECT count(*)::int AS n FROM app.files WHERE purpose = 'profile_image' AND deactivated_at IS NOT NULL"
      );
    });
    expect(archived.n).toBe(3);
  });

  it('AC04: after disconnecting, an uploaded image is not offered', async () => {
    const uploaded = await uploadProfileImage(png(160));
    expect(uploaded.status).toBe(200);
    const { revision } = (await settings('get', '/storage')).body.data;
    await settings('delete', `/storage?revision=${revision}`);
    expect(
      (await settings('get', '/effective')).body.data.profileImage
    ).toBeNull();
  });

  it('the database refuses a profile pointing at a logo or another tenant member', async () => {
    const logo = await cell.tx(async tx => {
      await setTenant(tx, napsoft.id);
      return tx.one(
        "SELECT id FROM app.files WHERE purpose = 'logo' ORDER BY created_at LIMIT 1"
      );
    });
    const attempt = sql =>
      cell
        .tx(async tx => {
          await setTenant(tx, napsoft.id);
          await tx.none(sql, [logo.id, member.memberId, randomUUID()]);
        })
        .then(
          () => null,
          error => error.code
        );
    expect(
      await attempt(
        'UPDATE app.member_profiles SET image_file_id = $1, default_image = NULL WHERE membership_id = $2'
      )
    ).toBe('23503');
    expect(
      await attempt(
        "INSERT INTO app.member_profiles (membership_id, tenant_id) VALUES ($3, current_setting('nap.tenant_id')::uuid)"
      )
    ).toBe('23503');
    expect(
      await attempt(
        "UPDATE app.member_profiles SET default_image = 'orbit', image_file_id = $1 WHERE membership_id = $2"
      )
    ).toMatch(/^23/);
  });
});
