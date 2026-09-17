/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { afterEach, expect, it, vi } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  bumpType,
  validateChangelog,
  validateVersions,
  promote,
  mergedPulls,
  github,
  ensureRelease,
  baseline,
  selectBump,
  publish,
  git,
} from '../release.mjs';
import { checkPullRequest } from '../check-release-pr.mjs';

const notes =
  '# Changelog\n\n## [Unreleased]\n\n### Added\n\n- New feature\n\n## [v1.0.0] - 2026-01-01\n\n- Old feature\n';
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('accepts zero or one exact label and rejects every multiple-label combination', () => {
  expect(bumpType(['release:patch-extra'])).toBe('none');
  for (const type of ['patch', 'minor', 'major'])
    expect(bumpType([`release:${type}`])).toBe(type);
  for (const labels of [
    ['patch', 'minor'],
    ['patch', 'major'],
    ['minor', 'major'],
    ['patch', 'minor', 'major'],
  ])
    expect(() => bumpType(labels.map(type => `release:${type}`))).toThrow(
      'exactly one'
    );
});

it('requires new bullets in a single Unreleased section and preserves history', () => {
  const empty = notes.replace('- New feature\n', '');
  expect(() => validateChangelog(empty, notes)).not.toThrow();
  expect(() => validateChangelog(notes, notes)).toThrow('nonempty');
  for (const bullet of [
    '- New feature ',
    '-  New feature',
    '-\tNew feature',
    '  - New feature',
    '* New feature',
    '- New  feature',
    '- New\tfeature',
  ]) {
    expect(() =>
      validateChangelog(notes, notes.replace('- New feature', bullet))
    ).toThrow('nonempty');
    expect(() =>
      validateChangelog(notes.replace('- New feature', bullet), notes)
    ).toThrow('nonempty');
  }
  expect(() =>
    validateChangelog(
      notes,
      notes.replace('- New feature', '- New feature\n- Another feature')
    )
  ).not.toThrow();

  expect(() =>
    validateChangelog(empty, notes.replace('- New feature', '- '))
  ).toThrow('nonempty');
  expect(() =>
    validateChangelog(empty, notes.replace('Old feature', 'Rewritten'))
  ).toThrow('history');
  for (const bad of [
    notes.replace('## [Unreleased]', '## [Other]'),
    notes + '\n## [Unreleased]\n',
  ])
    expect(() => promote(bad, '1.1.0')).toThrow('exactly one');
  expect(() => promote(empty, '1.1.0')).toThrow('empty');
  const result = promote(notes, '1.1.0', '2026-09-07');
  expect(result).toContain('## [Unreleased]\n\n## [v1.1.0] - 2026-09-07');
  expect(result.endsWith(notes.slice(notes.indexOf('## [v1.0.0]')))).toBe(true);
});

it('rejects changed existing version records but permits new workspaces', () => {
  expect(() => validateVersions({ root: '1.0.0' }, { root: '1.1.0' })).toThrow(
    'Manual'
  );
  expect(() =>
    validateVersions({ root: '1.0.0' }, { root: '1.0.0', workspace: '0.0.0' })
  ).not.toThrow();
});

it('reads all PR pages and propagates metadata failures', async () => {
  const api = vi
    .fn()
    .mockResolvedValueOnce(Array(100).fill({}))
    .mockResolvedValueOnce([{ number: 101 }]);
  expect(await mergedPulls(api)).toHaveLength(101);
  expect(api.mock.calls[1][0]).toContain('page=2');
  await expect(
    mergedPulls(vi.fn().mockRejectedValue(new Error('offline')))
  ).rejects.toThrow('offline');
});

