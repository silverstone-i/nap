/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';

import { closeDb, getDb, initDb, isDbInitialized } from '../../src/db/index.js';

// pg-promise connects lazily, so initDb() against this URL never opens a
// socket — these tests exercise the singleton guards without a database.
// They mutate module state and run in file order; vitest's per-file isolation
// keeps them from leaking into other test files.
const FAKE_URL = 'postgres://nap:never@localhost:5432/never_connected';

describe('DB singleton lifecycle', () => {
  it('initDb initializes the singleton and returns the handle', () => {
    expect(isDbInitialized()).toBe(false);

    const handle = initDb(FAKE_URL);

    expect(handle).toBeDefined();
    expect(isDbInitialized()).toBe(true);
    expect(getDb()).toBe(handle);
  });

  it('a second initDb call throws even with the same connection string', () => {
    expect(() => initDb(FAKE_URL)).toThrow('initDb() called twice');
  });

  it('closeDb is terminal: getDb and initDb throw afterwards', () => {
    closeDb();

    expect(() => getDb()).toThrow('closeDb() is terminal');
    expect(() => initDb(FAKE_URL)).toThrow('after closeDb()');
  });

  it('a repeated closeDb call is a no-op', () => {
    expect(() => closeDb()).not.toThrow();
  });
});
