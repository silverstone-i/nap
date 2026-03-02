/**
 * @file Check that cross-module imports go through barrel exports (services/index.js)
 * @module scripts/arch/checkBarrelExports
 */

import { join, relative } from 'node:path';
import { SRC, walkJs, scanFile } from './lib/fileScanner.js';
import { moduleOf, resolveImport, isInfrastructure } from './lib/moduleResolver.js';

/**
 * Scan all source files for cross-module imports that bypass barrel exports.
 * @returns {{ name: string, pass: boolean, summary: string, violations: object[], details: object }}
 */
export default function checkBarrelExports() {
  const violations = [];
  let compliant = 0;
  let crossModule = 0;

  // Scan modules/ and system/ directories
  const modulesDir = join(SRC, 'modules');
  const systemDir = join(SRC, 'system');
  const files = [...walkJs(modulesDir), ...walkJs(systemDir)];

  for (const filePath of files) {
    // Skip infrastructure files (they are cross-cutting by design)
    if (isInfrastructure(filePath)) continue;

    const homeModule = moduleOf(filePath);
    if (!homeModule) continue;

    const { imports } = scanFile(filePath);

    for (const spec of imports) {
      // Skip package imports
      if (!spec.startsWith('.')) continue;

      const { targetModule, isBarrelImport } = resolveImport(spec, filePath);

      // Skip intra-module imports (same module) and infrastructure targets
      if (!targetModule || targetModule === homeModule) continue;

      crossModule++;

      if (isBarrelImport) {
        compliant++;
      } else {
        violations.push({
          file: relative(SRC, filePath),
          importPath: spec,
          homeModule,
          targetModule,
        });
      }
    }
  }

  const pass = violations.length === 0;

  return {
    name: 'Barrel Export Contract',
    pass,
    summary: pass
      ? `${crossModule} cross-module import(s) — all via barrel exports.`
      : `${violations.length} cross-module import(s) bypass barrel exports.`,
    violations: violations.map(
      (v) => `${v.file}: imports ${v.targetModule} via "${v.importPath}" instead of services/index.js`,
    ),
    details: { crossModule, compliant, violationCount: violations.length, violations },
  };
}
