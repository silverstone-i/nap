/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { pathToFileURL } from 'node:url';
import {
  argumentsFor,
  configuration,
  ProvisioningError,
} from './provision/config.mjs';
import { run } from '../apps/api/dist/services/provisioning/engine.mjs';
import { using, maintenanceUrl } from './provision/postgres.mjs';
import { productionEnvironment } from './provision/production-env.mjs';
import { maintainProduction } from './provision/render-maintenance.mjs';
/** Does: Runs the selected operator command with safe diagnostics and cleanup. Called by: npm entry points. */
export async function cli(args) {
  let context;
  let saved = false;
  let started = false;
  try {
    const command = argumentsFor(args);
    if (command.target === 'cell')
      throw new ProvisioningError('Use Management Cells for cell provisioning');
    const env =
      command.environment === 'prod'
        ? await productionEnvironment()
        : process.env;
    context = await configuration(command, env);
    const save = context.save;
    /** Does: Records whether progress was successfully persisted for error reporting. */
    context.save = async () => {
      await save();
      saved = true;
    };
    started = true;
    const result =
      command.environment === 'prod'
        ? await maintainProduction(command, context, () =>
            run(command, context)
          )
        : await run(command, context);
    console.log(JSON.stringify(result));
  } catch (error) {
    if (context?.activeEntry) {
      const entry = context.activeEntry;
      entry.failureCode = 'OPERATION_FAILED';
      try {
        await context.save();
        if (entry.id && context.state.databases.admin)
          await using(maintenanceUrl(context.state.databases.admin), db =>
            db.none(
              "UPDATE admin.cell_provisioning SET failure_code='OPERATION_FAILED' WHERE cell_id=$1",
              [entry.id]
            )
          );
      } catch {
        /* Original failure remains the reported failure. */
      }
    }
    const recovery = saved
      ? `Saved progress is retained for retry at ${context.stateFile}.`
      : started
        ? 'No new provisioning progress was saved; any existing state remains available.'
        : 'Setup stopped before provisioning; any existing state was left unchanged.';
    console.error(
      error instanceof ProvisioningError
        ? `Database operation failed: ${error.message}. ${recovery}`
        : `Database operation failed; verify credentials, saved state, and readiness. ${recovery}`
    );
    process.exitCode = 1;
  } finally {
    await context?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await cli(process.argv.slice(2));
