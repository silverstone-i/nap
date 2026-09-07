/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { frameworkDatabase } from '../fixtures/frameworkDatabase.js';
import { registerTenantIsolationSuite } from '../fixtures/tenantIsolationHarness.js';
import type { IsolationOperations } from '../fixtures/tenantIsolationHarness.js';
import type { FixtureRepositories } from '../fixtures/frameworkApp.js';

const operations: IsolationOperations<FixtureRepositories> = {
  read: tx => tx.records.findAll(),
  insert: (tx, tenant_id, id, code) =>
    tx.records.insert({ id, tenant_id, code, name: code }),
  update: (tx, id) => tx.records.update(id, { name: 'updated' }),
  remove: (tx, id) => tx.records.delete(id),
  relate: (tx, tenant_id, id, parent_id) =>
    tx.records.insert({
      id,
      tenant_id,
      parent_id,
      code: id.slice(0, 16),
      name: id,
    }),
};

let context: Awaited<ReturnType<typeof frameworkDatabase>> | undefined;
registerTenantIsolationSuite('framework record', {
  setup: async () => {
    context = await frameworkDatabase();
    return context.db;
  },
  cleanup: async () => {
    await context?.cleanup();
  },
  operations,
});
