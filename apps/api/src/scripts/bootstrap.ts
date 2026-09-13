/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
// Compatibility entry point; the shared CLI enforces explicit environment selection.
process.exitCode =
  spawnSync(
    process.execPath,
    [
      fileURLToPath(
        new URL('../../../../scripts/database.mjs', import.meta.url)
      ),
      'bootstrap',
      'admin',
      ...process.argv.slice(2),
    ],
    { stdio: 'inherit' }
  ).status ?? 1;
