/**
 * @file Writes architecture check results as JSON and Markdown artifacts
 * @module scripts/arch/lib/reportWriter
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './fileScanner.js';

const OUT_DIR = join(ROOT, 'docs', 'architecture');

/**
 * Ensure the output directory exists and write both JSON and Markdown reports.
 * @param {object} report Full report object from runAll
 * @param {object} dependencyGraph Module adjacency list from checkCircularDeps
 */
export function writeReports(report, dependencyGraph) {
  mkdirSync(OUT_DIR, { recursive: true });

  writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(join(OUT_DIR, 'dependency-graph.json'), JSON.stringify(dependencyGraph, null, 2) + '\n');
  writeFileSync(join(OUT_DIR, 'report.md'), renderMarkdown(report));
}

/**
 * Render the report object as a human-readable Markdown string.
 * @param {object} report
 * @returns {string}
 */
function renderMarkdown(report) {
  const lines = [];
  lines.push('# Architecture Report');
  lines.push('');
  lines.push(`Generated: ${report.timestamp}`);
  lines.push(`Overall: **${report.pass ? 'PASS' : 'FAIL'}**`);
  lines.push('');

  for (const check of report.checks) {
    const icon = check.pass ? '\u2705' : '\u274c';
    lines.push(`## ${icon} ${check.name}`);
    lines.push('');

    if (check.summary) {
      lines.push(check.summary);
      lines.push('');
    }

    if (check.violations && check.violations.length > 0) {
      lines.push('### Violations');
      lines.push('');
      for (const v of check.violations) {
        lines.push(`- ${typeof v === 'string' ? v : JSON.stringify(v)}`);
      }
      lines.push('');
    }

    if (check.details) {
      lines.push('### Details');
      lines.push('');
      lines.push('```json');
      lines.push(JSON.stringify(check.details, null, 2));
      lines.push('```');
      lines.push('');
    }
  }

  return lines.join('\n');
}

export { OUT_DIR };
