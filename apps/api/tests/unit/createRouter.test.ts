/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { expect, it } from 'vitest';
import { z } from 'zod';
import { QueryModel } from 'pg-schemata';
import { createAdminDatabase } from '../../src/db/admin/index.js';
import { createCellDatabase } from '../../src/db/cell/index.js';
import {
  createRouter,
  standardActions,
} from '../../src/framework/createRouter.js';
import { WriteController } from '../../src/framework/WriteController.js';
import { describeModel } from '../../src/framework/modelContract.js';
import {
  RecordsController,
  RecordsReadController,
} from '../fixtures/frameworkApp.js';
import {
  FrameworkRecords,
  frameworkRecordSchema,
} from '../fixtures/frameworkRecord.js';
import { AdminRecords } from '../fixtures/adminRecord.js';
import { IsolationProbe } from '../fixtures/isolationProbe.js';
import type { Router } from 'express';
import type { DbConnection, Database } from 'pg-schemata';
import type { ProbeRow } from '../fixtures/isolationProbe.js';

/** Does: A read-only projection over the framework test table. */
class RecordsView extends QueryModel<ProbeRow> {
  constructor(db: DbConnection, pgp: Database['pgp']) {
    super(db, pgp, frameworkRecordSchema);
  }
}

const db = createCellDatabase('postgres://unused:unused@localhost/unused', {
  repositories: {
    records: FrameworkRecords,
    probe: IsolationProbe,
    view: RecordsView,
  },
});
const adminDb = createAdminDatabase(
  'postgres://unused:unused@localhost/unused',
  { repositories: { records: AdminRecords, tenantRecords: FrameworkRecords } }
);
const cell = { target: 'cell', handle: db } as const;
const options = { module: 'fixture', router: 'records' } as const;

/** Does: A writable controller over the admin framework test table. */
class AdminRecordsController extends WriteController<
  'records',
  { records: AdminRecords; tenantRecords: FrameworkRecords }
> {}

/** Does: Lists a router's routes as "method path" in registration order. */
function routesOf(router: Router) {
  return router.stack.flatMap(layer =>
    layer.route ? [`${layer.route.stack[0]?.method} ${layer.route.path}`] : []
  );
}

/** Does: Counts the handlers, gates included, behind each route. */
function chainLengths(router: Router) {
  return Object.fromEntries(
    router.stack.flatMap(layer =>
      layer.route
        ? [
            [
              `${layer.route.stack[0]?.method} ${layer.route.path}`,
              layer.route.stack.length,
            ],
          ]
        : []
    )
  );
}

/** Does: Builds an extension spec with the given action, path, and access. */
function extension(
  action: string,
  path: string,
  access?: 'anonymous' | 'authenticated'
) {
  return {
    action,
    method: 'get',
    path,
    ...(access ? { access } : {}),
    body: z.undefined(),
    query: z.strictObject({}),
    params: z.strictObject({}),
    response: z.strictObject({ version: z.literal(1), data: z.number() }),
    operation: () => Promise.resolve(1),
  } as const;
}

it('registers the standard set with static paths first and the read route last', () => {
  expect(routesOf(createRouter(new RecordsController(db), options))).toEqual([
    'get /',
    'post /',
    'post /bulk-insert',
    'put /update',
    'put /bulk-update',
    'delete /archive',
    'patch /restore',
    'post /import-xls',
    'post /export-xls',
    'get /:id',
  ]);
  expect(standardActions).toHaveLength(10);
});

it('registers only read routes for a read controller and skips disabled ones', () => {
  expect(
    routesOf(createRouter(new RecordsReadController(db), options))
  ).toEqual(['get /', 'post /export-xls', 'get /:id']);
  expect(
    routesOf(
      createRouter(new RecordsController(db), {
        ...options,
        routes: { 'export-xls': false, 'bulk-insert': false, read: false },
      })
    )
  ).toEqual([
    'get /',
    'post /',
    'put /update',
    'put /bulk-update',
    'delete /archive',
    'patch /restore',
    'post /import-xls',
  ]);
});

it('places extension routes before the read route and refuses collisions', () => {
  const summary = {
    action: 'summary',
    method: 'get',
    path: '/summary',
    body: z.undefined(),
    query: z.strictObject({}),
    params: z.strictObject({}),
    response: z.strictObject({ version: z.literal(1), data: z.number() }),
    operation: () => Promise.resolve(1),
  } as const;
  expect(
    routesOf(
      createRouter(new RecordsController(db), {
        ...options,
        extend: add => add(summary),
      })
    ).slice(-2)
  ).toEqual(['get /summary', 'get /:id']);
  for (const spec of [
    { ...summary, action: 'list' },
    { ...summary, action: 'a', path: '/bulk-insert', method: 'post' },
    { ...summary, action: 'a', path: '/:tenantId/x' },
  ] as const) {
    expect(() =>
      createRouter(new RecordsController(db), {
        ...options,
        extend: add => add(spec),
      })
    ).toThrow();
  }
  expect(() =>
    createRouter(new RecordsController(db), {
      ...options,
      extend: add => {
        add(summary);
        add({ ...summary, path: '/other' });
      },
    })
  ).toThrow('Duplicate route action');
});

