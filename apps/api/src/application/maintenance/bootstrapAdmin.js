/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import {
  argon2PolicyFromEnv,
  argumentsFor,
  bootstrapSecrets,
  environment,
  localConfiguration,
  productionAdminConnection,
  productionEnvironment,
  roleUrl,
} from '../shared/configuration.js';
import { validateAdminRegistry } from '../../modules/admin.js';
import { createAdminDatabase } from '../../infrastructure/runtime/adminDatabase.js';
import { bootstrapRoot } from '../../modules/admin-tenancy/domain/bootstrap.js';
/**
 * Create or verify the owning tenant, root portal user, and root membership
 * for one environment, connecting as `nap-admin` per M0001-00 §4.
 *
 * `dev` and `test` read the local admin connection settings; `prod` reads
 * the already-published `ADMIN_DATABASE_PROD` entry rather than performing
 * Render's setup/migrate resource reconciliation, since bootstrap requires
 * migration to have already run (`docs/architecture/migrations.md`).
 * @param {string[]} args CLI arguments, `--env <dev|test|prod>`.
 * @param {NodeJS.ProcessEnv} [rawEnv=process.env]
 * @returns {Promise<{status: 'created'|'existing'|'conflict', code?: string, tenant?: object, rootUser?: object, membership?: object}>}
 * @throws {MaintenanceError|AdminBootstrapError} On invalid input, configuration, or a failed operation.
 */
export async function runBootstrap(args, rawEnv = process.env) {
  const selected = argumentsFor(args);
  validateAdminRegistry();
  const env = environment(
    selected === 'prod'
      ? Object.fromEntries(
          Object.entries(rawEnv).filter(([, value]) => value?.trim())
        )
      : rawEnv
  );
  const merged = selected === 'prod' ? productionEnvironment(env) : env;
  const secrets = bootstrapSecrets(selected, merged);
  const connection =
    selected === 'prod'
      ? productionAdminConnection(merged)
      : localConfiguration(selected, merged);
  const handle = createAdminDatabase(
    roleUrl(connection.endpoint, 'nap-admin', connection.adminPassword)
  );
  try {
    await handle.connect();
    return await bootstrapRoot(handle.db, {
      tenantCode: secrets.tenantCode,
      tenantName: secrets.tenantName,
      rootEmail: secrets.rootEmail,
      rootPassword: secrets.rootPassword,
      hashingPolicy: argon2PolicyFromEnv(merged),
    });
  } finally {
    await handle.close();
  }
}
/**
 * Command-line wrapper for `runBootstrap`. Prints one JSON line to stdout
 * with the outcome and created record UUIDs, and sets a nonzero exit code
 * for a conflict as well as a thrown failure (M0001-02 §10). Output never
 * contains a password, hash, or connection secret (M0001-02-R006).
 * @param {string[]} [args=process.argv.slice(2)]
 * @returns {Promise<void>}
 */
export async function cli(args = process.argv.slice(2)) {
  try {
    const result = await runBootstrap(args);
    console.log(JSON.stringify({ operation: 'bootstrap', ...result }));
    if (result.status === 'conflict') process.exitCode = 1;
  } catch (error) {
    console.error(
      JSON.stringify({
        operation: 'bootstrap',
        status: 'failed',
        code: error?.code ?? 'DATABASE_OPERATION_FAILED',
      })
    );
    process.exitCode = 1;
  }
}
