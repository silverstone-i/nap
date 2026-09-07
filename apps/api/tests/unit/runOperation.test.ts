/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { randomUUID } from 'node:crypto';
import { DatabaseError, SchemaDefinitionError } from 'pg-schemata';
import { afterEach, expect, it, vi } from 'vitest';
import { createCellDatabase } from '../../src/db/cell/index.js';
import { HttpError } from '../../src/util/httpError.js';
import { runInTenant, tableModel } from '../../src/framework/runOperation.js';
import { fullSession } from '../fixtures/testSession.js';
import { FrameworkRecords } from '../fixtures/frameworkRecord.js';
import { IsolationProbe } from '../fixtures/isolationProbe.js';

const db = createCellDatabase('postgres://unused:unused@localhost/unused', {
  repositories: { records: FrameworkRecords, probe: IsolationProbe },
});
const session = fullSession(randomUUID(), randomUUID());
afterEach(() => vi.restoreAllMocks());

/** Does: Makes the handle run work against itself with no connection. */
function fakeTransaction() {
  vi.spyOn(db, 'transaction').mockImplementation(async work => {
    vi.spyOn(db.db, 'one').mockResolvedValue({});
    return work(db.db);
  });
}

it.each([
  ['23505', 'CONFLICT'],
  ['23503', 'INVALID_INPUT'],
  ['23514', 'INVALID_INPUT'],
  ['23502', 'INVALID_INPUT'],
  ['22P02', 'INVALID_INPUT'],
] as const)('maps SQLSTATE %s to %s', async (code, expected) => {
  fakeTransaction();
  await expect(
    runInTenant(db, session, () =>
      Promise.reject(
        new DatabaseError(
          'private detail',
          Object.assign(new Error('private'), { code })
        )
      )
    )
  ).rejects.toMatchObject({ code: expected });
});

it('maps model validation to invalid input, keeps API errors, and leaves other failures alone', async () => {
  fakeTransaction();
  await expect(
    runInTenant(db, session, () =>
      Promise.reject(new SchemaDefinitionError('x'))
    )
  ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  const refusal = new HttpError('NOT_FOUND');
  await expect(
    runInTenant(db, session, () => Promise.reject(refusal))
  ).rejects.toBe(refusal);
  const unknown = new DatabaseError(
    'private detail',
    Object.assign(new Error('private'), { code: '42501' })
  );
  await expect(
    runInTenant(db, session, () => Promise.reject(unknown))
  ).rejects.toBe(unknown);
  const plain = new Error('private');
  await expect(
    runInTenant(db, session, () => Promise.reject(plain))
  ).rejects.toBe(plain);
  await expect(
    runInTenant(db, session, () => Promise.resolve(7))
  ).resolves.toBe(7);
});

it('refuses to run without a tenant and narrows a repository to a table model', async () => {
  await expect(
    runInTenant(db, { ...session, tenantId: undefined }, () =>
      Promise.resolve(1)
    )
  ).rejects.toThrow('without a tenant');
  expect(tableModel(db.db, 'records')).toBeInstanceOf(FrameworkRecords);
  expect(tableModel(db.db, 'probe')).toBeInstanceOf(IsolationProbe);
});
