/**
 * @file Shared file scanning utilities for architecture checks
 * @module scripts/arch/lib/fileScanner
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const SRC = join(ROOT, 'apps', 'nap-serv', 'src');

/**
 * Recursively collect all .js files under a directory.
 * @param {string} dir Absolute path
 * @param {string[]} [acc=[]] Accumulator
 * @returns {string[]} Absolute file paths
 */
export function walkJs(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJs(full, acc);
    } else if (entry.name.endsWith('.js')) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Extract ES module import specifiers from a file's source text.
 * Returns only string-literal `from '...'` specifiers (static imports + re-exports).
 * @param {string} source File content
 * @returns {string[]} Raw specifier strings (e.g., '../services/index.js')
 */
export function extractImports(source) {
  const results = [];
  // Match: import ... from '...'; and export ... from '...';
  const re = /(?:import|export)\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    results.push(m[1]);
  }
  return results;
}

/**
 * Read a file and extract its import specifiers.
 * @param {string} filePath Absolute path
 * @returns {{ filePath: string, source: string, imports: string[] }}
 */
export function scanFile(filePath) {
  const source = readFileSync(filePath, 'utf8');
  return { filePath, source, imports: extractImports(source) };
}

/**
 * List immediate subdirectory names under a path.
 * @param {string} dir Absolute path
 * @returns {string[]} Directory names (not full paths)
 */
export function listDirs(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

/**
 * Check whether a directory contains a `schema/` or `schemas/` subdirectory.
 * @param {string} dir Absolute path
 * @returns {boolean}
 */
export function hasSchemaDir(dir) {
  return readdirSync(dir, { withFileTypes: true }).some((d) => d.isDirectory() && (d.name === 'schema' || d.name === 'schemas'));
}

export { ROOT, SRC };