it('refuses a disagreeing rbacConfig and a non-soft-deleting archive, and describes models', () => {
  expect(() =>
    createRouter(new RecordsController(db), {
      module: 'other',
      router: 'records',
    })
  ).toThrow('rbacConfig');
  expect(
    chainLengths(createRouter(new RecordsController(db), options))['get /']
  ).toBe(7);
  class ProbeWrite extends WriteController<'probe'> {}
  const probeRoutes = routesOf(
    createRouter(new ProbeWrite(db, 'probe'), {
      module: 'fixture',
      router: 'probe',
    })
  );
  expect(probeRoutes).not.toContain('delete /archive');
  expect(probeRoutes).toContain('post /');
  expect(() =>
    createRouter(new ProbeWrite(db, 'probe'), {
      module: 'fixture',
      router: 'probe',
      routes: { archive: true },
    })
  ).toThrow('soft-delete');
  expect(describeModel(cell, 'records')).toMatchObject({
    target: 'cell',
    primaryKey: 'id',
    softDelete: true,
    writable: true,
  });
  expect(describeModel(cell, 'probe').softDelete).toBe(false);
});

it("checks a projection's columns against its declared item schema", () => {
  expect(() => describeModel(cell, 'view')).toThrow('no item schema');
  const item = z.object({ id: z.guid(), quantity: z.number().nullable() });
  const contract = describeModel(cell, 'view', item);
  expect(contract.writable).toBe(false);
  expect(contract.columnSchema('id').safeParse('not-a-uuid').success).toBe(
    false
  );
  expect(contract.columnSchema('quantity').safeParse('7').success).toBe(false);
  expect(contract.columnSchema('code').safeParse('anything').success).toBe(
    true
  );
  const generated = describeModel(cell, 'records');
  expect(generated.columnSchema('quantity').safeParse('7').success).toBe(false);
  expect(generated.columnSchema('id').safeParse('not-a-uuid').success).toBe(
    false
  );
});

it('binds a controller to the admin pool and drops the tenant requirement there', () => {
  const controller = new AdminRecordsController(adminDb, 'records');
  expect(controller.binding.target).toBe('admin');
  expect(new RecordsController(db).binding.target).toBe('cell');
  const admin = { target: 'admin', handle: adminDb } as const;
  expect(describeModel(admin, 'records')).toMatchObject({
    target: 'admin',
    writable: true,
    softDelete: true,
  });
  expect(describeModel(admin, 'records').managed.has('tenant_id')).toBe(false);
  // A central table may carry tenant_id as an ordinary column.
  expect(describeModel(admin, 'tenantRecords').managed.has('tenant_id')).toBe(
    false
  );
  expect(() =>
    describeModel(
      {
        target: 'cell',
        handle: createCellDatabase('postgres://u:u@h/d', {
          repositories: { records: AdminRecords },
        }),
      },
      'records'
    )
  ).toThrow('not tenant-owned');
  expect(
    routesOf(
      createRouter(controller, { module: 'admin-tenancy', router: 'records' })
    )
  ).toContain('post /');
});

it('registers declared access only on the admin-tenancy auth router, with the gates it allows', () => {
  const auth = { module: 'admin-tenancy', router: 'auth' } as const;
  const router = createRouter(new AdminRecordsController(adminDb, 'records'), {
    ...auth,
    routes: Object.fromEntries(standardActions.map(action => [action, false])),
    extend: add => {
      add(extension('login', '/login', 'anonymous'));
      add(extension('session', '/session', 'authenticated'));
      add(extension('summary', '/summary'));
    },
  });
  expect(routesOf(router)).toEqual([
    'get /login',
    'get /session',
    'get /summary',
  ]);
  // label, gates, tenant-input rejection, handler
  expect(chainLengths(router)).toEqual({
    'get /login': 3,
    'get /session': 4,
    'get /summary': 7,
  });
  for (const [module, name] of [
    ['fixture', 'records'],
    ['admin-tenancy', 'tenants'],
    ['core', 'auth'],
  ] as const) {
    expect(() =>
      createRouter(new AdminRecordsController(adminDb, 'records'), {
        module,
        router: name,
        extend: add => add(extension('login', '/login', 'anonymous')),
      })
    ).toThrow('admin-tenancy auth router');
  }
  expect(() =>
    createRouter(new RecordsController(db), {
      ...options,
      extend: add => add(extension('summary', '/summary')),
    })
  ).not.toThrow();
});