it('creates only a missing Release and preserves existing Releases', async () => {
  const api = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ object: { sha: 'tag-sha' } })
    .mockResolvedValueOnce({ id: 1 });
  await ensureRelease('v1.0.0', api, 'tag-sha');
  expect(api.mock.calls[2]).toEqual([
    'releases',
    {
      method: 'POST',
      body: {
        tag_name: 'v1.0.0',
        name: 'Release 1.0.0',
        generate_release_notes: true,
      },
    },
  ]);
  const changed = vi
    .fn()
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ object: { sha: 'different-tag' } });
  await expect(ensureRelease('v1.0.0', changed, 'tag-sha')).rejects.toThrow(
    'Remote release tag changed'
  );
  expect(changed).toHaveBeenCalledTimes(2);
  api.mockReset().mockResolvedValue({ id: 1 });
  await ensureRelease('v1.0.0', api, 'tag-sha');
  expect(api).toHaveBeenCalledTimes(1);
  await expect(
    ensureRelease(
      'v1.0.0',
      vi.fn().mockRejectedValue(new Error('forbidden')),
      'tag-sha'
    )
  ).rejects.toThrow('forbidden');
});

it('distinguishes a missing Release from authentication, server, and network failures', async () => {
  vi.stubEnv('GITHUB_REPOSITORY', 'owner/repo');
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  fetch.mockResolvedValue({ status: 404, ok: false });
  expect(await github('releases/tags/v1.0.0', { missing: true })).toBeNull();
  await expect(github('pulls')).rejects.toThrow('404');
  for (const status of [401, 403, 500]) {
    fetch.mockResolvedValue({ status, ok: false });
    await expect(
      github('releases/tags/v1.0.0', { missing: true })
    ).rejects.toThrow(String(status));
  }
  fetch.mockRejectedValue(new Error('network'));
  await expect(github('pulls')).rejects.toThrow('network');
});

/**
 * Does: Creates an isolated Git history and bare remote for publication tests.
 * Called by: Git integration tests before changing process working directory.
 */
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'nap-release-'));
  const previous = process.cwd();
  execFileSync('git', ['init', '--bare', join(directory, 'remote.git')], {
    stdio: 'pipe',
  });
  execFileSync('git', ['init', '-b', 'main', join(directory, 'work')], {
    stdio: 'pipe',
  });
  process.chdir(join(directory, 'work'));
  git('config', 'user.name', 'Release Test');
  git('config', 'user.email', 'release@example.test');
  writeFileSync(
    'package.json',
    JSON.stringify({
      name: 'release-fixture',
      version: '1.0.0',
      private: true,
      workspaces: ['apps/*'],
    })
  );
  mkdirSync('apps/api', { recursive: true });
  writeFileSync(
    'apps/api/package.json',
    JSON.stringify({ name: 'fixture-api', version: '0.0.0', private: true })
  );
  writeFileSync('.gitignore', 'node_modules/\n');
  execFileSync(
    'npm',
    ['install', '--package-lock-only', '--ignore-scripts', '--offline'],
    { stdio: 'pipe' }
  );
  writeFileSync('CHANGELOG.md', notes);
  git('add', '.');
  git('commit', '-m', 'baseline');
  git('tag', '-a', 'v1.0.0', '-m', 'baseline');
  git('remote', 'add', 'origin', join(directory, 'remote.git'));
  git('push', 'origin', 'main', '--tags');
  return { directory, previous };
}

/**
 * Does: Restores the working directory and deletes an isolated test repository.
 * Called by: Git tests in their finally blocks.
 */
function cleanup(state) {
  process.chdir(state.previous);
  rmSync(state.directory, { recursive: true, force: true });
}

/**
 * Does: Adds one committed change representing a merged PR.
 * Called by: Git tests when constructing pending release history.
 */
function change(name) {
  writeFileSync(name, name);
  git('add', name);
  git('commit', '-m', name);
  return git('rev-parse', 'HEAD');
}

/**
 * Does: Builds the metadata for one merged PR fixture.
 * Called by: ancestry-selection tests.
 */
function pr(sha, type) {
  return {
    merged_at: '2026-09-07',
    merge_commit_sha: sha,
    labels: type ? [{ name: `release:${type}` }] : [],
  };
}

