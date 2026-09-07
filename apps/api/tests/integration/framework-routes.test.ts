/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
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
  listPageSize,
  successResponseSchema,
} from '@nap/shared';
import { withTenantTransaction } from '../../src/db/withTenantTransaction.js';
import { HttpError } from '../../src/util/httpError.js';
import { logger } from '../../src/util/logger.js';
import { frameworkDatabase } from '../fixtures/frameworkDatabase.js';
import { createFrameworkApp, recordsPath } from '../fixtures/frameworkApp.js';
import { fullSession } from '../fixtures/testSession.js';
import type { CellTransaction } from '../../src/db/withTenantTransaction.js';
import type { ResolvedSession } from '../../src/middleware/session.js';
import type { FixtureRepositories } from '../fixtures/frameworkApp.js';
import type { FrameworkRecordRow } from '../fixtures/frameworkRecord.js';

let context: Awaited<ReturnType<typeof frameworkDatabase>>;
const tenantA = randomUUID();
const tenantB = randomUUID();
const actor = randomUUID();
const sessionA = fullSession(tenantA, actor, ['adjust']);
const recordSchema = z.object({
  id: z.guid(),
  tenant_id: z.literal(tenantA),
  code: z.string(),
  name: z.string(),
  quantity: z.number().nullable(),
  parent_id: z.guid().nullable(),
  created_at: z.string(),
  created_by: z.null(),
  updated_at: z.string(),
  updated_by: z.null(),
  deactivated_at: z.string().nullable(),
});
const listSchema = z.strictObject({
  version: z.literal(1),
  data: z.array(recordSchema),
  page: z.strictObject({
    size: z.number(),
    total: z.number(),
    cursor: z.string().optional(),
  }),
});
const manySchema = successResponseSchema(z.array(recordSchema));
const singleSchema = successResponseSchema(recordSchema);

/**
 * Does: An extension that adds delta to the quantity of each identified
 * record inside the request's tenant transaction, refusing a negative delta
 * after the update so the rollback can be observed.
 */
const adjust = {
  action: 'adjust',
  method: 'post',
  path: '/adjust',
  body: z.strictObject({ ids: z.array(z.guid()), delta: z.number().int() }),
  query: z.strictObject({}),
  params: z.strictObject({}),
  response: successResponseSchema(z.number()),
  operation: async (
    tx: CellTransaction<FixtureRepositories>,
    input: { body: { ids: string[]; delta: number } }
  ) => {
    let count = 0;
    for (const id of input.body.ids) {
      count += await tx.records.updateWhere(
        { id },
        { quantity: 100 + input.body.delta }
      );
    }
    if (input.body.delta < 0) throw new HttpError('INVALID_INPUT');
    return { version: 1, data: count };
  },
} as const;

/** Does: Builds the fixture app for a session, adjust route included. */
function appFor(
  session: ResolvedSession | undefined,
  options: Parameters<typeof createFrameworkApp>[1] = {}
) {
  return createFrameworkApp(context.db, {
    session,
    extend: add => add(adjust),
    ...options,
  });
}

/** Does: Reads every row of a tenant straight from the database. */
function rowsOf(tenantId: string) {
  return withTenantTransaction(context.db, tenantId, tx =>
    tx.records.findWhere([], 'AND', {
      orderBy: ['code'],
      includeDeactivated: true,
    })
  );
}

/** Does: Inserts records for a tenant through the API and returns them. */
async function seed(codes: string[], tenantId = tenantA) {
  const response = await request(appFor(fullSession(tenantId, actor)))
    .post(`${recordsPath}/bulk-insert`)
    .send({ records: codes.map(code => ({ code, name: `Name ${code}` })) });
  expect(response.status).toBe(201);
  return response.body as { data: FrameworkRecordRow[] };
}

/** Does: Parses a refusal and returns its code and field-error keys. */
function refusal(body: unknown) {
  const parsed = apiErrorSchema.parse(body);
  return { code: parsed.code, keys: Object.keys(parsed.fieldErrors ?? {}) };
}

beforeAll(async () => {
  context = await frameworkDatabase();
}, 60000);
afterAll(async () => {
  await context.cleanup();
}, 30000);
beforeEach(() => {
  vi.spyOn(logger, 'info').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await context.owner.none('DELETE FROM app.framework_record');
});

