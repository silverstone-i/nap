/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { expect, it } from 'vitest';
import { z } from 'zod';
import { QueryModel } from 'pg-schemata';
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
const options = { module: 'fixture', router: 'records' } as const;

/** Does: Lists a router's routes as "method path" in registration order. */
function routesOf(router: Router) {
  return router.stack.flatMap(layer =>
    layer.route ? [`${layer.route.stack[0]?.method} ${layer.route.path}`] : []
  );
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
  expect(describeModel(db, 'records')).toMatchObject({
    primaryKey: 'id',
    softDelete: true,
    writable: true,
  });
  expect(describeModel(db, 'probe').softDelete).toBe(false);
});

it("checks a projection's columns against its declared item schema", () => {
  expect(() => describeModel(db, 'view')).toThrow('no item schema');
  const item = z.object({ id: z.guid(), quantity: z.number().nullable() });
  const contract = describeModel(db, 'view', item);
  expect(contract.writable).toBe(false);
  expect(contract.columnSchema('id').safeParse('not-a-uuid').success).toBe(
    false
  );
  expect(contract.columnSchema('quantity').safeParse('7').success).toBe(false);
  expect(contract.columnSchema('code').safeParse('anything').success).toBe(
    true
  );
  const generated = describeModel(db, 'records');
  expect(generated.columnSchema('quantity').safeParse('7').success).toBe(false);
  expect(generated.columnSchema('id').safeParse('not-a-uuid').success).toBe(
    false
  );
});
