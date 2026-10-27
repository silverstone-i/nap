/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { using } from '../../src/infrastructure/runtime/adminDatabase.js';
import { createCellDatabase } from '../../src/infrastructure/runtime/cellDatabase.js';
import { setupLocal } from '../../src/infrastructure/provisioning/postgres.js';
import { migrateCell } from '../../src/application/maintenance/migrateCell.js';
import { verifyAppSchema } from '../../src/modules/access-control/schema/verify.js';
import { setTenant } from '../../src/infrastructure/runtime/tenantTransaction.js';
import { seedReferenceData } from '../../src/modules/reference-data/seeds/referenceSeed.js';
import { cellModules } from '../../src/modules/cell.js';
import { roleUrl } from '../../src/application/shared/configuration.js';

const fixture = process.env.FOUNDATION_TEST_URL;
if (!fixture)
  throw new Error(
    'FOUNDATION_TEST_URL must identify a disposable PostgreSQL 18 server'
  );
const url = new URL(fixture);
const name = 'nap_bd_test_' + randomUUID().replaceAll('-', '');
const config = {
  database: name,
  environment: 'test',
  endpoint: url.host + '/' + name,
  maintenance: url.host + '/postgres',
  adminPassword: 'foundation-admin',
  appPassword: 'foundation-app',
};
const tenant = randomUUID();
const other = randomUUID();
const HASH = 'a'.repeat(64);
let handle, app;

const TABLES = [
  'addresses',
  'contact_labels',
  'contact_methods',
  'organizations',
  'parties',
  'people',
  'tax_id_formats',
];

/** Run `operation` as `nap-app` in a transaction scoped to `tenantId`. */
function inTenant(tenantId, operation) {
  return app.db.tx(async tx => {
    if (tenantId) await setTenant(tx, tenantId);
    return operation(tx);
  });
}

/** Insert a tax ID format and return its ID. */
async function taxIdFormat(tx, tenantId = tenant, name = 'SSN') {
  return (
    await tx.one(
      "INSERT INTO app.tax_id_formats (tenant_id, country, name, mask) VALUES ($1, 'US', $2, '###-##-####') RETURNING id",
      [tenantId, name]
    )
  ).id;
}

/** Insert a party and return its ID. */
async function party(tx, kind, tenantId = tenant) {
  return (
    await tx.one(
      'INSERT INTO app.parties (tenant_id, kind) VALUES ($1, $2) RETURNING id',
      [tenantId, kind]
    )
  ).id;
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
  expect((await migrateCell(config)).status).toBe('applied');
  handle = createCellDatabase(
    roleUrl(config.endpoint, 'nap-admin', config.adminPassword)
  );
  app = createCellDatabase(
    roleUrl(config.endpoint, 'nap-app', config.appPassword)
  );
  await handle.connect();
  await app.connect();
  await seedReferenceData(handle.db);
}, 30000);

afterAll(async () => {
  await app?.close();
  await handle?.close();
  await using(fixture, tx =>
    tx.none('DROP DATABASE IF EXISTS $1:name WITH (FORCE)', [name])
  );
});

it('AC01: creates the seven directory tables with unforced tenant RLS; the app schema verifies; reruns are no-ops', async () => {
  const tables = await handle.db.any(
    `SELECT c.relname AS name,c.relrowsecurity AS rls,c.relforcerowsecurity AS force
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='app' AND c.relkind='r' AND c.relname = ANY($1)
      ORDER BY c.relname`,
    [TABLES]
  );
  expect(tables).toEqual(
    TABLES.map(t => ({ name: t, rls: true, force: false }))
  );
  await verifyAppSchema(handle, cellModules);
  expect((await migrateCell(config)).status).toBe('unchanged');
});

it('hides other tenants and rejects writes with no tenant setting', async () => {
  const mine = await inTenant(tenant, tx => party(tx, 'contact'));
  await inTenant(other, tx => party(tx, 'contact', other));
  expect(
    await inTenant(tenant, tx =>
      tx.map('SELECT id FROM app.parties', [], r => r.id)
    )
  ).toContain(mine);
  expect(
    await inTenant(null, tx => tx.any('SELECT id FROM app.parties'))
  ).toEqual([]);
  await expect(inTenant(null, tx => party(tx, 'contact'))).rejects.toThrow();
  await expect(
    inTenant(tenant, tx => party(tx, 'contact', other))
  ).rejects.toThrow();
});

