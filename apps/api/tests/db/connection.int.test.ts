/*
 * Copyright (c) 2026–present Ian Silverstone.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, initDb, probeDb } from '../../src/db/index.js';

// Gated on DATABASE_URL_TEST (RULES/db-and-migrations.md): CI exports it with
// a live Postgres service container; locally it comes from apps/api/.env via
// vitest.config.ts. Skipped silently when unset.
const url = process.env.DATABASE_URL_TEST;

describe.skipIf(!url)('database round-trip', () => {
  // closeDb() no-ops when nothing was initialized, so the hook is safe even
  // if initDb itself is what failed.
  afterAll(() => {
    closeDb();
  });

  it('initDb → probeDb succeeds against a live database', async () => {
    initDb(url as string);

    await expect(probeDb()).resolves.toBeUndefined();
  });
});
