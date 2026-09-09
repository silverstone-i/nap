/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { beforeAll, afterAll, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { z } from 'zod';
import { xlsxMediaType } from '@nap/shared';
import { frameworkDatabase } from '../fixtures/frameworkDatabase.js';
import { createFrameworkApp, recordsPath } from '../fixtures/frameworkApp.js';
import { fullSession } from '../fixtures/testSession.js';
import { withTenantTransaction } from '../../src/db/withTenantTransaction.js';
import { buildPolicy } from '../../src/services/authorization.js';
import {
  recordsFromWorkbook,
  workbookFromRecords,
} from '../../src/framework/spreadsheets.js';
import { describeModel } from '../../src/framework/modelContract.js';
import { parseListQuery } from '../../src/framework/listQuery.js';
import { listRecords } from '../../src/framework/operations.js';
let test: Awaited<ReturnType<typeof frameworkDatabase>>;
const tenant = randomUUID();
let allowed: string;
let denied: string;
/** Does: Builds the real factory with a fixture sensitive-field policy. Called by: field acceptance cases. */
function app(view = false, edit = false) {
  const session = fullSession(tenant, randomUUID());
  return createFrameworkApp(test.db, {
    session: {
      ...session,
      permissions: new Set([
        ...session.permissions,
        'fixture::records::report',
      ]),
    },
    protectedFields: ['quantity'],
    authorize: (_tx, _session, action) =>
      Promise.resolve(
        buildPolicy(
          'fixture::records',
          action,
          {
            admin: false,
            grants: [
              {
                id: 'grant',
                roleId: 'role',
                scope: 'self',
                companies: [],
                projects: [],
                capabilities: [`fixture::records::${action}`],
                fields: [
                  {
                    resource: 'fixture::records',
                    group: 'sensitive',
                    view,
                    edit,
                  },
                ],
              },
            ],
          },
          allowed,
          [],
          [{ name: 'sensitive', columns: ['quantity'] }]
        )
      ),
    extend: add =>
      add({
        action: 'report',
        method: 'get',
        path: '/report',
        body: z.undefined(),
        query: z.object({}).passthrough(),
        params: z.object({}),
        response: z.object({
          version: z.literal(1),
          data: z.array(
            z.object({
              id: z.string(),
              quantity: z.number().nullable().optional(),
            })
          ),
        }),
        operation: async (tx, input) => {
          const contract = describeModel(
            { target: 'cell', handle: test.db },
            'records'
          );
          const rows = await listRecords(
            tx.records,
            { ...contract, policy: input.authorization },
            parseListQuery(input.query, contract, { default: 100, max: 100 })
          );
          return { version: 1, data: rows.rows };
        },
      }),
  });
}
beforeAll(async () => {
  test = await frameworkDatabase();
  await withTenantTransaction(test.db, tenant, async tx => {
    allowed = (
      await tx.records.insert({
        tenant_id: tenant,
        code: 'A',
        name: 'Allowed',
        quantity: 123,
      })
    ).id;
    denied = (
      await tx.records.insert({
        tenant_id: tenant,
        code: 'B',
        name: 'Denied',
        quantity: 456,
      })
    ).id;
  });
}, 30000);
afterAll(async () => {
  await test?.cleanup();
}, 30000);
it('scopes lists/counts/reads and omits denied fields', async () => {
  const list = await request(app()).get(recordsPath + '/');
  expect(list.status, JSON.stringify(list.body)).toBe(200);
  const parsed = z
    .object({
      data: z.array(z.record(z.string(), z.unknown())),
      page: z.object({ total: z.number() }),
    })
    .parse(list.body);
  expect(parsed.data).toHaveLength(1);
  expect(parsed.page.total).toBe(1);
  expect(parsed.data[0]).not.toHaveProperty('quantity');
  expect((await request(app()).get(recordsPath + '/' + denied)).status).toBe(
    404
  );
  const permitted = await request(app(true)).get(recordsPath + '/' + allowed);
  expect(
    z.object({ data: z.object({ quantity: z.number() }) }).parse(permitted.body)
      .data.quantity
  ).toBe(123);
});
it('rejects protected query inference and applies the policy to report extensions', async () => {
  for (const query of ['?sort=quantity', '?quantity=123'])
    expect((await request(app()).get(recordsPath + '/' + query)).status).toBe(
      403
    );
  const report = await request(app()).get(recordsPath + '/report');
  expect(report.status).toBe(200);
  const data = z
    .object({ data: z.array(z.record(z.string(), z.unknown())) })
    .parse(report.body).data;
  expect(data).toHaveLength(1);
  expect(data[0]).not.toHaveProperty('quantity');
  expect(
    (await request(app()).get(recordsPath + '/report?quantity=123')).status
  ).toBe(403);
});
it('rejects protected mutations and atomic mixed-scope batches', async () => {
  expect(
    (
      await request(app())
        .put(recordsPath + '/update')
        .send({ ids: [allowed], changes: { quantity: 9 } })
    ).status
  ).toBe(403);
  expect(
    (
      await request(app(true, true))
        .put(recordsPath + '/update')
        .send({ ids: [allowed, denied], changes: { quantity: 9 } })
    ).status
  ).toBe(404);
  expect(
    (
      await request(app(true, true))
        .put(recordsPath + '/update')
        .send({ ids: [allowed], changes: { quantity: 9 } })
    ).status
  ).toBe(200);
  expect(
    await withTenantTransaction(
      test.db,
      tenant,
      async tx => (await tx.records.findById(denied))?.quantity
    )
  ).toBe(456);
});
it('filters exports and refuses imports outside creation scope', async () => {
  const exported = await request(app())
    .post(recordsPath + '/export-xls')
    .buffer(true)
    .parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    });
  expect(exported.status).toBe(200);
  const bytes = z.instanceof(Buffer).parse(exported.body);
  const rows = recordsFromWorkbook(bytes, 0);
  expect(rows).toHaveLength(1);
  expect(rows[0]).not.toHaveProperty('quantity');
  const workbook = workbookFromRecords(
    [{ code: 'C', name: 'Import', quantity: 99 }],
    'records'
  );
  expect(
    (
      await request(app())
        .post(recordsPath + '/import-xls')
        .set('Content-Type', xlsxMediaType)
        .send(Buffer.from(workbook))
    ).status
  ).toBe(403);
});