it('rejects an unknown kind, a changed kind, and a child pointing at another tenant', async () => {
  await expect(
    inTenant(tenant, tx => party(tx, 'robot'))
  ).rejects.toMatchObject({ code: '23514' });
  const id = await inTenant(tenant, tx => party(tx, 'employee'));
  await expect(
    inTenant(tenant, tx =>
      tx.none("UPDATE app.parties SET kind='contact' WHERE id=$1", [id])
    )
  ).rejects.toMatchObject({ code: '23514' });
  const foreign = await inTenant(other, tx => party(tx, 'employee', other));
  await expect(
    inTenant(tenant, tx =>
      tx.none(
        "INSERT INTO app.people (party_id, tenant_id, first_name, last_name) VALUES ($1,$2,'A','B')",
        [foreign, tenant]
      )
    )
  ).rejects.toThrow();
});

it('stores the four tax ID columns together on the party, never on a vendor contact, and requires an organization for a primary tax contact', async () => {
  await inTenant(tenant, async tx => {
    const id = await party(tx, 'employee');
    await expect(
      tx.none('UPDATE app.parties SET tax_id_hash=$2 WHERE id=$1', [id, HASH])
    ).rejects.toMatchObject({ code: '23514' });
  });
  await inTenant(tenant, async tx => {
    const id = await party(tx, 'vendor_contact');
    await expect(
      tx.none(
        "UPDATE app.parties SET tax_id_format_id=$3, tax_id_encrypted='x', tax_id_hash=$2, tax_id_last4='1234' WHERE id=$1",
        [id, HASH, await taxIdFormat(tx, tenant, 'Vendor contact')]
      )
    ).rejects.toMatchObject({ code: '23514' });
  });
  await inTenant(tenant, async tx => {
    const id = await party(tx, 'contact');
    await expect(
      tx.none(
        "INSERT INTO app.people (party_id, tenant_id, first_name, last_name, is_primary_tax_contact) VALUES ($1,$2,'A','B',true)",
        [id, tenant]
      )
    ).rejects.toMatchObject({ code: '23514' });
  });
});

it('ties a tax ID to a format of its own tenant, with uppercase letters or digits as its last four (M0005-R036, R038)', async () => {
  const set = (tx, id, format, last4, hash = HASH) =>
    tx.none(
      "UPDATE app.parties SET tax_id_format_id=$2, tax_id_encrypted='x', tax_id_hash=$3, tax_id_last4=$4 WHERE id=$1",
      [id, format, hash, last4]
    );
  await inTenant(tenant, async tx => {
    const format = await taxIdFormat(tx, tenant, 'Letters');
    const id = await party(tx, 'employee');
    await set(tx, id, format, '12AB');
    await expect(tx.tx(t => set(t, id, format, '12ab'))).rejects.toMatchObject({
      code: '23514',
    });
    await expect(
      tx.tx(t =>
        t.none('UPDATE app.parties SET tax_id_format_id=NULL WHERE id=$1', [id])
      )
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      tx.tx(t => taxIdFormat(t, tenant, 'Letters'))
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      tx.tx(t =>
        t.none(
          "INSERT INTO app.tax_id_formats (tenant_id, country, name, mask) VALUES ($1, 'ZZ', 'X', '####')",
          [tenant]
        )
      )
    ).rejects.toMatchObject({ code: '23503' });
  });
  const foreign = await inTenant(other, tx => taxIdFormat(tx, other, 'Other'));
  await expect(
    inTenant(tenant, async tx =>
      // Another number, so the per-kind unique index (R047) stays out of it.
      set(tx, await party(tx, 'employee'), foreign, '1234', 'f'.repeat(64))
    )
  ).rejects.toMatchObject({ code: '23503' });
});