it('selects only pending ancestors, ignores event reruns, and publishes once atomically', () => {
  const state = fixture();
  try {
    const old = git('rev-parse', 'HEAD');
    const first = change('first');
    const snapshot = change('second');
    const pulls = [pr(old, 'major'), pr(first, 'patch'), pr(snapshot, 'minor')];
    git('checkout', '-b', 'unrelated', old);
    const unrelated = change('unrelated');
    git('tag', 'v9.0.0');
    git('checkout', 'main');
    expect(baseline(snapshot)).toBe('v1.0.0');
    pulls.push(pr(unrelated, 'major'));
    expect(selectBump(pulls, baseline(), snapshot)).toBe('minor');
    const future = change('future');
    pulls.push(pr(future, 'major'));
    expect(selectBump(pulls, baseline(snapshot), snapshot)).toBe('minor');
    git('reset', '--hard', snapshot);
    expect(publish('minor', snapshot)).toBe('v1.1.0');
    expect(JSON.parse(readFileSync('package.json')).version).toBe('1.1.0');
    expect(
      JSON.parse(readFileSync('package-lock.json')).packages[''].version
    ).toBe('1.1.0');
    expect(JSON.parse(readFileSync('apps/api/package.json')).version).toBe(
      '0.0.0'
    );
    expect(
      JSON.parse(readFileSync('package-lock.json')).packages['apps/api'].version
    ).toBe('0.0.0');
    expect(git('log', '-1', '--format=%B')).toContain(
      'Signed-off-by: Release Test'
    );
    expect(git('cat-file', '-t', 'v1.1.0')).toBe('tag');
    expect(selectBump(pulls, baseline(), git('rev-parse', 'HEAD'))).toBe(
      'none'
    );
    expect(git('ls-remote', 'origin', 'refs/heads/main')).toContain(
      git('rev-parse', 'HEAD')
    );
  } finally {
    cleanup(state);
  }
});

it('rejects an atomic push when remote main advances without publishing the new tag', () => {
  const state = fixture();
  try {
    const snapshot = change('pending');
    const advance = change('remote-advance');
    git('push', 'origin', 'main');
    git('reset', '--hard', snapshot);
    expect(() => publish('patch', snapshot)).toThrow();
    expect(git('ls-remote', 'origin', 'refs/tags/v1.0.1')).toBe('');
    expect(git('ls-remote', 'origin', 'refs/heads/main')).toContain(advance);
  } finally {
    cleanup(state);
  }
});

it('fails on missing or inconsistent baseline tags and invalid PR version changes', () => {
  const state = fixture();
  try {
    const base = git('rev-parse', 'HEAD');
    checkPullRequest({ base: { sha: base }, head: { sha: base }, labels: [] });
    writeFileSync(
      'package.json',
      JSON.stringify({ name: 'release-fixture', version: '2.0.0' })
    );
    git('add', '.');
    git('commit', '-m', 'manual version');
    expect(() =>
      checkPullRequest({
        base: { sha: base },
        head: { sha: git('rev-parse', 'HEAD') },
        labels: [],
      })
    ).toThrow('disagree');
    git('tag', 'v3.0.0');
    expect(() => baseline()).toThrow('disagree');
    git('tag', '-d', 'v3.0.0', 'v1.0.0');
    expect(() => baseline()).toThrow('No valid');
  } finally {
    cleanup(state);
  }
});

it('runs pull-request content read-only and releases only from main', () => {
  // REL-007: PR content is data. It runs only under read-only workflows with
  // no persisted credentials; the release workflow checks out main, never a
  // pull-request ref, and no workflow grants PR content a write token.
  const workflows = new URL('../../.github/workflows/', import.meta.url);
  const read = name => readFileSync(new URL(name, workflows), 'utf8');
  for (const name of readdirSync(workflows)) {
    expect(read(name)).not.toMatch(/pull_request_target/);
  }
  for (const name of ['ci.yml', 'changelog-check.yml']) {
    expect(read(name)).toMatch(/^permissions:\n {2}contents: read$/m);
  }
  expect(read('changelog-check.yml')).toMatch(/persist-credentials: false/);
  const release = read('release-on-merge.yml');
  expect(release).toMatch(/^\s+ref: main$/m);
  expect(release).not.toMatch(/github\.event\.pull_request\.head/);
});
