/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const src = resolve(process.cwd(), 'src');

/**
 * Does: Lists every TypeScript source file under a directory, recursively.
 * Called by: the boundary test, once per run, starting from the src root.
 */
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/**
 * Does: Returns every module specifier a file imports or re-exports.
 * Called by: the boundary test, for each source file it lists.
 */
function specifiers(file: string): string[] {
  return [
    ...readFileSync(file, 'utf8').matchAll(
      /^(?:import|export)\b[^'"]*?from\s+['"]([^'"]+)['"]/gm
    ),
  ].map(match => match[1] ?? '');
}

it('imports only its declared dependencies and never API, database, or web code', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')
  ) as { dependencies?: Record<string, string> };
  const allowed = Object.keys(manifest.dependencies ?? {});
  expect(allowed).toEqual(['zod']);
  const files = sources(src);
  expect(files.length).toBeGreaterThan(0);
  for (const file of files) {
    for (const specifier of specifiers(file)) {
      if (specifier.startsWith('.')) {
        expect(specifier).not.toContain('..');
        continue;
      }
      expect(allowed, `${file} imports ${specifier}`).toContain(
        specifier.split('/')[0]
      );
    }
  }
});
