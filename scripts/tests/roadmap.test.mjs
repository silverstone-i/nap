/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { roadmapReferences, validateRoadmap } from '../check-roadmap-pr.mjs';

const row = (status = 'Not started', evidence = '') =>
  `| 1 | Admin tenancy | M0001 | Entry UI | ${status} | ${evidence} |`;
const body = '## Roadmap\n\n- Admin tenancy\n\n## Notes\nOther text';

it('passes unrelated PRs with absent, empty, or None declarations', () => {
  for (const text of [
    null,
    '',
    '## Summary\nFix typo',
    '## Roadmap\n',
    '## Roadmap\nNone',
  ]) {
    expect(validateRoadmap(row(), row(), text)).toBe(
      'No roadmap updates required'
    );
    expect(validateRoadmap('', '', text)).toBe('No roadmap updates required');
  }
});

it('requires a real status or evidence update for named deliverables', () => {
  expect(() => validateRoadmap(row(), row(), body)).toThrow(
    'Update the roadmap'
  );
  expect(() => validateRoadmap('', '', body)).toThrow('Unknown');
  expect(() => validateRoadmap(row(), row('In progress'), body)).not.toThrow();
  expect(() =>
    validateRoadmap(row(), row('Not started', 'PRD accepted'), body)
  ).not.toThrow();
  expect(() =>
    validateRoadmap(row(), row().replaceAll(' | ', '  |  '), body)
  ).toThrow('Update');
});

it('checks new completion evidence even without a PR declaration', () => {
  for (const evidence of ['', 'TBD', 'None', 'pending', '—']) {
    expect(() => validateRoadmap(row(), row('Complete', evidence), '')).toThrow(
      'evidence'
    );
  }
  expect(() =>
    validateRoadmap(
      row(),
      row('Complete', 'Acceptance tests and operator UI verified; PR #12'),
      body
    )
  ).not.toThrow();
  expect(() =>
    validateRoadmap(row('Complete', 'Verified'), row('Complete'), '')
  ).toThrow('evidence');
  expect(() => validateRoadmap('', row('Complete'), '')).toThrow('evidence');
});

it('does not require changes to historical completion rows', () => {
  expect(() =>
    validateRoadmap(
      row('Complete'),
      row('Complete') + '\nDocumentation note',
      ''
    )
  ).not.toThrow();
});

it('rejects invalid declarations and changed table structures', () => {
  expect(roadmapReferences(body.replaceAll('\n', '\r\n'))).toEqual([
    'Admin tenancy',
  ]);
  expect(() => roadmapReferences('## Roadmap\nAdmin tenancy')).toThrow(
    'one deliverable'
  );
  expect(() => roadmapReferences('## Roadmap\nNone\n## Roadmap\nNone')).toThrow(
    'one Roadmap'
  );
  expect(() => validateRoadmap('', row('Done'), body)).toThrow('Invalid');
  expect(() => validateRoadmap('', row() + '\n' + row(), body)).toThrow(
    'Duplicate'
  );
  expect(() =>
    validateRoadmap('', row().replace('Entry UI |', ''), body)
  ).toThrow('six');
});

it('runs against Git snapshots and uses the merge base, not newer base changes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'nap-roadmap-'));
  const script = resolve('scripts/check-roadmap-pr.mjs');
  const git = (...args) =>
    execFileSync('git', args, { cwd: directory, encoding: 'utf8' }).trim();
  try {
    git('init', '-q');
    git('config', 'user.name', 'Test');
    git('config', 'user.email', 'test@example.com');
    git('commit', '--allow-empty', '-qm', 'Base');
    const base = git('rev-parse', 'HEAD');
    mkdirSync(join(directory, 'docs/roadmap'), { recursive: true });
    writeFileSync(
      join(directory, 'docs/roadmap/ROADMAP.md'),
      row('In progress')
    );
    git('add', '.');
    git('commit', '-qm', 'Roadmap');
    const head = git('rev-parse', 'HEAD');
    git('checkout', '-q', '--detach', base);
    git('commit', '--allow-empty', '-qm', 'Unrelated base work');
    const eventPath = join(directory, 'event.json');
    const run = (headSha, prBody) => {
      writeFileSync(
        eventPath,
        JSON.stringify({
          pull_request: {
            base: { sha: git('rev-parse', 'HEAD') },
            head: { sha: headSha },
            body: prBody,
          },
        })
      );
      return execFileSync(process.execPath, [script], {
        cwd: directory,
        encoding: 'utf8',
        env: { ...process.env, GITHUB_EVENT_PATH: eventPath },
      });
    };
    expect(run(base, null)).toContain('No roadmap updates required');
    expect(run(head, body)).toContain('Roadmap validation passed');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
