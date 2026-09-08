/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import { mountPath, routeRegistry } from '../../src/framework/routeRegistry.js';

const handleNames = new Set(['cellDb', 'adminDb', 'handle']);
const authRouterFile = 'modules/admin-tenancy/apiRoutes/v1/auth.ts';

const src = resolve(process.cwd(), 'src');

/** Does: Lists every TypeScript source file under a directory, recursively. */
function sources(directory: string): string[] {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')
      ? [path]
      : [];
  });
}

/** Does: Parses a file and returns its syntax tree. */
function tree(file: string, text = readFileSync(file, 'utf8')) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
}

/**
 * Does: Returns true when a module's default export is a function whose
 * body calls createRouter, the shape every module router file must have.
 */
function exportsRouterFactory(root: ts.SourceFile) {
  let found = false;
  /** Does: Returns true when a node's subtree calls createRouter. */
  function callsFactory(node: ts.Node): boolean {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'createRouter'
    )
      return true;
    return ts.forEachChild(node, callsFactory) ?? false;
  }
  root.forEachChild(node => {
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      const value = node.expression;
      if (
        (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) &&
        callsFactory(value)
      )
        found = true;
    }
    if (
      ts.isFunctionDeclaration(node) &&
      node.modifiers?.some(m => m.kind === ts.SyntaxKind.DefaultKeyword) &&
      callsFactory(node)
    )
      found = true;
  });
  return found;
}

/**
 * Does: Lists every property read off a value named cellDb, adminDb, or
 * handle, or off a property of one of those names such as this.handle or
 * binding.handle, in a file, as "line: text".
 */
function handleReaches(root: ts.SourceFile) {
  const reaches: string[] = [];
  /** Does: Walks the tree collecting property accesses on the handle. */
  function visit(node: ts.Node) {
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const target = node.expression;
      const named =
        (ts.isIdentifier(target) && handleNames.has(target.text)) ||
        (ts.isPropertyAccessExpression(target) &&
          handleNames.has(target.name.text));
      if (named) {
        const line =
          root.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        reaches.push(`${line}: ${node.getText()}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(root);
  return reaches;
}

it('proves every module router file exports a factory built with createRouter', () => {
  const routerFiles = sources(resolve(src, 'modules')).filter(file =>
    /\/apiRoutes\/v\d+\//.test(file)
  );
  for (const file of routerFiles) {
    expect(exportsRouterFactory(tree(file)), relative(src, file)).toBe(true);
  }
  expect(
    exportsRouterFactory(
      tree(
        'good.ts',
        'export default (cellDb) => createRouter(new C(cellDb), { module: "m", router: "r" });'
      )
    )
  ).toBe(true);
  expect(
    exportsRouterFactory(
      tree(
        'bad.ts',
        'const router = express.Router(); export default () => router;'
      )
    )
  ).toBe(false);
});

it('proves no controller or framework file reaches a repository through a database pool', () => {
  const allowed = new Set(['framework/modelContract.ts']);
  for (const file of [
    ...sources(resolve(src, 'modules')),
    ...sources(resolve(src, 'framework')),
  ]) {
    const name = relative(src, file);
    if (allowed.has(name)) continue;
    expect(handleReaches(tree(file)), name).toEqual([]);
  }
  expect(
    handleReaches(
      tree(
        'x.ts',
        'const r = cellDb.db.clients; this.cellDb.db; adminDb.db.users; this.binding.handle.db;'
      )
    )
  ).toHaveLength(4);
  expect(
    handleReaches(
      tree(
        'modelContract.ts',
        readFileSync(resolve(src, 'framework/modelContract.ts'), 'utf8')
      )
    )
  ).toEqual([expect.stringContaining('handle.db')]);
});

/**
 * Does: Lists every access declaration inside a createRouter call in a
 * file, as "line: value".
 */
function accessDeclarations(root: ts.SourceFile) {
  const found: string[] = [];
  /** Does: Walks the tree collecting access properties under createRouter. */
  function visit(node: ts.Node, inFactory: boolean) {
    const entering =
      inFactory ||
      (ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'createRouter');
    if (
      entering &&
      ts.isPropertyAssignment(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'access'
    ) {
      const line = root.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      found.push(`${line}: ${node.initializer.getText()}`);
    }
    ts.forEachChild(node, child => visit(child, entering));
  }
  visit(root, false);
  return found;
}

it('proves only the admin-tenancy auth router declares anonymous or authenticated access', () => {
  for (const file of sources(resolve(src, 'modules'))) {
    const name = relative(src, file);
    if (name === authRouterFile) continue;
    expect(accessDeclarations(tree(file)), name).toEqual([]);
  }
  const declaring =
    'export default (db) => createRouter(new C(db), { module: "admin-tenancy", router: "auth", extend: add => add({ action: "login", access: "anonymous", path: "/login" }) });';
  expect(accessDeclarations(tree('auth.ts', declaring))).toEqual([
    '1: "anonymous"',
  ]);
  expect(
    accessDeclarations(
      tree('other.ts', 'const spec = { access: "anonymous" }; helper(spec);')
    )
  ).toEqual([]);
});

it('registers the authentication module at its versioned path', () => {
  expect(routeRegistry.map(mountPath)).toEqual(['/api/admin-tenancy/v1/auth']);
  expect(
    mountPath({
      module: 'core',
      version: 1,
      router: 'clients',
      target: 'cell',
      factory: () => {
        throw new Error('unused');
      },
    })
  ).toBe('/api/core/v1/clients');
});
