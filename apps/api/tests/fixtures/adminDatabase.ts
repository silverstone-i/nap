/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { createAdminDatabase } from '../../src/db/admin/index.js';
import { assertRuntimeRole } from '../../src/db/assertRuntimeRole.js';
import { migrateDatabase } from '../../src/db/migrate.js';
import { postgresFixture } from './postgres.js';
import { AdminRecords, adminRecordModules } from './adminRecord.js';

/**
 * Does: Provisions a disposable admin database holding the admin framework
 * test table, grants the runtime role access to it, and returns the runtime
 * pool with its cleanup.
 * Called by: the admin router integration tests in beforeAll.
 */
export async function adminDatabase(max = 4) {
  const fixture = await postgresFixture();
  const db = createAdminDatabase(fixture.runtimeUrl(fixture.adminUrl), {
    repositories: { records: AdminRecords },
    pool: { max },
  });
  try {
    await migrateDatabase('admin', fixture.adminUrl, adminRecordModules);
    const owner = fixture.owner(fixture.adminUrl);
    await owner.none(
      `
      GRANT USAGE ON SCHEMA admin TO $1:name;
      GRANT SELECT, INSERT, UPDATE, DELETE ON admin.framework_admin_record TO $1:name;
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
