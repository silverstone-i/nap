/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parsers } from 'prettier/plugins/markdown';
import { expect, it } from 'vitest';

const root = process.cwd();
// A developer's ignored files must not make a broken repository path pass.
const trackedPaths = new Set();
for (const name of execFileSync('git', ['ls-files', '-z'], {
  encoding: 'utf8',
}).split('\0')) {
  if (!name) continue;
  let path = resolve(root, name);
  while (path !== root) {
    trackedPaths.add(path);
    path = dirname(path);
  }
}
// Guides intentionally describe setup and build outputs created after checkout.
// Keep this list exact: blanket ignored-file exemptions would conceal typos.
const generatedPaths = new Set([
  'apps/api/.env',
  'apps/api/.env.provisioning.dev.json',
  'apps/api/.env.provisioning.prod.json',
  'apps/api/dist/server.js',
]);

/** Does: Lists Markdown files below a documentation directory. Called by: document inventory. */
function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = resolve(directory, entry.name);
    return entry.isDirectory()
      ? markdownFiles(file)
      : entry.name.endsWith('.md')
        ? [file]
        : [];
  });
}

/** Does: Visits a parsed Markdown tree with its ancestors. Called by: content and link checks. */
function walk(node, visit, parents = []) {
  visit(node, parents);
  for (const child of node.children ?? [])
    walk(child, visit, [...parents, node]);
}

/** Does: Reads the visible text of a Markdown node. Called by: heading and table checks. */
function text(node) {
  return node.value ?? (node.children ?? []).map(text).join('');
}

/** Does: Builds GitHub-style heading IDs, including repeated headings and explicit HTML anchors. Called by: local-link validation. */
function anchors(tree) {
  const result = new Set();
  const counts = new Map();
  walk(tree, node => {
    if (node.type === 'heading') {
      const base = text(node)
        .toLowerCase()
        .replace(/[^\p{L}\p{N}_\- ]/gu, '')
        .replace(/ /g, '-');
      const count = counts.get(base) ?? 0;
      result.add(base + (count ? `-${count}` : ''));
      counts.set(base, count + 1);
    }
    if (node.type === 'html') {
      for (const match of node.value.matchAll(
        /\b(?:id|name)=["']([^"']+)["']/g
      ))
        result.add(match[1]);
    }
  });
  return result;
}

/** Does: Finds revision rows that Markdown rendered as prose instead of table rows. Called by: documentation checks and parser fixtures. */
function detachedRows(tree) {
  const lines = [];
  walk(tree, node => {
    if (
      node.type === 'paragraph' &&
      /^\|\s*\d{4}-\d{2}-\d{2}\s*\|/m.test(text(node))
    )
      lines.push(node.position.start.line);
  });
  return lines;
}

/** Does: Returns broken local targets or anchors. Called by: the full corpus check and link fixtures. */
function linkProblems(file, tree, documents) {
  const problems = [];
  walk(tree, node => {
    if (!['link', 'image', 'definition'].includes(node.type)) return;
    const url = node.url;
    if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(url)) return;
    const [path, fragment] = url.split('#');
    const target = path
      ? resolve(dirname(file), decodeURIComponent(path))
      : file;
    if (!documents.has(target) && !existsSync(target))
      problems.push(`missing target: ${url}`);
    else if (
      fragment &&
      documents.has(target) &&
      !anchors(documents.get(target)).has(decodeURIComponent(fragment))
    )
      problems.push(`missing anchor: ${url}`);
  });
  return problems;
}

/** Does: Finds current repo-qualified inline paths that no longer exist. Called by: documentation checks and historical/example fixtures. */
function inlinePathProblems(tree, exists = path => trackedPaths.has(path)) {
  const problems = [];
  const headings = [];
  walk(tree, (node, parents) => {
    if (node.type === 'heading') {
      headings.length = node.depth;
      headings[node.depth - 1] = text(node);
    }
    if (node.type !== 'inlineCode') return;
    const value = node.value;
    if (
      !/^(?:apps|packages|scripts|docs)\//.test(value) ||
      /[<>{}* ]/.test(value)
    )
      return;
    const paragraph = parents.findLast(parent =>
      ['paragraph', 'tableRow'].includes(parent.type)
    );
    const context = paragraph ? text(paragraph) : '';
    // Historical paths and proposed placements are evidence/examples, not current files.
    if (
      headings.some(h =>
        /historical|revisions|verified starting point|before/i.test(h)
      ) ||
      /historical|illustrative|example|future|only after approval|added only|added when/i.test(
        context
      )
    )
      return;
    if (!generatedPaths.has(value) && !exists(resolve(root, value)))
      problems.push(`${node.position.start.line}: ${value}`);
  });
  return problems;
}

/** Does: Finds duplicate document numbers or mismatches between filename and title. Called by: PRD/ADR inventory checks. */
function identifierProblems(entries) {
  const seen = new Set();
  const problems = [];
  for (const [file, tree] of entries) {
    const number = file.match(/\/(\d{4})-/)?.[1];
    if (!number) continue;
    const title = tree.children.find(
      node => node.type === 'heading' && node.depth === 1
    );
    if (!title || !text(title).startsWith(`${number} — `))
      problems.push(`title/filename mismatch: ${file}`);
    if (seen.has(number)) problems.push(`duplicate identifier: ${number}`);
    seen.add(number);
  }
  return problems;
}

