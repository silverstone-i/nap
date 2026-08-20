/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

// Enforces the COLLABORATION.md dependency policy: every production dependency
// must carry a license from .licenses-allowed.json. Dev dependencies are not
// checked - they do not ship with the application.
//
// license-checker-rseidelsohn is not workspace-aware, and npm hoists workspace
// dependencies to the root node_modules. Run at the root with --production it
// inspects only the root manifest, which declares no production dependencies,
// and passes without checking anything; run with --start against a workspace
// it finds no node_modules there and again checks nothing. Both silently exit
// zero.
//
// So npm computes the production closure across every workspace - it is the
// workspace-aware half - and the checker resolves and validates exactly that
// set against the root node_modules, where the packages actually live.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const { allowed } = JSON.parse(
  readFileSync(join(repoRoot, '.licenses-allowed.json'), 'utf8')
);

if (!Array.isArray(allowed) || allowed.length === 0) {
  console.error('.licenses-allowed.json contains no "allowed" entries.');
  process.exit(1);
}

const listed = spawnSync(
  'npm',
  ['ls', '--omit=dev', '--all', '--json', '--workspaces'],
  { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
);

if (!listed.stdout) {
  console.error('npm ls produced no output; cannot determine production deps.');
  process.exit(1);
}

const packages = new Set();

(function walk(node) {
  for (const [name, dependency] of Object.entries(node.dependencies ?? {})) {
    if (!dependency.version) continue;

    const spec = `${name}@${dependency.version}`;
    if (packages.has(spec)) continue;

    packages.add(spec);
    walk(dependency);
  }
})(JSON.parse(listed.stdout));

// The workspaces themselves are private and carry no third-party risk.
const thirdParty = [...packages].filter(spec => !spec.startsWith('@nap/'));

if (thirdParty.length === 0) {
  console.error('No production dependencies resolved; refusing to pass.');
  process.exit(1);
}

console.log(`Checking ${thirdParty.length} production packages.`);

const result = spawnSync(
  'npx',
  [
    // --no-install keeps this to the pinned devDependency: bare npx would
    // fetch and execute a remote version if node_modules is not installed.
    '--no-install',
    'license-checker-rseidelsohn',
    '--excludePrivatePackages',
    '--includePackages',
    thirdParty.join(';'),
    '--onlyAllow',
    allowed.join(';'),
    '--summary',
  ],
  { cwd: repoRoot, stdio: 'inherit' }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
