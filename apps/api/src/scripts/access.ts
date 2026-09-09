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
} from '../util/env.js';
// Maintenance entry point; mapping files contain identifiers, never credentials.
try {
  const [command, arg, ...extra] = process.argv.slice(2);
  if (extra.length || !arg || !['seed', 'transition'].includes(command ?? ''))
    throw new Error('Invalid arguments');
  loadLocalEnvironment();
  const cell = createCellDatabase(resolveMigrationConfiguration('cell'), {
    repositories: cellRepositories,
  });
  try {
    if (command === 'seed')
      await withTenantTransaction(cell, z.uuid().parse(arg), async tx => {
        await tx.roles.lockTenant(arg);
        if (!(await tx.cell_tenants.findById(arg)))
          throw new Error('Unknown tenant');
        await seedTenantRoles(tx, arg);
      });
    else {
      const mapping = transitionSchema.parse(
        JSON.parse(await readFile(arg, 'utf8'))
      );
      if (mapping.cell !== process.env.CELL_CODE)
        throw new Error('Cell mapping mismatch');
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