const files = [
  ...readdirSync(root)
    .filter(name => name.endsWith('.md'))
    .map(name => resolve(name)),
  ...markdownFiles(resolve('docs')),
  ...markdownFiles(resolve('apps/api/src/modules/reference-data/seeds')),
];
const documents = new Map(
  files.map(file => [file, parsers.markdown.parse(readFileSync(file, 'utf8'))])
);

it('distinguishes real revision tables from detached rows and code examples', () => {
  const table =
    '| Date | Change |\n| --- | --- |\n| 2026-09-15 | Corrected |\n';
  expect(detachedRows(parsers.markdown.parse(table))).toEqual([]);
  expect(
    detachedRows(
      parsers.markdown.parse(table + '\n| 2026-09-16 | Detached |\n')
    )
  ).toEqual([5]);
  expect(
    detachedRows(
      parsers.markdown.parse('```text\n| 2026-09-16 | Example |\n```')
    )
  ).toEqual([]);
});

it('detects missing links and anchors while supporting duplicate heading slugs', () => {
  const file = resolve('/fixture/doc.md');
  const tree = parsers.markdown.parse(
    '# Title\n## Repeated\n## Repeated\n[ok](#repeated-1)\n[bad](#missing)\n[missing](absent.md)'
  );
  expect(linkProblems(file, tree, new Map([[file, tree]]))).toEqual([
    'missing anchor: #missing',
    'missing target: absent.md',
  ]);
});

it('checks current inline paths but excludes explicitly historical and illustrative paths', () => {
  const tree = parsers.markdown.parse(
    'Current `apps/web/src/Missing.tsx`.\n\nIllustrative `apps/web/src/Example.tsx`.\n\n## Historical evidence\n\n`apps/web/src/Old.tsx`\n\n## Current implementation\n\n`apps/api/src/Missing.ts`'
  );
  expect(inlinePathProblems(tree, () => false)).toEqual([
    '1: apps/web/src/Missing.tsx',
    '11: apps/api/src/Missing.ts',
  ]);
});

it('allows documented setup outputs without accepting missing source files or misspelled outputs', () => {
  const tree = parsers.markdown.parse(
    [
      '`apps/api/.env`',
      '`apps/api/.env.provisioning.dev.json`',
      '`apps/api/.env.provisioning.prod.json`',
      '`apps/api/.env.provisioning.prodd.json`',
      '`apps/api/src/missing.ts`',
    ].join('\n\n')
  );
  expect(inlinePathProblems(tree, () => false)).toEqual([
    '7: apps/api/.env.provisioning.prodd.json',
    '9: apps/api/src/missing.ts',
  ]);
});

it('rejects reused document numbers and titles with the wrong number', () => {
  const tree = parsers.markdown.parse('# 0008 — Example');
  expect(
    identifierProblems([
      ['/docs/0008-first.md', tree],
      ['/docs/0008-second.md', tree],
      ['/docs/0009-third.md', tree],
    ])
  ).toEqual([
    'duplicate identifier: 0008',
    'title/filename mismatch: /docs/0009-third.md',
  ]);
});

it('keeps PRD and ADR identities unique and indexed', () => {
  for (const kind of ['PRDs', 'ADRs']) {
    const entries = [...documents].filter(([file]) =>
      relative(root, file).startsWith(`docs/${kind}/`)
    );
    expect(identifierProblems(entries), kind).toEqual([]);
    const index = documents.get(
      resolve(kind === 'PRDs' ? 'docs/README.md' : 'docs/ADRs/INDEX.md')
    );
    const links = [];
    const rows = new Map();
    walk(index, (node, parents) => {
      if (node.type !== 'link') return;
      links.push(node.url);
      const row = parents.find(parent => parent.type === 'tableRow');
      if (row) rows.set(node.url, row.children.map(text));
    });
    for (const [file] of entries.filter(([file]) => /\/\d{4}-/.test(file))) {
      const target = relative(
        resolve(kind === 'PRDs' ? 'docs' : 'docs/ADRs'),
        file
      );
      expect(links, target).toContain(target);
      if (kind === 'ADRs') {
        const row = rows.get(target);
        expect(row, `${target} must be a table row`).toBeDefined();
        const document = documents.get(file);
        const title = text(
          document.children.find(node => node.type === 'heading')
        );
        const metadata = {};
        walk(document, node => {
          if (node.type !== 'paragraph') return;
          const match = text(node).match(
            /^(Status|Requirements):\s+([\s\S]+)$/
          );
          if (match) metadata[match[1]] = match[2].replace(/\s+/g, ' ').trim();
        });
        expect(row[0], target).toBe(title);
        expect(row[1], target).toBe(metadata.Status);
        expect(row[2], target).toBe(metadata.Requirements ?? '—');
      }
    }
  }
});

it('keeps documentation tables, local links and current inline paths valid', () => {
  const problems = [];
  for (const [file, tree] of documents) {
    const name = relative(root, file);
    for (const issue of [
      ...detachedRows(tree).map(line => `detached revision row: ${line}`),
      ...linkProblems(file, tree, documents),
      ...inlinePathProblems(tree),
    ])
      problems.push(`${name}: ${issue}`);
  }
  expect(problems).toEqual([]);
});
