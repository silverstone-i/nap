

'use strict';

/*
 * Copyright © 2024-present, Ian Silverstone
 *
 * See the LICENSE file at the top-level directory of this distribution
 * for licensing information.
 *
 * Removal or modification of this copyright notice is prohibited.
 */

import { runExtendedCrudTests } from '../../util/runExtendedCrudTests.js';
import { db } from '../../../src/db/db.js';

const tenant_id = '00000000-0000-4000-a000-000000000001';

export const setupTestDependencies = async () => {
  const mailing = await db.addresses.insert({
    tenant_id,
    street: '123 Main St',
    city: 'Testville',
    state: 'TS',
    postal_code: '12345',
    country: 'USA',
    created_by: 'integration-test',
  });

  const physical = await db.addresses.insert({
    tenant_id,
    street: '456 Market St',
    city: 'Biztown',
    state: 'BT',
    postal_code: '67890',
    country: 'USA',
    created_by: 'integration-test',
  });

  const acctContact = await db.contacts.insert({
    tenant_id,
    first_name: 'Alice',
    last_name: 'Accountant',
    email: 'acct@example.com',
    phone: '111-111-1111',
    created_by: 'integration-test',
  });

  const salesContact = await db.contacts.insert({
    tenant_id,
    first_name: 'Sam',
    last_name: 'Sales',
    email: 'sales@example.com',
    phone: '222-222-2222',
    created_by: 'integration-test',
  });

  return { mailing, physical, acctContact, salesContact };
};

export const cleanupTestDependencies = async () => {
  const all = await db.vendors.findAll();
  for (const row of all) await db.vendors.delete(row.id);

  const contacts = await db.contacts.findAll();
  for (const row of contacts) await db.contacts.delete(row.id);

  const addresses = await db.addresses.findAll();
  for (const row of addresses) await db.addresses.delete(row.id);
};

const routePrefix = '/api/core/v1/vendors';

const testContext = {};

await runExtendedCrudTests({
  routePrefix,
  testRecord: () => ({
    tenant_id,
    vendor_code: 'VN-001',
    name: 'Test Vendor Inc.',
    tax_id: '123-45-6789',
    mailing_address_id: testContext.mailing.id,
    physical_address_id: testContext.physical.id,
    accounting_contact_id: testContext.acctContact.id,
    sales_contact_id: testContext.salesContact.id,
    created_by: 'integration-test',
  }),
  updateField: 'tax_id',
  updateValue: '987-65-4321',
  beforeHook: async () => {
    const deps = await setupTestDependencies();
    Object.assign(testContext, deps);
  },
  afterHook: cleanupTestDependencies,
});