it('creates, reads, and refuses invalid, unknown, and managed input', async () => {
  const app = appFor(sessionA);
  const created = await request(app)
    .post(recordsPath)
    .send({ code: 'a1', name: 'Alpha', quantity: 3 });
  expect(created.status).toBe(201);
  const record = singleSchema.parse(created.body).data;
  expect(record).toMatchObject({ code: 'a1', name: 'Alpha', quantity: 3 });
  const read = await request(app).get(`${recordsPath}/${record.id}`);
  expect(read.status).toBe(200);
  expect(singleSchema.parse(read.body).data).toEqual(record);
  for (const [body, keys] of [
    [{ code: 'a2' }, ['name']],
    [{ code: 'a2', name: 'x', nope: 1 }, ['nope']],
    [{ code: 'a2', name: 'x', created_at: 'now' }, ['created_at']],
    [{ code: 'a2', name: 1 }, ['name']],
  ] as const) {
    const response = await request(app).post(recordsPath).send(body);
    expect(response.status).toBe(400);
    expect(refusal(response.body)).toEqual({ code: 'INVALID_INPUT', keys });
  }
  const duplicate = await request(app)
    .post(recordsPath)
    .send({ code: 'a1', name: 'Again' });
  expect(duplicate.status).toBe(409);
  expect(refusal(duplicate.body)).toEqual({ code: 'CONFLICT', keys: [] });
  expect(await rowsOf(tenantA)).toHaveLength(1);
});

it('answers not found for a malformed, unknown, archived, or other-tenant id', async () => {
  const app = appFor(sessionA);
  const other = await seed(['b1'], tenantB);
  const [own] = (await seed(['a1'])).data;
  const malformed = await request(app).get(`${recordsPath}/not-a-uuid`);
  expect(malformed.status).toBe(400);
  expect(refusal(malformed.body).keys).toEqual(['id']);
  for (const id of [randomUUID(), other.data[0]?.id]) {
    const response = await request(app).get(`${recordsPath}/${id}`);
    expect(response.status).toBe(404);
    expect(refusal(response.body)).toEqual({ code: 'NOT_FOUND', keys: [] });
  }
  await request(app)
    .delete(`${recordsPath}/archive`)
    .send({ ids: [own?.id] });
  expect((await request(app).get(`${recordsPath}/${own?.id}`)).status).toBe(
    404
  );
});

it('refuses without a session, tenant, entitlement, or permission before touching input', async () => {
  const cases: [ResolvedSession | undefined, number, string][] = [
    [undefined, 401, 'UNAUTHENTICATED'],
    [fullSession(undefined, actor), 403, 'FORBIDDEN'],
    [{ ...sessionA, entitlements: new Set(['other']) }, 403, 'FORBIDDEN'],
    [
      {
        ...sessionA,
        permissions: new Set(['fixture::records::list']),
      },
      403,
      'FORBIDDEN',
    ],
  ];
  for (const [session, status, code] of cases) {
    const response = await request(appFor(session))
      .post(recordsPath)
      .set('X-Tenant-Id', tenantA)
      .send({ code: 'x', name: 'x' });
    expect(response.status).toBe(status);
    expect(refusal(response.body)).toEqual({ code, keys: [] });
  }
  const listed = await request(
    appFor({ ...sessionA, permissions: new Set(['fixture::records::list']) })
  ).get(recordsPath);
  expect(listed.status).toBe(200);
});

