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
/**
 * Run an admin database maintenance operation for one environment.
 *
 * Validates the module registry before loading configuration. `dev` and
 * `test` run against the local PostgreSQL server; `prod` provisions and
 * connects through Render using the private state file.
 * @param {'setup'|'migrate'} operation
 * @param {string[]} args CLI arguments, `--env <dev|test|prod>`.
 * @param {NodeJS.ProcessEnv} [rawEnv=process.env]
 * @returns {Promise<{status: 'created'|'unchanged'|'applied', database: string}>}
 * @throws {MaintenanceError} On invalid input, configuration, or a failed operation.
 */
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
/**
 * Command-line wrapper for `runAdmin`. Prints one JSON line to stdout on
 * success or to stderr on failure, and sets a nonzero exit code on failure.
 * Output contains codes, setting names, and resource identifiers only.
 * @param {'setup'|'migrate'} operation
 * @param {string[]} [args=process.argv.slice(2)]
 * @returns {Promise<void>}
 */
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
