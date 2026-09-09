/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { authDatabase } from '../fixtures/authDatabase.js';
import { registerTenantIsolationSuite } from '../fixtures/tenantIsolationHarness.js';
let context: Awaited<ReturnType<typeof authDatabase>> | undefined;
registerTenantIsolationSuite('tenant cache revisions', {
  setup: async () => {
    context = await authDatabase();
    // DELETE is granted only in this disposable fixture to exercise the RLS filter.
    await context.fixture
      .owner(context.fixture.cellUrl)
      .none('GRANT DELETE ON cell.cache_revisions TO $1:name', [
        context.fixture.role,
      ]);
    return context.cell;
  },
  cleanup: async () => {
    await context?.cleanup();
  },
  operations: {
    read: tx =>
      tx.any<{ id: string }>(
        'SELECT tenant_id AS id FROM cell.cache_revisions'
      ),
    insert: (tx, tenant) =>
      tx.one<{ id: string }>(
        'INSERT INTO cell.cache_revisions(tenant_id) VALUES($1) RETURNING tenant_id AS id',
        [tenant]
      ),
    update: (tx, id) =>
      tx.oneOrNone<{ id: string }>(
        'UPDATE cell.cache_revisions SET revision=gen_random_uuid() WHERE tenant_id=$1 RETURNING tenant_id AS id',
        [id]
      ),
    remove: async (tx, id) =>
      (
        await tx.any(
          'DELETE FROM cell.cache_revisions WHERE tenant_id=$1 RETURNING tenant_id',
          [id]
        )
      ).length,
  },
});
