/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterEach, expect, it, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { logger, createDatabaseLogger } from '../../src/util/logger.js';
import { createAdminDatabase } from '../../src/db/admin/index.js';
import { createCellDatabase } from '../../src/db/cell/index.js';

afterEach(() => vi.restoreAllMocks());
it('discards metadata and unsafe strings before calling Pino, retaining exact safe text', () => {
  const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
  const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
  const db = createDatabaseLogger('admin');
  db.info?.('Truncating table', { password: 'secret' });
  db.info?.('findAfterCursor failure: secret', { row: 'secret' });
  db.error?.(new Error('secret'), { stack: 'secret' });
  expect(info.mock.calls[0]?.[1]).toBe('Truncating table');
  expect(
    JSON.stringify([...info.mock.calls, ...error.mock.calls])
  ).not.toContain('secret');
});
it('emits structured correlated stdout records without hostname or ambient context leakage', () => {
  const requestId = '00000000-0000-4000-8000-000000000001';
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { logger } from './dist/util/logger.js';
    import { requestContext } from './dist/util/requestContext.js';
    requestContext.run({ requestId: '${requestId}' }, () => logger.info({ event: 'test.correlated' }));
    logger.info({ event: 'test.outside' });
  `,
    ],
    { encoding: 'utf8' }
  );
  const records = output
    .trim()
    .split('\n')
    .map(line => JSON.parse(line) as Record<string, unknown>);
  expect(records[0]).toMatchObject({
    severity: 'info',
    event: 'test.correlated',
    requestId,
  });
  expect(records[0]?.time).toEqual(expect.any(String));
  expect(records[0]).not.toHaveProperty('hostname');
  expect(records[1]).not.toHaveProperty('requestId');
});
it('wires the safe adapter to both independent database factories', async () => {
  const handles = [
    createAdminDatabase('postgres://unused:unused@localhost/unused'),
    createCellDatabase('postgres://unused:unused@localhost/unused'),
  ];
  const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
  try {
    for (const handle of handles)
      handle.logger?.error?.('private', { row: 'private' });
    expect(error.mock.calls.map(call => call[0])).toEqual([
      { event: 'database.diagnostic', database: 'admin' },
      { event: 'database.diagnostic', database: 'cell' },
    ]);
  } finally {
    await Promise.all(handles.map(handle => handle.close()));
  }
});
