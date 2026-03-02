#!/usr/bin/env node

/**
 * @file Architecture check orchestrator — runs all invariant checks and writes reports
 * @module scripts/arch/runAll
 *
 * Usage:
 *   node scripts/arch/runAll.js          # advisory mode (always exits 0)
 *   node scripts/arch/runAll.js --check  # CI mode (exits 1 on any violation)
 */

import checkModuleRegistry from './checkModuleRegistry.js';
import checkBarrelExports from './checkBarrelExports.js';
import checkCircularDeps from './checkCircularDeps.js';
import checkMiddlewareChain from './checkMiddlewareChain.js';
import checkMigrationOrder from './checkMigrationOrder.js';
import { writeReports } from './lib/reportWriter.js';

const isCheck = process.argv.includes('--check');

// Run all checks
const registryResult = checkModuleRegistry();
const barrelResult = checkBarrelExports();
const circularResult = checkCircularDeps();
const middlewareResult = checkMiddlewareChain();
const migrationResult = checkMigrationOrder();

const checks = [registryResult, barrelResult, circularResult, middlewareResult, migrationResult];
const overallPass = checks.every((c) => c.pass);

const report = {
  timestamp: new Date().toISOString(),
  pass: overallPass,
  checks: checks.map(({ name, pass, summary, violations, details }) => ({
    name,
    pass,
    summary,
    violations,
    details,
  })),
};

// Write artifacts
writeReports(report, circularResult.graph || {});

// Console summary
console.log('\n=== Architecture Report ===\n');
for (const check of checks) {
  const icon = check.pass ? '\u2705' : '\u274c';
  console.log(`${icon}  ${check.name}: ${check.summary}`);
  if (!check.pass && check.violations.length > 0) {
    for (const v of check.violations) {
      console.log(`   - ${v}`);
    }
  }
}
console.log(`\nOverall: ${overallPass ? 'PASS' : 'FAIL'}\n`);

// Exit code
if (isCheck && !overallPass) {
  process.exit(1);
}
