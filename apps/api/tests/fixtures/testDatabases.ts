/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Resolves the test databases and decides whether database-backed suites run.
 *
 * A developer without PostgreSQL sees these suites skip. CI does not get that
 * option: the isolation suite is the Phase 1 gate, so a missing variable there
 * is a failure rather than a silent pass.
 */

import { describe } from 'vitest';

import { databaseUrl, loadDotEnv } from '../../src/util/env.js';

loadDotEnv('.env');

/** Connection strings the database-backed suites use. */
export interface TestDatabaseUrls {
  adminRuntime: string;
  adminMigration: string;
  cellRuntime: string;
  cellMigration: string;
}

/**
 * Reads every test connection string.
 *
 * @returns The URLs, or null when any is unset.
 */
function readUrls(): TestDatabaseUrls | null {
  try {
    return {
      adminRuntime: databaseUrl('ADMIN', 'RUNTIME'),
      adminMigration: databaseUrl('ADMIN', 'MIGRATION'),
      cellRuntime: databaseUrl('CELL', 'RUNTIME'),
      cellMigration: databaseUrl('CELL', 'MIGRATION'),
    };
  } catch {
    return null;
  }
}

const urls = readUrls();

if (urls === null && process.env.CI) {
  throw new Error(
    'Database-backed tests are required in CI, but the ADMIN_*/CELL_* test ' +
      'connection strings are not set. Run npm run db:setup:test and export them.'
  );
}

/**
 * Returns the test connection strings.
 *
 * @returns The URLs.
 * @throws {Error} If called from a suite that should have been skipped.
 */
export function testDatabaseUrls(): TestDatabaseUrls {
  if (urls === null) {
    throw new Error('Test database URLs are not configured');
  }
  return urls;
}

/** `describe` for database-backed suites; skips only outside CI. */
export const describeDatabase = urls === null ? describe.skip : describe;
