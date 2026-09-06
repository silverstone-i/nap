/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createCellDatabase } from '../../src/db/cell/index.js';
import { assertRuntimeRole } from '../../src/db/assertRuntimeRole.js';
import { migrateDatabase } from '../../src/db/migrate.js';
import { postgresFixture } from './postgres.js';
import { isolationModules } from './isolationMigrations.js';
import { IsolationProbe } from './isolationProbe.js';

/** Provision an isolated test database and grant runtime access only after RLS. */
export async function isolationDatabase(max = 4) {
  const fixture = await postgresFixture();
  const db = createCellDatabase(fixture.runtimeUrl(fixture.cellUrl), {
    repositories: { probe: IsolationProbe },
    pool: { max },
  });
  try {
    await migrateDatabase('cell', fixture.cellUrl, isolationModules);
    const owner = fixture.owner(fixture.cellUrl);
    await owner.none(
      `
      GRANT USAGE ON SCHEMA app, reporting TO $1:name;
      GRANT SELECT, INSERT, UPDATE, DELETE ON app.isolation_probe TO $1:name;
      GRANT SELECT ON reporting.isolation_probe TO $1:name;
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
