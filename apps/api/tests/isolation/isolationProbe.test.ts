/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Phase 1 gate: the probe table proves the isolation boundary end to end
 * against a real cell database, as the real runtime role.
 */

import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll } from 'vitest';

import { createCellDb } from '../../src/db/cell/createCellDb.js';
import type { CellDatabase } from '../../src/db/cell/createCellDb.js';
import { migrateCell } from '../../src/db/cell/migrateCell.js';
import {
  IsolationProbe,
  isolationProbeModule,
} from '../fixtures/isolationProbe.js';
import { registerTenantIsolationTests } from '../fixtures/tenantIsolationHarness.js';
import {
  describeDatabase,
  testDatabaseUrls,
} from '../fixtures/testDatabases.js';

describeDatabase('cell.isolation_probe', () => {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  let cellDb: CellDatabase;

  beforeAll(async () => {
    const urls = testDatabaseUrls();

    // Migrations run with the owning role, through the same runner a release
    // uses. The probe module is supplied here and is not in the cell registry.
    await migrateCell({
      connectionString: urls.cellMigration,
      modules: [isolationProbeModule],
    });

    // Everything after this point runs as the least-privileged runtime role.
    cellDb = createCellDb({ connectionString: urls.cellRuntime });
    await cellDb.connect();
  });

  afterAll(async () => {
    await cellDb?.close();
  });

  registerTenantIsolationTests({
    cellDb: () => cellDb,
    tenantA: () => tenantA,
    tenantB: () => tenantB,
    target: {
      schema: 'cell',
      table: 'isolation_probe',
      mutableColumn: 'label',
      parentColumn: 'parent_id',
      insertRow: async (tx, row) => {
        const probe = new IsolationProbe(tx, cellDb.pgp);
        const inserted = await probe.insert({
          tenant_id: row.tenantId,
          label: row.label,
          parent_id: row.parentId ?? null,
        });

        return inserted.id;
      },
    },
  });
});