it('allows a tax ID once per tenant and kind, except for client contacts (M0005-R047)', async () => {
  const hash = 'e'.repeat(64);
  const set = (tx, id, format) =>
    tx.none(
      "UPDATE app.parties SET tax_id_format_id=$2, tax_id_encrypted='x', tax_id_hash=$3, tax_id_last4='1234' WHERE id=$1",
      [id, format, hash]
    );
  await inTenant(tenant, async tx => {
    const format = await taxIdFormat(tx, tenant, 'Unique');
    await set(tx, await party(tx, 'vendor'), format);
    await expect(
      tx.tx(async t => set(t, await party(t, 'vendor'), format))
    ).rejects.toMatchObject({ code: '23505' });
    // Another kind, and client contacts, may share it.
    await set(tx, await party(tx, 'client'), format);
    await set(tx, await party(tx, 'client_contact'), format);
    await set(tx, await party(tx, 'client_contact'), format);
  });
});

it('AC04, AC05: allows one active primary tax contact per client and one primary email, phone, and address per party', async () => {
  await inTenant(tenant, async tx => {
    const client = await party(tx, 'client');
    await tx.none(
      "INSERT INTO app.organizations (party_id, tenant_id, legal_name) VALUES ($1,$2,'Lot 14')",
      [client, tenant]
    );
    const format = await taxIdFormat(tx, tenant, 'Buyer');
    const insertBuyer = async name => {
      const id = await party(tx, 'client_contact');
      await tx.none(
        "UPDATE app.parties SET tax_id_format_id=$3, tax_id_encrypted='x', tax_id_hash=$2, tax_id_last4='1234' WHERE id=$1",
        [id, HASH, format]
      );
      await tx.none(
        "INSERT INTO app.people (party_id, tenant_id, organization_id, first_name, last_name, is_primary_tax_contact) VALUES ($1,$2,$3,$4,'Smith',true)",
        [id, tenant, client, name]
      );
    };
    await insertBuyer('Ann');
    await expect(tx.tx(() => insertBuyer('Tom'))).rejects.toMatchObject({
      code: '23505',
    });
  });
  await inTenant(tenant, async tx => {
    const person = await party(tx, 'contact');
    await tx.none(
      "INSERT INTO app.people (party_id, tenant_id, first_name, last_name) VALUES ($1,$2,'Bob','Lee')",
      [person, tenant]
    );
    const method = (type, value) =>
      tx.none(
        'INSERT INTO app.contact_methods (tenant_id, party_id, type, value, is_primary) VALUES ($1,$2,$3,$4,true)',
        [tenant, person, type, value]
      );
    await method('email', 'bob@city.test');
    await method('phone', '+15125550100');
    await expect(
      tx.tx(() => method('email', 'bob2@city.test'))
    ).rejects.toMatchObject({ code: '23505' });
    const address = line1 =>
      tx.none(
        "INSERT INTO app.addresses (tenant_id, party_id, line1, city, country, is_primary) VALUES ($1,$2,$3,'Austin','US',true)",
        [tenant, person, line1]
      );
    await address('1 Oak St');
    await expect(tx.tx(() => address('2 Oak St'))).rejects.toMatchObject({
      code: '23505',
    });
    await expect(
      tx.tx(() =>
        tx.none(
          "INSERT INTO app.addresses (tenant_id, party_id, line1, city, country) VALUES ($1,$2,'3 Oak St','Austin','ZZ')",
          [tenant, person]
        )
      )
    ).rejects.toMatchObject({ code: '23503' });
  });
});

it('allows primary and billing flags only on organization contacts, several per organization', async () => {
  await inTenant(tenant, async tx => {
    const vendor = await party(tx, 'vendor');
    await tx.none(
      "INSERT INTO app.organizations (party_id, tenant_id, legal_name) VALUES ($1,$2,'Flag Supply')",
      [vendor, tenant]
    );
    for (const name of ['Rita', 'Sam']) {
      const id = await party(tx, 'vendor_contact');
      await tx.none(
        "INSERT INTO app.people (party_id, tenant_id, organization_id, first_name, last_name, is_primary_contact, is_billing_contact) VALUES ($1,$2,$3,$4,'Moss',true,true)",
        [id, tenant, vendor, name]
      );
    }
    const employee = await party(tx, 'employee');
    await expect(
      tx.tx(() =>
        tx.none(
          "INSERT INTO app.people (party_id, tenant_id, first_name, last_name, is_billing_contact) VALUES ($1,$2,'Jane','Doe',true)",
          [employee, tenant]
        )
      )
    ).rejects.toMatchObject({ code: '23514' });
  });
});
