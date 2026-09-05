/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';

const root = process.cwd();
const workspaces = ['apps/api', 'apps/web', 'packages/shared'];
function owner(file) {
  return workspaces.find(w => file.startsWith(resolve(root, w) + '/'));
}
function violations(file, source) {
  const found = [];
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      specifier = node.moduleSpecifier;
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        node.expression.getText(tree) === 'require')
    )
      specifier = node.arguments[0];
    if (specifier && ts.isStringLiteral(specifier)) {
      const name = specifier.text;
      const from = owner(file);
      const to = name.startsWith('.')
        ? owner(resolve(dirname(file), name))
        : undefined;
      if (
        (to && from !== to) ||
        (name.startsWith('@nap/') && name !== '@nap/shared') ||
        (from === 'packages/shared' &&
          name.startsWith('@nap/') &&
          name !== '@nap/shared')
      )
        found.push(name);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return found;
}
function sources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory())
      return ['node_modules', 'dist'].includes(entry.name) ? [] : sources(path);
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}
it('rejects sibling source imports, shared app dependencies, and deep package imports', () => {
  expect(
    violations(
      resolve(root, 'apps/web/src/a.ts'),
      "import '../../api/src/app.js';"
    )
  ).toHaveLength(1);
  expect(
    violations(
      resolve(root, 'packages/shared/src/a.ts'),
      "export * from '../../../apps/api/src/app.js';"
    )
  ).toHaveLength(1);
  expect(
    violations(
      resolve(root, 'apps/api/src/a.ts'),
      "import('@nap/shared/src/index.js');"
    )
  ).toHaveLength(1);
  expect(
    violations(resolve(root, 'apps/api/src/a.ts'), "import '@nap/shared';")
  ).toEqual([]);
});
it('all workspace imports stay within their public boundaries', () => {
  for (const workspace of workspaces) {
    for (const file of sources(resolve(root, workspace))) {
      expect(
        violations(file, readFileSync(file, 'utf8')),
        relative(root, file)
      ).toEqual([]);
    }
  }
  const shared = JSON.parse(
    readFileSync('packages/shared/package.json', 'utf8')
  );
  expect(
    Object.keys(shared.dependencies).filter(name => name.startsWith('@nap/'))
  ).toEqual([]);
});