it('lists with clamped pages, filters, sorting, keyset traversal, and archived selectors', async () => {
  const app = appFor(sessionA);
  await seed(['b1', 'b2'], tenantB);
  await seed(['c7', 'c3', 'c5', 'c1', 'c6', 'c2', 'c4']);
  const clamped = await request(app).get(`${recordsPath}?size=99999`);
  expect(clamped.status).toBe(200);
  const first = listSchema.parse(clamped.body);
  expect(first.page).toEqual({ size: listPageSize.max, total: 7 });
  expect(first.data).toHaveLength(7);

  /** Does: Walks every page of a sort and returns the codes in order. */
  async function walk(sort: string) {
    const codes: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const query = new URLSearchParams({ size: '3', sort });
      if (cursor) query.set('cursor', cursor);
      const response = await request(app).get(
        `${recordsPath}?${query.toString()}`
      );
      expect(response.status).toBe(200);
      const page = listSchema.parse(response.body);
      expect(page.page.size).toBe(3);
      expect(page.page.total).toBe(7);
      codes.push(...page.data.map(row => row.code));
      cursor = page.page.cursor;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    return codes;
  }
  expect(await walk('code')).toEqual([
    'c1',
    'c2',
    'c3',
    'c4',
    'c5',
    'c6',
    'c7',
  ]);
  expect(await walk('-code')).toEqual([
    'c7',
    'c6',
    'c5',
    'c4',
    'c3',
    'c2',
    'c1',
  ]);

  const filtered = await request(app).get(
    `${recordsPath}?sort=code&code=c3&code=c5`
  );
  expect(listSchema.parse(filtered.body).data.map(r => r.code)).toEqual([
    'c3',
    'c5',
  ]);
  for (const [query, keys] of [
    ['nope=1', ['nope']],
    ['sort=nope', ['sort']],
    ['size=0', ['size']],
    ['archived=all', ['archived']],
    ['cursor=bad', ['cursor']],
  ] as const) {
    const response = await request(app).get(
      `${recordsPath}?${query.toString()}`
    );
    expect(response.status).toBe(400);
    expect(refusal(response.body)).toEqual({ code: 'INVALID_INPUT', keys });
  }
  const page = listSchema.parse(
    (await request(app).get(`${recordsPath}?size=2&sort=code`)).body
  );
  const replayed = await request(app).get(
    `${recordsPath}?size=2&sort=-code&cursor=${page.page.cursor}`
  );
  expect(refusal(replayed.body).keys).toEqual(['cursor']);

  const ids = (await rowsOf(tenantA))
    .filter(row => ['c1', 'c2'].includes(row.code))
    .map(row => row.id);
  const archived = await request(app)
    .delete(`${recordsPath}/archive`)
    .send({ ids });
  expect(archived.status).toBe(200);
  for (const row of manySchema.parse(archived.body).data)
    expect(row.deactivated_at).not.toBeNull();
  /** Does: Reads the codes and total a selector lists. */
  async function selected(archivedValue: string) {
    const response = await request(app).get(
      `${recordsPath}?sort=code&archived=${archivedValue}`
    );
    const parsed = listSchema.parse(response.body);
    return [parsed.data.map(r => r.code), parsed.page.total] as const;
  }
  expect(await selected('exclude')).toEqual([
    ['c3', 'c4', 'c5', 'c6', 'c7'],
    5,
  ]);
  expect(await selected('only')).toEqual([['c1', 'c2'], 2]);
  expect((await selected('include'))[1]).toBe(7);
  const restored = await request(app)
    .patch(`${recordsPath}/restore`)
    .send({ ids });
  expect(restored.status).toBe(200);
  for (const row of manySchema.parse(restored.body).data)
    expect(row.deactivated_at).toBeNull();
  const again = await request(app)
    .patch(`${recordsPath}/restore`)
    .send({ ids });
  expect(refusal(again.body).keys).toEqual(['ids.0', 'ids.1']);
});

it('applies batch writes all-or-nothing and names refused identifiers by position', async () => {
  const app = appFor(sessionA);
  const other = (await seed(['b1'], tenantB)).data[0];
  const [a1, a2] = (await seed(['a1', 'a2'])).data;
  if (!a1 || !a2 || !other) throw new Error('Seed failed');
  const updated = await request(app)
    .put(`${recordsPath}/update`)
    .send({ ids: [a1.id, a2.id], changes: { name: 'Renamed' } });
  expect(updated.status).toBe(200);
  expect(manySchema.parse(updated.body).data.map(r => r.name)).toEqual([
    'Renamed',
    'Renamed',
  ]);
  for (const [body, keys] of [
    [{ ids: [a1.id, randomUUID()], changes: { name: 'x' } }, ['ids.1']],
    [{ ids: [other.id], changes: { name: 'x' } }, ['ids.0']],
    [{ ids: [a1.id], changes: {} }, ['changes']],
    [{ ids: [a1.id], changes: { id: randomUUID() } }, ['changes.id']],
    [{ ids: [a1.id], changes: { quantity: 'many' } }, ['changes.quantity']],
  ] as const) {
    const response = await request(app).put(`${recordsPath}/update`).send(body);
    expect(response.status).toBe(400);
    expect(refusal(response.body)).toEqual({ code: 'INVALID_INPUT', keys });
  }
  const bulk = await request(app)
    .put(`${recordsPath}/bulk-update`)
    .send({
      records: [
        { id: a1.id, quantity: 1 },
        { id: a2.id, quantity: 2, name: 'Two' },
      ],
    });
  expect(bulk.status).toBe(200);
  expect(
    manySchema
      .parse(bulk.body)
      .data.map(r => [r.quantity, r.name])
      .sort()
  ).toEqual([
    [1, 'Renamed'],
    [2, 'Two'],
  ]);
  const partial = await request(app)
    .put(`${recordsPath}/bulk-update`)
    .send({
      records: [
        { id: a1.id, quantity: 9 },
        { id: randomUUID(), quantity: 9 },
      ],
    });
  expect(refusal(partial.body).keys).toEqual(['records.1.id']);
  const missingKey = await request(app)
    .put(`${recordsPath}/bulk-update`)
    .send({ records: [{ quantity: 9 }] });
  expect(refusal(missingKey.body).keys).toEqual(['records.0.id']);
  const rows = await rowsOf(tenantA);
  expect(rows.map(r => r.quantity)).toEqual([1, 2]);
  expect((await rowsOf(tenantB))[0]?.name).toBe('Name b1');
  const badBatch = await request(app)
    .post(`${recordsPath}/bulk-insert`)
    .send({ records: [{ code: 'n1', name: 'ok' }, { code: 'n2' }] });
  expect(refusal(badBatch.body).keys).toEqual(['records.1.name']);
  const conflict = await request(app)
    .post(`${recordsPath}/bulk-insert`)
    .send({
      records: [
        { code: 'n1', name: 'ok' },
        { code: 'a1', name: 'dup' },
      ],
    });
  expect(conflict.status).toBe(409);
  expect((await rowsOf(tenantA)).map(r => r.code)).toEqual(['a1', 'a2']);
});

