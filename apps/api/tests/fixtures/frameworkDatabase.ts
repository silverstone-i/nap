/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createCellDatabase } from '../../src/db/cell/index.js';
import { assertRuntimeRole } from '../../src/db/assertRuntimeRole.js';
import { migrateDatabase } from '../../src/db/migrate.js';
import { postgresFixture } from './postgres.js';
import { frameworkModules } from './frameworkMigrations.js';
import { FrameworkRecords } from './frameworkRecord.js';

/**
 * Does: Provisions a disposable cell database holding the framework test
 * table, grants the runtime role access only after row-level security is in
 * place, and returns the runtime handle with its cleanup.
 * Called by: the framework integration and isolation tests in beforeAll.
 */
export async function frameworkDatabase(max = 4) {
  const fixture = await postgresFixture();
  const db = createCellDatabase(fixture.runtimeUrl(fixture.cellUrl), {
    repositories: { records: FrameworkRecords },
    pool: { max },
  });
  try {
    await migrateDatabase('cell', fixture.cellUrl, frameworkModules);
    const owner = fixture.owner(fixture.cellUrl);
    await owner.none(
      `
      GRANT USAGE ON SCHEMA app TO $1:name;
      GRANT SELECT, INSERT, UPDATE, DELETE ON app.framework_record TO $1:name;
    `,
      [fixture.role]
    );
    await assertRuntimeRole(db);
    return {
      db,
      fixture,
      owner,
      async cleanup() {
        try {
          await db.close();
        } finally {
          await fixture.cleanup();
        }
      },
    };
  } catch (error) {
    try {
      await db.close();
    } finally {
      await fixture.cleanup();
    }
    throw error;
  }
}
