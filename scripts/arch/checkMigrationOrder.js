/**
 * @file Check migration file naming conventions and index.js consistency
 * @module scripts/arch/checkMigrationOrder
 */

import { join, relative } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { SRC } from './lib/fileScanner.js';

const TIMESTAMP_RE = /^(\d{12})_\w+\.js$/;

/**
 * Find all schema/migrations/ directories and validate their contents.
 * @returns {{ name: string, pass: boolean, summary: string, violations: string[], details: object }}
 */
export default function checkMigrationOrder() {
  const migrationDirs = findMigrationDirs(SRC);
  const allTimestamps = new Map(); // timestamp → [filepath, ...]
  const modules = [];
  const issues = [];

  for (const dir of migrationDirs) {
    const rel = relative(SRC, dir);
    const migrationFiles = readdirSync(dir)
      .filter((f) => f.endsWith('.js') && f !== 'index.js')
      .sort();

    const parsed = [];

    for (const file of migrationFiles) {
      const match = file.match(TIMESTAMP_RE);
      if (!match) {
        issues.push(`${rel}/${file}: filename does not match YYYYMMDDNNNN_name.js convention`);
        parsed.push({ file, timestamp: null, valid: false });
        continue;
      }

      const timestamp = match[1];
      parsed.push({ file, timestamp, valid: true });

      // Track for cross-module duplicate detection
      if (!allTimestamps.has(timestamp)) allTimestamps.set(timestamp, []);
      allTimestamps.get(timestamp).push(`${rel}/${file}`);
    }

    // Check ordering within module
    const timestamps = parsed.filter((p) => p.valid).map((p) => p.timestamp);
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] < timestamps[i - 1]) {
        issues.push(`${rel}: migrations out of order — ${timestamps[i - 1]} before ${timestamps[i]}`);
      }
    }

    // Check index.js consistency
    const indexPath = join(dir, 'index.js');
    const indexIssues = validateIndex(indexPath, migrationFiles, rel);
    issues.push(...indexIssues);

    modules.push({ path: rel, migrations: parsed, issueCount: indexIssues.length });
  }

  // Cross-module duplicate timestamps
  for (const [ts, files] of allTimestamps) {
    if (files.length > 1) {
      issues.push(`Duplicate timestamp ${ts} in: ${files.join(', ')}`);
    }
  }

  const pass = issues.length === 0;

  return {
    name: 'Migration Ordering',
    pass,
    summary: pass
      ? `${migrationDirs.length} migration directories checked — all valid.`
      : `${issues.length} migration issue(s) found.`,
    violations: issues,
    details: { dirCount: migrationDirs.length, modules, duplicateTimestamps: [...allTimestamps.entries()].filter(([, v]) => v.length > 1) },
  };
}

/**
 * Recursively find all schema/migrations/ directories.
 * @param {string} baseDir
 * @returns {string[]}
 */
function findMigrationDirs(baseDir) {
  const results = [];

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const full = join(dir, entry.name);
      if (entry.name === 'migrations' && dir.endsWith('/schema')) {
        results.push(full);
      } else {
        walk(full);
      }
    }
  }

  walk(baseDir);
  return results;
}

/**
 * Validate that index.js imports match migration files on disk.
 * @param {string} indexPath
 * @param {string[]} migrationFiles
 * @param {string} relDir
 * @returns {string[]} Issues
 */
function validateIndex(indexPath, migrationFiles, relDir) {
  const issues = [];

  let source;
  try {
    source = readFileSync(indexPath, 'utf8');
  } catch {
    if (migrationFiles.length > 0) {
      issues.push(`${relDir}: missing index.js but has ${migrationFiles.length} migration file(s)`);
    }
    return issues;
  }

  // Extract imported filenames from: import name from './FILENAME';
  const importedFiles = [];
  const re = /from\s+['"]\.\/([\w]+)['"]/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    importedFiles.push(m[1] + '.js');
  }

  // Files on disk but not imported
  for (const file of migrationFiles) {
    const stem = file.replace('.js', '');
    if (!importedFiles.includes(file) && !source.includes(stem)) {
      issues.push(`${relDir}/index.js: migration ${file} exists on disk but is not imported`);
    }
  }

  // Imported but not on disk
  for (const file of importedFiles) {
    if (!migrationFiles.includes(file)) {
      issues.push(`${relDir}/index.js: imports ${file} but file does not exist on disk`);
    }
  }

  return issues;
}
