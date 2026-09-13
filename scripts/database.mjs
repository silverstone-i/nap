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
/** Does: Runs the selected operator command with safe diagnostics and cleanup. Called by: npm entry points. */
export async function cli(args) {
  let context;
  try {
    const command = argumentsFor(args);
    if (command.target === 'cell')
      throw new ProvisioningError('Use Management Cells for cell provisioning');
    context = await configuration(command);
    console.log(JSON.stringify(await run(command, context)));
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
    console.error(
      error instanceof ProvisioningError
        ? `Database operation failed: ${error.message}. Resources were retained for recovery.`
        : 'Database operation failed; verify credentials, saved state, and readiness. Resources were retained for recovery.'
    );
    process.exitCode = 1;
  } finally {
    await context?.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await cli(process.argv.slice(2));
