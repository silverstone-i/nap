/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { authDatabase, authEnv } from '../fixtures/authDatabase.js';
import {
  bootstrapRoot,
  bootstrapConfiguration,
} from '../../src/services/bootstrap.js';
import {
  claimOperatorCell,
  completeOperatorBootstrap,
  operatorBootstrapOverview,
  retryOperatorBootstrap,
} from '../../src/services/operatorBootstrap.js';
import { withAdminTransaction } from '../../src/db/withAdminTransaction.js';
import { withTenantTransaction } from '../../src/db/withTenantTransaction.js';
import { randomUUID } from 'node:crypto';

let test: Awaited<ReturnType<typeof authDatabase>>;
beforeEach(async () => {
  test = await authDatabase(false);
}, 30000);
afterEach(async () => {
  await test?.cleanup();
}, 30000);
/** Does: Reads saved setup progress from the disposable database. Called by: bootstrap assertions. */
function progress() {
  return withAdminTransaction(test.admin, operatorBootstrapOverview);
}
/** Does: Claims the fixture's ready database. Called by: bootstrap test setup. */
function claim() {
  return withAdminTransaction(test.admin, tx =>
    claimOperatorCell(tx, test.cellId)
  );
}

it('completes greenfield root setup with roles, isolated projections and unchanged credentials', async () => {
  const before = await test.admin.db.portal_users.findById(test.root.actorId);
  expect(await progress()).toMatchObject({ status: 'waiting', cell_id: null });
  await claim();
  await completeOperatorBootstrap(test.admin, test.cells);
  expect(await progress()).toMatchObject({
    status: 'completed',
    cell_id: test.cellId,
  });
  expect(
    await test.admin.db.tenants.findById(test.root.tenantId)
  ).toMatchObject({ provisioned: true, rbac_ready: true });
  expect(await test.admin.db.portal_users.findById(test.root.actorId)).toEqual(
    before
  );
  await withTenantTransaction(test.cell, test.root.tenantId, async tx => {
    expect(await tx.employees.findWhere({})).toHaveLength(0);
    expect(await tx.tenant_user_bindings.findWhere({})).toHaveLength(1);
    expect(await tx.role_assignments.findWhere({})).toHaveLength(1);
  });
  await withTenantTransaction(test.cell, randomUUID(), async tx => {
    expect(await tx.tenant_user_bindings.findWhere({})).toHaveLength(0);
    expect(await tx.role_assignments.findWhere({})).toHaveLength(0);
  });
});

it('preserves completed records on bootstrap and worker reruns', async () => {
  await claim();
  await completeOperatorBootstrap(test.admin, test.cells);
  const tables = [
    'tenants',
    'portal_users',
    'portal_user_tenants',
    'operator_bootstrap',
    'platform_roles',
    'managed_events',
  ];
  const snapshot = async () =>
    Promise.all(
      tables.map(table =>
        test.owner.any('SELECT * FROM admin.$1:name', [table])
      )
    );
  const before = await snapshot();
  await bootstrapRoot(test.admin, bootstrapConfiguration(authEnv, []));
  await completeOperatorBootstrap(test.admin, test.cells);
  expect(await snapshot()).toEqual(before);
});

it('does not enroll an existing installation when bootstrap runs again', async () => {
  await test.owner.none('DELETE FROM admin.operator_bootstrap');
  await bootstrapRoot(test.admin, bootstrapConfiguration(authEnv, []));
  await claim();
  expect(await progress()).toBeNull();
  expect(
    await test.admin.db.tenants.findById(test.root.tenantId)
  ).toMatchObject({ cell_id: null, provisioned: false });
});

it('claims only a successful cell and keeps the first selection under duplicate claims', async () => {
  const failed = await test.admin.db.cells.insert({
    database_name: 'failed',
    enabled: false,
  });
  await expect(
    withAdminTransaction(test.admin, tx => claimOperatorCell(tx, failed.id))
  ).rejects.toThrow();
  expect(await progress()).toMatchObject({ status: 'waiting' });
  await Promise.all([claim(), claim()]);
  const later = await test.admin.db.cells.insert({
    database_name: 'later',
    enabled: true,
  });
  await withAdminTransaction(test.admin, tx => claimOperatorCell(tx, later.id));
  expect(await progress()).toMatchObject({ cell_id: test.cellId });
});

it('retains a ready cell after post-write failure and retries the same operation safely', async () => {
  await claim();
  await test.owner
    .none(`CREATE FUNCTION admin.fail_bootstrap_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event='operator-bootstrap-completed' THEN RAISE EXCEPTION 'fixture failure'; END IF; RETURN NEW; END $$;
CREATE TRIGGER fail_bootstrap BEFORE INSERT ON admin.managed_events FOR EACH ROW EXECUTE FUNCTION admin.fail_bootstrap_event()`);
  await completeOperatorBootstrap(test.admin, test.cells);
  const failed = await progress();
  expect(failed).toMatchObject({
    status: 'failed',
    cell_id: test.cellId,
    failure_code: 'OPERATOR_BOOTSTRAP_FAILED',
  });
  expect(await test.admin.db.cells.findById(test.cellId)).toMatchObject({
    enabled: true,
  });
  expect(
    await test.admin.db.tenants.findById(test.root.tenantId)
  ).toMatchObject({ provisioned: false, rbac_ready: false });
  await test.owner.none('DROP TRIGGER fail_bootstrap ON admin.managed_events');
  await expect(
    withAdminTransaction(test.admin, tx =>
      retryOperatorBootstrap(tx, randomUUID(), failed!.id)
    )
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await withAdminTransaction(test.admin, tx =>
    retryOperatorBootstrap(tx, test.root.actorId, failed!.id)
  );
  await Promise.all([
    completeOperatorBootstrap(test.admin, test.cells),
    completeOperatorBootstrap(test.admin, test.cells),
  ]);
  expect(await progress()).toMatchObject({
    id: failed!.id,
    status: 'completed',
    cell_id: test.cellId,
  });
});

it('resumes interrupted saved work without choosing another cell', async () => {
  await claim();
  await test.owner.none("UPDATE admin.operator_bootstrap SET status='running'");
  await completeOperatorBootstrap(test.admin, test.cells);
  expect(await progress()).toMatchObject({
    status: 'completed',
    cell_id: test.cellId,
  });
});

it('publishes running progress before cell writes and excludes concurrent execution', async () => {
  await claim();
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const transaction = test.cell.transaction.bind(test.cell);
  const spy = vi
    .spyOn(test.cell, 'transaction')
    .mockImplementationOnce(async work => {
      entered.resolve();
      await release.promise;
      return transaction(work);
    });
  const completion = completeOperatorBootstrap(test.admin, test.cells);
  try {
    await entered.promise;
    expect(await progress()).toMatchObject({
      status: 'running',
      cell_id: test.cellId,
    });
    await completeOperatorBootstrap(test.admin, test.cells);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await progress()).toMatchObject({ status: 'running' });
  } finally {
    release.resolve();
    await completion;
    spy.mockRestore();
  }
  expect(await progress()).toMatchObject({
    status: 'completed',
    cell_id: test.cellId,
  });
});
