#!/usr/bin/env node

/**
 * @file AI architecture review — reads artifacts + diff, calls LLM, outputs Markdown
 * @module scripts/arch/aiInterpret
 *
 * Usage:
 *   # Pipe diff via stdin
 *   git diff main...HEAD -- apps/nap-serv/src/ | node scripts/arch/aiInterpret.js
 *
 *   # Or specify artifacts path explicitly
 *   node scripts/arch/aiInterpret.js --artifacts docs/architecture/report.json
 *
 *   # Select provider (default: claude)
 *   node scripts/arch/aiInterpret.js --provider openai
 *
 * Environment:
 *   OPENAI_API_KEY      — required if --provider openai
 *   ANTHROPIC_API_KEY   — required if --provider claude
 *   AI_PROVIDER         — fallback for --provider flag
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createProvider } from './lib/aiProvider.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const DEFAULT_ARTIFACTS = join(ROOT, 'docs', 'architecture', 'report.json');
const PROMPT_TEMPLATE = readFileSync(join(import.meta.dirname, 'prompts', 'review.md'), 'utf8');

// Parse args
const args = process.argv.slice(2);
const provider = getFlag(args, '--provider') || process.env.AI_PROVIDER || 'claude';
const artifactsPath = getFlag(args, '--artifacts') || DEFAULT_ARTIFACTS;

// Read artifacts
let reportJson, dependencyGraph;
try {
  reportJson = readFileSync(artifactsPath, 'utf8');
  const graphPath = join(resolve(artifactsPath, '..'), 'dependency-graph.json');
  dependencyGraph = readFileSync(graphPath, 'utf8');
} catch (err) {
  console.error(`Failed to read architecture artifacts: ${err.message}`);
  console.error('Run "npm run arch" first to generate artifacts.');
  process.exit(1);
}

// Read diff from stdin (non-blocking: if no stdin data, use empty diff)
const diff = await readStdin();

if (!diff.trim()) {
  console.error('No diff provided on stdin. Usage: git diff ... | node scripts/arch/aiInterpret.js');
  process.exit(1);
}

// Truncate diff to avoid exceeding context window (keep first 12000 chars)
const MAX_DIFF = 12000;
const truncatedDiff = diff.length > MAX_DIFF ? diff.slice(0, MAX_DIFF) + '\n... (diff truncated)' : diff;

// Build prompt
const prompt = PROMPT_TEMPLATE.replace('{{REPORT_JSON}}', reportJson)
  .replace('{{DEPENDENCY_GRAPH}}', dependencyGraph)
  .replace('{{DIFF}}', truncatedDiff);

// Call LLM
try {
  const ai = createProvider(provider);
  const review = await ai.interpret(prompt);

  // Output: header + review body (suitable for sticky PR comment)
  const output = [
    '## Architecture Review (AI)',
    '',
    `> Provider: ${provider} | Generated: ${new Date().toISOString()}`,
    '',
    review,
  ].join('\n');

  process.stdout.write(output);
} catch (err) {
  console.error(`AI review failed: ${err.message}`);
  process.exit(1);
}

// --- Helpers ---

/**
 * Read all of stdin as a string.
 * Resolves immediately with '' if stdin is a TTY (no piped data).
 * @returns {Promise<string>}
 */
function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => chunks.push(chunk));
    process.stdin.on('end', () => resolve(chunks.join('')));
    process.stdin.on('error', () => resolve(''));
  });
}

/**
 * Extract a --flag value from argv.
 * @param {string[]} argv
 * @param {string} flag
 * @returns {string|undefined}
 */
function getFlag(argv, flag) {
  const idx = argv.indexOf(flag);
  return idx !== -1 && idx + 1 < argv.length ? argv[idx + 1] : undefined;
}
