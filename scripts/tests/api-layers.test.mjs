/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

const src = resolve(process.cwd(), 'apps/api/src');
// Import direction from the specification's API import layers table: each
// layer may import itself and the layers before it. Root files (app.ts,
// runtime.ts, server.ts) and ambient types may import any runtime layer
// except modules, which only the composition roots below may import.
const order = ['util', 'db', 'services', 'middleware', 'framework', 'modules'];
// Only these files may import modules, to assemble the application
// (ARCH-042); a root file reaching into a module would bypass the registries.
const compositionRoots = new Set([
  'db/admin/modules.ts',
  'db/admin/repositories.ts',
  'db/cell/modules.ts',
  'db/cell/repositories.ts',
  'framework/routeRegistry.ts',
]);
// Provider-specific packages are reached only from the layer that owns them.
const confined = { '@nap-sft/tablsx': 'framework' };

/** Does: Names the layer a source file belongs to by its first folder. */
function layerOf(file) {
  const [first] = relative(src, file).split('/');
  return order.includes(first) || first === 'scripts' ? first : 'root';
}

/** Does: Lists every literal module specifier a file imports or re-exports. */
function specifiers(file, source) {
  const found = [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      specifier = node.moduleSpecifier;
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    )
      specifier = node.arguments[0];
    if (specifier && ts.isStringLiteral(specifier)) found.push(specifier.text);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return found;
}

/**
 * Does: Returns the import rules a file breaks: a relative import of a
 * higher layer, of scripts, or of modules outside a composition root, and a
 * confined package imported outside its owning layer.
 */
function violations(file, source) {
  const name = relative(src, file);
  const layer = layerOf(file);
  const broken = [];
  for (const specifier of specifiers(file, source)) {
    if (specifier.startsWith('.')) {
      const target = layerOf(resolve(dirname(file), specifier));
      if (target === 'scripts' && layer !== 'scripts') broken.push(specifier);
      else if (target === 'modules' && !compositionRoots.has(name))
        broken.push(specifier);
      else if (
        order.includes(layer) &&
        order.includes(target) &&
        order.indexOf(target) > order.indexOf(layer) &&
        !(target === 'modules' && compositionRoots.has(name))
      )
        broken.push(specifier);
    } else if (specifier in confined && confined[specifier] !== layer) {
      broken.push(specifier);
    }
  }
  return broken;
}

/** Does: Lists every authored TypeScript file under a directory. */
function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

it('detects an upward import, a modules import outside a composition root, and a confined package', () => {
  expect(
    violations(resolve(src, 'util/a.ts'), "import '../db/cell/index.js';")
  ).toHaveLength(1);
  expect(
    violations(
      resolve(src, 'middleware/a.ts'),
      "import '../modules/core/index.js';"
    )
  ).toHaveLength(1);
  expect(
    violations(
      resolve(src, 'framework/routeRegistry.ts'),
      "import '../modules/core/index.js';"
    )
  ).toEqual([]);
  expect(
    violations(resolve(src, 'app.ts'), "import './modules/core/index.js';")
  ).toHaveLength(1);
  expect(
    violations(
      resolve(src, 'app.ts'),
      "import './framework/routeRegistry.js'; import './util/logger.js';"
    )
  ).toEqual([]);
  expect(
    violations(resolve(src, 'framework/a.ts'), "import '../scripts/x.js';")
  ).toHaveLength(1);
  expect(
    violations(resolve(src, 'services/a.ts'), "import '@nap-sft/tablsx';")
  ).toHaveLength(1);
  expect(
    violations(
      resolve(src, 'framework/a.ts'),
      "import '@nap-sft/tablsx'; import '../middleware/session.js';"
    )
  ).toEqual([]);
});

it('every API source file imports only its own layer or a lower one', () => {
  for (const file of sources(src)) {
    expect(
      violations(file, readFileSync(file, 'utf8')),
      relative(src, file)
    ).toEqual([]);
  }
});
