/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  readFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { publishLocal } from '../provision/config.mjs';

// Run copies in isolated processes so tests never read the developer's .env or
// change the test runner's environment. Exercise both source and built layouts.
it.each(['src/util/env.ts', 'dist/util/env.js'])(
  'loads the optional API environment from %s independently of the working directory',
  relativePath => {
    const directory = mkdtempSync(join(tmpdir(), 'nap-env-test-'));
    try {
      const api = join(directory, 'apps/api');
      const module = join(api, relativePath);
      mkdirSync(join(api, relativePath.split('/')[0], 'util'), {
        recursive: true,
      });
      writeFileSync(join(api, 'package.json'), '{"type":"module"}');
      copyFileSync(join('apps/api', relativePath), module);
      const run = (denyAccess = false) =>
        spawnSync(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `import { loadLocalEnvironment } from ${JSON.stringify(pathToFileURL(module).href)};
             import { chmodSync } from 'node:fs';
             const api = ${JSON.stringify(api)};
             // Import first so only environment loading encounters the denial.
             if (${denyAccess}) chmodSync(api, 0);
             try {
               loadLocalEnvironment();
             } finally {
               if (${denyAccess}) chmodSync(api, 0o755);
             }
             console.log(JSON.stringify([
               process.env.NAP_TEST_LOCAL ?? null,
               process.env.NAP_TEST_EXISTING,
               process.env.NAP_TEST_EMPTY,
             ]));`,
          ],
          {
            cwd: directory,
            env: { NAP_TEST_EXISTING: 'inherited', NAP_TEST_EMPTY: '' },
            encoding: 'utf8',
            timeout: 5000,
          }
        );
      const missing = run();
      expect(missing.status, missing.stderr).toBe(0);
      expect(JSON.parse(missing.stdout)).toEqual([null, 'inherited', '']);

      writeFileSync(
        join(api, '.env'),
        'NAP_TEST_LOCAL="from file"\nNAP_TEST_EXISTING=local\nNAP_TEST_EMPTY=local\n'
      );
      const loaded = run();
      expect(loaded.status, loaded.stderr).toBe(0);
      expect(JSON.parse(loaded.stdout)).toEqual(['from file', 'inherited', '']);

      // POSIX directory permissions exercise the actual filesystem failure.
      // Root bypasses these permissions; Windows does not implement this mode.
      if (process.platform !== 'win32' && process.getuid?.() !== 0) {
        const denied = run(true);
        expect(denied.status).toBe(1);
        expect(denied.stderr).toContain('EACCES');
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
);

it.each([
  ['migrate', ['--target', 'cell']],
  ['migrate', ['--target', 'cell', '--cell-id', 'not-a-uuid']],
  ['reset', ['--target', 'cell', '--confirm']],
  ['reset', ['--target', 'cell', '--cell-id', 'not-a-uuid', '--confirm']],
])(
  'refuses invalid %s cell arguments before loading environment or connecting',
  (script, args) => {
    const result = spawnSync(
      process.execPath,
      [`apps/api/dist/scripts/${script}.js`, ...args],
      {
        env: { NODE_ENV: 'test' },
        encoding: 'utf8',
        timeout: 5000,
      }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('failed');
    expect(result.stderr).not.toContain('not-a-uuid');
  }
);

it('publishes setup and cell values without moving variables or comments', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nap-env-publish-'));
  const envFile = join(directory, '.env');
  try {
    const original =
      '# Admin endpoint\nADMIN_DATABASE_DEV=localhost/old\n\n# Cells\nCELL_DATABASES_DEV={}\n# End\n';
    writeFileSync(envFile, original);
    await publishLocal(
      { envFile },
      {
        ADMIN_DATABASE_DEV: 'localhost/nap_dev_admin',
        CELL_DATABASES_DEV: JSON.stringify({
          east: 'localhost/nap_dev_cell_east',
        }),
      }
    );
    const updated = readFileSync(envFile, 'utf8');
    expect(updated).toBe(
      original
        .replace(
          'ADMIN_DATABASE_DEV=localhost/old',
          "ADMIN_DATABASE_DEV='localhost/nap_dev_admin'"
        )
        .replace(
          'CELL_DATABASES_DEV={}',
          `CELL_DATABASES_DEV='{"east":"localhost/nap_dev_cell_east"}'`
        )
    );
    await publishLocal(
      { envFile },
      { ADMIN_DATABASE_DEV: 'localhost/nap_dev_admin' }
    );
    expect(readFileSync(envFile, 'utf8')).toBe(updated);
    await publishLocal({ envFile }, { NAP_TEST_ADDED: 'new' });
    expect(readFileSync(envFile, 'utf8')).toBe(
      updated + "NAP_TEST_ADDED='new'\n"
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('publishes a live cell map despite the API retaining its startup environment', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nap-live-env-'));
  const envFile = join(directory, '.env');
  const previous = process.env.CELL_DATABASES_DEV;
  try {
    const first = JSON.stringify({ east: 'localhost/nap_dev_cell_east' });
    process.env.CELL_DATABASES_DEV = first;
    writeFileSync(envFile, `# Cells\nCELL_DATABASES_DEV='${first}'\n`);
    await publishLocal(
      { envFile, api: true },
      {
        CELL_DATABASES_DEV: JSON.stringify({
          west: 'localhost/nap_dev_cell_west',
        }),
      }
    );
    expect(readFileSync(envFile, 'utf8')).toBe(
      `# Cells\nCELL_DATABASES_DEV='${JSON.stringify({ east: 'localhost/nap_dev_cell_east', west: 'localhost/nap_dev_cell_west' })}'\n`
    );
    expect(process.env.CELL_DATABASES_DEV).toBe(first);
  } finally {
    if (previous === undefined) delete process.env.CELL_DATABASES_DEV;
    else process.env.CELL_DATABASES_DEV = previous;
    rmSync(directory, { recursive: true, force: true });
  }
});
