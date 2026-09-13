/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// Compatibility entry point; the shared CLI verifies environment and physical identity.
const [flag, target, ...args] = process.argv.slice(2);
if (flag !== '--target' || !target || !['admin', 'cell'].includes(target)) {
  console.error(
    'Database migration failed; expected --target admin|cell and --env dev|test|prod'
  );
  process.exitCode = 1;
} else {
  process.exitCode =
    spawnSync(
      process.execPath,
      [
        fileURLToPath(
          new URL('../../../../scripts/database.mjs', import.meta.url)
        ),
        'migrate',
        target,
        ...args,
      ],
      { stdio: 'inherit' }
    ).status ?? 1;
}
