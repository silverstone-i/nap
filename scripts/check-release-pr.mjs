/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  git,
  bumpType,
  validateChangelog,
  validateVersions,
} from './release.mjs';

/**
 * Does: Reads first-party version fields and their lockfile counterparts at a Git revision.
 * Called by: the PR gate for base and head snapshots, without executing their contents.
 */
export function versionsAt(ref) {
  const versions = {};
  const files = git('ls-tree', '-r', '--name-only', ref)
    .split('\n')
    .filter(path =>
      /^(package.json|(?:apps|packages)\/[^/]+\/package.json)$/.test(path)
    );
  for (const path of files)
    versions[path] = JSON.parse(git('show', `${ref}:${path}`)).version;
  const lock = JSON.parse(git('show', `${ref}:package-lock.json`));
  versions['lock.version'] = lock.version;
  for (const path of files) {
    const location =
      path === 'package.json' ? '' : path.slice(0, -'/package.json'.length);
    const version = lock.packages[location]?.version;
    if (version !== versions[path])
      throw new Error(`Manifest and lockfile version disagree: ${path}`);
    versions[`lock:${location}`] = version;
  }
  if (lock.version !== versions['package.json'])
    throw new Error('Root lockfile version disagrees');
  return versions;
}

/**
 * Does: Validates PR labels, immutable version fields, and release notes.
 * Called by: the read-only pull-request workflow.
 */
export function checkPullRequest(pr) {
  const type = bumpType(pr.labels.map(label => label.name));
  // The merge base excludes unrelated changes merged into main after branching.
  const base = git('merge-base', pr.base.sha, pr.head.sha);
  validateVersions(versionsAt(base), versionsAt(pr.head.sha));
  if (type !== 'none')
    validateChangelog(
      git('show', `${base}:CHANGELOG.md`),
      git('show', `${pr.head.sha}:CHANGELOG.md`)
    );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    checkPullRequest(
      JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
        .pull_request
    );
    console.log('Release PR contract passed');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