it('refuses a client-supplied tenant in headers, query, and body', async () => {
  const app = appFor(sessionA);
  const cases = [
    [
      request(app).get(recordsPath).set('X-Tenant-Id', tenantB),
      'headers.x-tenant-id',
    ],
    [
      request(app).get(`${recordsPath}?tenant_id=${tenantB}`),
      'query.tenant_id',
    ],
    [
      request(app)
        .post(recordsPath)
        .send({ code: 'x', name: 'x', tenantId: tenantB }),
      'tenantId',
    ],
    [
      request(app)
        .post(`${recordsPath}/bulk-insert`)
        .send({ records: [{ code: 'x', name: 'x', tenant_id: tenantB }] }),
      'records.0.tenant_id',
    ],
  ] as const;
  for (const [pending, key] of cases) {
    const response = await pending;
    expect(response.status).toBe(400);
    expect(refusal(response.body)).toEqual({
      code: 'INVALID_INPUT',
      keys: [key],
    });
    expect(JSON.stringify(response.body)).not.toContain(tenantB);
  }
  expect(await rowsOf(tenantA)).toHaveLength(0);
});

it('answers a disabled route exactly as an unknown path and registers only read routes for a read controller', async () => {
  const disabled = appFor(sessionA, { routes: { archive: false } });
  const unknown = await request(disabled)
    .delete(`${recordsPath}/nope/deeper`)
    .send({ ids: [randomUUID()] });
  const missing = await request(disabled)
    .delete(`${recordsPath}/archive`)
    .send({ ids: [randomUUID()] });
  expect(missing.status).toBe(404);
  expect(missing.status).toBe(unknown.status);
  expect(missing.body).toEqual(unknown.body);
  expect(missing.headers['content-type']).toBe(unknown.headers['content-type']);
  const readOnly = appFor(sessionA, { readOnly: true, extend: undefined });
  expect(
    (await request(readOnly).post(recordsPath).send({ code: 'x', name: 'x' }))
      .status
  ).toBe(404);
  expect((await request(readOnly).get(recordsPath)).status).toBe(200);
});

it('runs an extension inside the tenant transaction and rolls it back on refusal', async () => {
  const app = appFor(sessionA);
  const [a1] = (await seed(['a1'])).data;
  if (!a1) throw new Error('Seed failed');
  const applied = await request(app)
    .post(`${recordsPath}/adjust`)
    .send({ ids: [a1.id], delta: 5 });
  expect(applied.status).toBe(200);
  expect(applied.body).toEqual({ version: 1, data: 1 });
  expect((await rowsOf(tenantA))[0]?.quantity).toBe(105);
  const refused = await request(app)
    .post(`${recordsPath}/adjust`)
    .send({ ids: [a1.id], delta: -5 });
  expect(refused.status).toBe(400);
  expect((await rowsOf(tenantA))[0]?.quantity).toBe(105);
  const invalid = await request(app)
    .post(`${recordsPath}/adjust`)
    .send({ ids: ['x'], delta: 1 });
  expect(refusal(invalid.body).keys).toEqual(['ids.0']);
  const denied = await request(
    appFor({ ...sessionA, permissions: new Set(['fixture::records::list']) })
  )
    .post(`${recordsPath}/adjust`)
    .send({ ids: [a1.id], delta: 1 });
  expect(denied.status).toBe(403);
});

it('logs the route label and never the path', async () => {
  const app = appFor(sessionA);
  await request(app).get(`${recordsPath}?code=secret-value`);
  await request(app).get(`${recordsPath}/${randomUUID()}`);
  const calls = JSON.stringify(vi.mocked(logger.info).mock.calls);
  expect(calls).toContain('fixture.records.list');
  expect(calls).toContain('fixture.records.read');
  expect(calls).not.toContain('/api/fixture');
  expect(calls).not.toContain('secret-value');
});
