/**
 * @file Resolves file paths and import specifiers to module identifiers
 * @module scripts/arch/lib/moduleResolver
 */

import { resolve, relative, dirname } from 'node:path';
import { SRC } from './fileScanner.js';

/** Directories that are cross-cutting infrastructure, not modules */
const INFRA_DIRS = new Set(['lib', 'middleware', 'db', 'services']);

/**
 * Determine the module identifier for a file path under src/.
 *
 * Examples:
 *   src/modules/accounting/controllers/foo.js  → 'accounting'
 *   src/system/core/services/index.js          → 'core'
 *   src/middleware/authRedis.js                 → null (infrastructure)
 *   src/lib/createRouter.js                    → null (infrastructure)
 *   src/services/tenantProvisioning.js          → null (infrastructure)
 *
 * @param {string} filePath Absolute path
 * @returns {string|null} Module name or null for infrastructure
 */
export function moduleOf(filePath) {
  const rel = relative(SRC, filePath);
  const parts = rel.split('/');

  if (parts[0] === 'modules' && parts.length >= 2) return parts[1];
  if (parts[0] === 'system' && parts.length >= 2) return parts[1];
  return null;
}

/**
 * Determine the module scope ('modules' or 'system') for a file.
 * @param {string} filePath Absolute path
 * @returns {'modules'|'system'|null}
 */
export function scopeOf(filePath) {
  const rel = relative(SRC, filePath);
  const parts = rel.split('/');
  if (parts[0] === 'modules') return 'modules';
  if (parts[0] === 'system') return 'system';
  return null;
}

/**
 * Resolve a relative import specifier to its target module.
 *
 * @param {string} specifier Raw import specifier (e.g., '../../accounting/services/index.js')
 * @param {string} importerPath Absolute path of the importing file
 * @returns {{ targetModule: string|null, targetPath: string, isBarrelImport: boolean }}
 */
export function resolveImport(specifier, importerPath) {
  // Skip non-relative imports (packages)
  if (!specifier.startsWith('.')) {
    return { targetModule: null, targetPath: specifier, isBarrelImport: false };
  }

  const importerDir = dirname(importerPath);
  const targetPath = resolve(importerDir, specifier);
  const targetModule = moduleOf(targetPath);
  const isBarrelImport = specifier.endsWith('services/index.js');

  return { targetModule, targetPath, isBarrelImport };
}

/**
 * Check whether a file is in an infrastructure directory (not a module).
 * @param {string} filePath Absolute path
 * @returns {boolean}
 */
export function isInfrastructure(filePath) {
  const rel = relative(SRC, filePath);
  const topDir = rel.split('/')[0];
  return INFRA_DIRS.has(topDir);
}
