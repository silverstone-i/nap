/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { fileURLToPath } from 'node:url';
import {
  environment,
  productionEnvironment,
  localConfiguration,
  argumentsFor,
} from '../shared/configuration.js';
import { validateAdminRegistry } from '../../modules/admin.js';
import { setupLocal } from '../../infrastructure/provisioning/postgres.js';
import { runRender } from '../../infrastructure/provisioning/render.js';
import { migrateAdmin } from './migrateAdmin.js';
import { MaintenanceError, requireCondition } from '../shared/errors.js';
export async function runAdmin(operation, args, rawEnv = process.env) {
  requireCondition(
    ['setup', 'migrate'].includes(operation),
    'INVALID_OPERATION'
  );
  const selected = argumentsFor(args);
  validateAdminRegistry();
  const env = environment(
    selected === 'prod'
      ? Object.fromEntries(
          Object.entries(rawEnv).filter(([, value]) => value?.trim())
        )
      : rawEnv
  );
  if (selected === 'prod') {
    const settings = productionEnvironment(env);
    return runRender(
      operation,
      settings,
      env.NAP_PROVISION_STATE ||
        fileURLToPath(
          new URL('../../../.env.provisioning.prod.json', import.meta.url)
        ),
      migrateAdmin
    );
  }
  const config = localConfiguration(selected, env);
  return operation === 'setup' ? setupLocal(config) : migrateAdmin(config);
}
export async function cli(operation, args = process.argv.slice(2)) {
  try {
    const result = await runAdmin(operation, args);
    console.log(JSON.stringify({ operation, ...result }));
  } catch (error) {
    console.error(
      JSON.stringify({
        operation,
        status: 'failed',
        code:
          error instanceof MaintenanceError
            ? error.code
            : 'DATABASE_OPERATION_FAILED',
        setting: error instanceof MaintenanceError ? error.setting : undefined,
        created: error instanceof MaintenanceError ? error.created : undefined,
        resourceId:
          error instanceof MaintenanceError ? error.resourceId : undefined,
      })
    );
    process.exitCode = 1;
  }
}
