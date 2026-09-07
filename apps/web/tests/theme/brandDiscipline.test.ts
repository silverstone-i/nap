/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { expect, it } from 'vitest';

const src = resolve(process.cwd(), 'src');

/** Does: Lists every source file under a directory, recursively, as src-relative paths. */
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) ? [relative(src, path)] : [];
  });
}

/** Does: Removes block and line comments so only code is inspected. */
function code(text: string) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const files = sources(src).map(path => ({
  path,
  text: code(readFileSync(resolve(src, path), 'utf8')),
}));

it('keeps hex color literals out of every file but the token module', () => {
  expect(files.length).toBeGreaterThan(0);
  const offenders = files
    .filter(file => file.path !== 'theme/tokens.ts')
    .filter(file => /#[0-9a-fA-F]{3,8}\b/.test(file.text))
    .map(file => file.path);
  expect(offenders).toEqual([]);
});

it('confines gold to the wordmark dot', () => {
  const goldUsers = files
    .filter(file => file.path !== 'theme/tokens.ts')
    .filter(file => /\bgold\b/.test(file.text))
    .map(file => file.path);
  expect(goldUsers).toEqual(['theme/styles.ts']);
  const dotUsers = files
    .filter(file => file.path !== 'theme/styles.ts')
    .filter(file => file.text.includes('wordmarkDotStyles'))
    .map(file => file.path);
  expect(dotUsers).toEqual(['components/Wordmark.tsx']);
});
