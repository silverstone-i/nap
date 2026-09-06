/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

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
      const run = () =>
        spawnSync(
          process.execPath,
          [
            '--input-type=module',
            '-e',
            `import { loadLocalEnvironment } from ${JSON.stringify(pathToFileURL(module).href)};
             loadLocalEnvironment();
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
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
);
