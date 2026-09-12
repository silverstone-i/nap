/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { createAdminDatabase } from '../db/admin/index.js';
import { adminRepositories } from '../db/admin/repositories.js';
import { createCellDatabase } from '../db/cell/index.js';
import { cellRepositories } from '../db/cell/repositories.js';
import { withTenantTransaction } from '../db/withTenantTransaction.js';
import { seedTenantRoles } from '../services/roleSeeds.js';
import {
  transitionAccess,
  transitionSchema,
} from '../services/accessTransition.js';
import {
  loadLocalEnvironment,
  resolveMigrationConfiguration,
  resolveCellMaintenanceConfiguration,
} from '../util/env.js';
// Maintenance entry point; mapping files contain identifiers, never credentials.
try {
  const [command, arg, cellId, ...extra] = process.argv.slice(2);
  if (
    extra.length ||
    !cellId ||
    !z.uuid().safeParse(cellId).success ||
    !arg ||
    !['seed', 'transition'].includes(command ?? '')
  )
    throw new Error('Invalid arguments');
  loadLocalEnvironment();
  const cell = createCellDatabase(resolveCellMaintenanceConfiguration(cellId), {
    repositories: cellRepositories,
  });
  try {
    if (command === 'seed') {
      const admin = createAdminDatabase(
        resolveMigrationConfiguration('admin'),
        { repositories: adminRepositories }
      );
      try {
        const assignment = await admin.db.cells.assignment(z.uuid().parse(arg));
        if (!assignment?.enabled || assignment.cell_id !== cellId)
          throw new Error('Maintenance tenant mismatch');
        await withTenantTransaction(cell, arg, async tx => {
          await tx.roles.lockTenant(arg);
          if (!(await tx.cell_tenants.findById(arg)))
            throw new Error('Unknown tenant');
          await seedTenantRoles(tx, arg);
        });
      } finally {
        await admin.close();
      }
    } else {
      const mapping = transitionSchema.parse(
        JSON.parse(await readFile(arg, 'utf8'))
      );

      if (mapping.cell !== cellId) throw new Error('Cell mapping mismatch');
      const admin = createAdminDatabase(
        resolveMigrationConfiguration('admin'),
        { repositories: adminRepositories }
      );
      try {
        await transitionAccess(admin, cell, mapping);
      } finally {
        await admin.close();
      }
    }
  } finally {
    await cell.close();
  }
  console.log('Access maintenance complete');
} catch {
  console.error(
    'Access maintenance failed; check command, reviewed mapping, cell target and migrations'
  );
  process.exitCode = 1;
}
