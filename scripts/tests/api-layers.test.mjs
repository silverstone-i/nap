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
// except modules, which require a composition root or the named ADR 0016 exception.
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

/** Does: Names the layer a source file belongs to by its first folder. Called by: import checks. */
function layerOf(file) {
  const [first] = relative(src, file).split('/');
  return order.includes(first) || first === 'scripts' ? first : 'root';
}

/** Does: Lists literal imports and re-exports with their syntax nodes. Called by: import checks. */
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
    if (specifier && ts.isStringLiteral(specifier))
      found.push({ specifier: specifier.text, node });
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return found;
}

/**
 * Does: Checks whether an import names only the two approved seed functions.
 * Called by: violations for each import before ordinary layer checks.
 * Why: ADR 0016 permits this exact importer and module, without widening services.
 */
function permittedSeedImport(name, specifier, node) {
  if (
    name !== 'services/provisioning/engine.mjs' ||
    specifier !== '../../modules/reference-data/seed.js' ||
    !ts.isImportDeclaration(node) ||
    node.importClause?.name
  )
    return false;
  const bindings = node.importClause?.namedBindings;
  return (
    bindings &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every(item =>
      ['seedReference', 'referenceReady'].includes(
        (item.propertyName ?? item.name).text
      )
    )
  );
}

/** Does: Checks the filename against the production language contract. Called by: the production source check and negative fixtures. */
function permittedLanguage(file) {
  if (/\.tsx?$/.test(file)) return true;
  return ['config', 'engine', 'postgres', 'render'].some(
    name => file === `apps/api/src/services/provisioning/${name}.mjs`
  );
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
  for (const { specifier, node } of specifiers(file, source)) {
    if (permittedSeedImport(name, specifier, node)) continue;
    if (specifier.startsWith('.')) {
      const target = layerOf(resolve(dirname(file), specifier));
      if (target === 'scripts' && layer !== 'scripts') broken.push(specifier);
      else if (
        target === 'modules' &&
        layer !== 'modules' &&
        layer !== 'scripts' &&
        !compositionRoots.has(name)
      )
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

/** Does: Lists authored runtime source files in every supported language. Called by: architecture and language checks. */
function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.(?:[cm]?jsx?|tsx?)$/.test(entry.name) ? [path] : [];
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

it('limits the provisioning exception to named imports from the exact module', () => {
  const engine = resolve(src, 'services/provisioning/engine.mjs');
  const allowed =
    "import { seedReference, referenceReady } from '../../modules/reference-data/seed.js';";
  expect(violations(engine, allowed)).toEqual([]);
  expect(
    violations(resolve(src, 'services/provisioning/other.mjs'), allowed)
  ).toHaveLength(1);
  for (const input of [
    "import { referenceVersion } from '../../modules/reference-data/seed.js';",
    "import { seedReference } from '../../modules/core/repositories.js';",
    "import * as seed from '../../modules/reference-data/seed.js';",
    "export { seedReference } from '../../modules/reference-data/seed.js';",
    "import('../../modules/reference-data/seed.js');",
    "import seed from '../../modules/reference-data/seed.js';",
    "import '../../modules/reference-data/seed.js';",
    "import '../../framework/createRouter.js';",
  ])
    expect(violations(engine, input), input).toHaveLength(1);
});

it('detects forbidden imports across every authored source extension', () => {
  for (const extension of ['ts', 'tsx', 'js', 'mjs', 'jsx', 'cjs']) {
    expect(
      violations(
        resolve(src, `util/example.${extension}`),
        "import '../db/cell/index.js';"
      )
    ).toHaveLength(1);
    expect(
      violations(
        resolve(src, `services/example.${extension}`),
        "import '../modules/core/repositories.js';"
      )
    ).toHaveLength(1);
  }
});

it('limits production JavaScript to the four approved provisioning files', () => {
  expect(
    permittedLanguage('apps/api/src/services/provisioning/extra.mjs')
  ).toBe(false);
  expect(permittedLanguage('apps/web/src/engine.mjs')).toBe(false);
  expect(permittedLanguage('packages/shared/src/example.js')).toBe(false);
  expect(permittedLanguage('apps/api/src/server.ts')).toBe(true);
  for (const directory of [
    'apps/api/src',
    'apps/web/src',
    'packages/shared/src',
  ]) {
    for (const file of sources(resolve(directory))) {
      const name = relative(process.cwd(), file);
      expect(permittedLanguage(name), name).toBe(true);
    }
  }
});
