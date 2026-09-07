/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import request from 'supertest';
import { randomUUID } from 'node:crypto';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';
import {
  apiErrorSchema,
  importUploadLimitBytes,
  xlsxMediaType,
} from '@nap/shared';
import { withTenantTransaction } from '../../src/db/withTenantTransaction.js';
import {
  recordsFromWorkbook,
  workbookFromRecords,
} from '../../src/framework/spreadsheets.js';
import { logger } from '../../src/util/logger.js';
import { frameworkDatabase } from '../fixtures/frameworkDatabase.js';
import { createFrameworkApp, recordsPath } from '../fixtures/frameworkApp.js';
import { fullSession } from '../fixtures/testSession.js';

let context: Awaited<ReturnType<typeof frameworkDatabase>>;
const tenant = randomUUID();
const session = fullSession(tenant, randomUUID());

/** Does: Returns the field-error keys of a refusal body. */
function keys(body: unknown) {
  return Object.keys(apiErrorSchema.parse(body).fieldErrors ?? {});
}

/** Does: Sends workbook bytes to the import route. */
function upload(bytes: Uint8Array, query = '') {
  return request(createFrameworkApp(context.db, { session }))
    .post(`${recordsPath}/import-xls${query}`)
    .set('Content-Type', xlsxMediaType)
    .send(Buffer.from(bytes));
}

/** Does: Reads the codes stored for the tenant, in order. */
async function storedCodes() {
  const rows = await withTenantTransaction(context.db, tenant, tx =>
    tx.records.findWhere([], 'AND', { orderBy: ['code'] })
  );
  return rows.map(row => row.code);
}

beforeAll(async () => {
  context = await frameworkDatabase();
}, 60000);
afterAll(async () => {
  await context.cleanup();
}, 30000);
beforeEach(() => {
  vi.spyOn(logger, 'info').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await context.owner.none('DELETE FROM app.framework_record');
});

it('exports the filtered, sorted result set as a workbook and imports records from one', async () => {
  const app = createFrameworkApp(context.db, { session });
  const seeded = await request(app)
    .post(`${recordsPath}/bulk-insert`)
    .send({
      records: [
        { code: 'e2', name: 'Two', quantity: 2 },
        { code: 'e1', name: 'One' },
        { code: 'e3', name: 'Three', quantity: 3 },
      ],
    });
  expect(seeded.status).toBe(201);
  const exported = await request(app)
    .post(`${recordsPath}/export-xls?sort=-code&code=e1&code=e3`)
    .buffer(true)
    .parse((response, callback) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(chunk));
      response.on('end', () => callback(null, Buffer.concat(chunks)));
    });
  expect(exported.status).toBe(200);
  expect(exported.headers['content-type']).toBe(xlsxMediaType);
  expect(exported.headers['content-disposition']).toBe(
    'attachment; filename="fixture-records.xlsx"'
  );
  expect(exported.headers['cache-control']).toBe('no-store');
  const rows = recordsFromWorkbook(exported.body as Buffer, 0);
  expect(rows.map(row => row.code)).toEqual(['e3', 'e1']);
  expect(rows[0]).toMatchObject({ name: 'Three', quantity: 3 });
  expect(rows[0]?.tenant_id).toBe(tenant);
  expect(rows[0]?.created_at).toBeInstanceOf(Date);

  const imported = await upload(
    workbookFromRecords(
      [
        { code: 'i1', name: 'Imported one', quantity: 5, parent_id: null },
        { code: 'i2', name: 'Imported two', quantity: null, parent_id: null },
      ],
      'records'
    ),
    '?sheet=0'
  );
  expect(imported.status).toBe(201);
  expect(
    (imported.body as { data: { code: string; quantity: number | null }[] })
      .data
  ).toMatchObject([
    { code: 'i1', quantity: 5 },
    { code: 'i2', quantity: null },
  ]);
  expect(await storedCodes()).toEqual(['e1', 'e2', 'e3', 'i1', 'i2']);

  const reimported = await upload(exported.body as Buffer);
  expect(reimported.status).toBe(400);
  expect(keys(reimported.body)).toEqual(['records.0.tenant_id']);
});

it('refuses a bad sheet, an unknown column, a conflicting record, or an oversized upload and stores nothing', async () => {
  const workbook = workbookFromRecords(
    [
      { code: 'x1', name: 'One' },
      { code: 'x1', name: 'Duplicate' },
    ],
    'records'
  );
  const conflict = await upload(workbook);
  expect(conflict.status).toBe(409);
  const sheet = await upload(workbook, '?sheet=3');
  expect(sheet.status).toBe(400);
  expect(keys(sheet.body)).toEqual(['sheet']);
  const unknown = await upload(
    workbookFromRecords([{ code: 'x2', name: 'x', nope: 1 }], 'records')
  );
  expect(keys(unknown.body)).toEqual(['records.0.nope']);
  const invalid = await upload(
    workbookFromRecords(
      [
        { code: 'x3', name: 'ok' },
        { code: 'x4', name: 'ok', quantity: 'many' },
      ],
      'records'
    )
  );
  expect(keys(invalid.body)).toEqual(['records.1.quantity']);
  const oversized = await request(createFrameworkApp(context.db, { session }))
    .post(`${recordsPath}/import-xls`)
    .set('Content-Type', xlsxMediaType)
    .set('Content-Length', String(importUploadLimitBytes + 1))
    .send(Buffer.from('x'));
  expect(oversized.status).toBe(413);
  const unreadable = await upload(Buffer.from('not a workbook'));
  expect(unreadable.status).toBe(400);
  expect(await storedCodes()).toEqual([]);
});
