/**
 * @file Check that every module/system directory with schemas or migrations is registered
 * @module scripts/arch/checkModuleRegistry
 */

import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { SRC, listDirs, hasSchemaDir } from './lib/fileScanner.js';

/** Directories exempt from registration (no schema/migrations, uses parent module tables) */
const EXEMPT = new Set(['tenants']);

/**
 * Extract registered module names from moduleRegistry.js source text.
 * Parses `name: 'moduleName'` entries via regex (avoids importing the live module).
 * @returns {Set<string>}
 */
function parseRegisteredNames() {
  const src = readFileSync(join(SRC, 'db', 'moduleRegistry.js'), 'utf8');
  const names = new Set();
  const re = /name:\s*['"](\w+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    names.add(m[1]);
  }
  return names;
}

/**
 * Scan module/system directories and compare against the registry.
 * @returns {{ name: string, pass: boolean, summary: string, violations: string[], details: object }}
 */
export default function checkModuleRegistry() {
  const registered = parseRegisteredNames();

  // Collect all directories under modules/ and system/ that have schema definitions
  const directories = [];
  for (const scope of ['modules', 'system']) {
    const scopeDir = join(SRC, scope);
    for (const name of listDirs(scopeDir)) {
      const full = join(scopeDir, name);
      directories.push({ scope, name, hasSchema: hasSchemaDir(full) });
    }
  }

  const missing = [];
  const exempt = [];

  for (const dir of directories) {
    if (EXEMPT.has(dir.name)) {
      exempt.push(dir.name);
      continue;
    }
    if (dir.hasSchema && !registered.has(dir.name)) {
      missing.push(`${dir.scope}/${dir.name}`);
    }
  }

  const pass = missing.length === 0;

  return {
    name: 'Module Registry Completeness',
    pass,
    summary: pass
      ? `All ${registered.size} registered modules accounted for. ${exempt.length} exempt.`
      : `${missing.length} module(s) with schemas not registered.`,
    violations: missing.map((m) => `${m} has schema/migrations but is not in moduleRegistry.js`),
    details: {
      registered: [...registered].sort(),
      directories: directories.map((d) => `${d.scope}/${d.name}`).sort(),
      exempt: [...exempt],
      missing,
    },
  };
}
