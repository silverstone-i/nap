/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * Does: Runs Git without shell interpolation.
 * Called by: release operations when inspecting or publishing repository state.
 */
export function git(...args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    stdio: 'pipe',
  }).trimEnd();
}

/**
 * Does: Selects a single recognized release label.
 * Called by: PR validation and batch selection before any mutation.
 */
export function bumpType(labels) {
  const types = ['patch', 'minor', 'major'].filter(type =>
    labels.includes(`release:${type}`)
  );
  if (types.length > 1) throw new Error('Use exactly one release label');
  return types[0] ?? 'none';
}

/**
 * Does: Separates the Unreleased section from immutable release history.
 * Called by: PR validation and release promotion.
 */
export function changelogParts(text) {
  const matches = [...text.matchAll(/^## \[Unreleased\]\s*$/gm)];
  if (matches.length !== 1)
    throw new Error('Expected exactly one Unreleased heading');
  const start = matches[0].index;
  const bodyStart = start + matches[0][0].length;
  const rest = text.slice(bodyStart);
  const next = rest.search(/^## /m);
  const end = next < 0 ? text.length : bodyStart + next;
  if (/^## /m.test(text.slice(0, start)))
    throw new Error('Unreleased must precede releases');
  return {
    prefix: text.slice(0, start),
    body: text.slice(bodyStart, end),
    history: text.slice(end),
  };
}

/**
 * Does: Collects nonempty bullet content with markers and whitespace normalized.
 * Called by: changelog validation and promotion.
 * Why: REL-001 requires new content; formatting-only edits are not release notes.
 */
function bullets(body) {
  return body
    .split('\n')
    .filter(line => /^\s*[-*][ \t]+\S/.test(line))
    .map(line =>
      line
        .replace(/^\s*[-*][ \t]+/, '')
        .trim()
        .replace(/\s+/g, ' ')
    );
}

/**
 * Does: Checks that a releasing PR adds notes without rewriting release history.
 * Called by: the read-only PR gate after loading base and head content.
 */
export function validateChangelog(base, head) {
  const before = changelogParts(base);
  const after = changelogParts(head);
  if (before.history !== after.history)
    throw new Error('Previously released history changed');
  const old = new Set(bullets(before.body));
  if (!bullets(after.body).some(line => !old.has(line)))
    throw new Error('Add a nonempty Unreleased bullet');
}

/**
 * Does: Rejects changes to existing first-party version records.
 * Called by: the PR gate for root and workspace manifests and their lockfile.
 */
export function validateVersions(base, head) {
  for (const [path, version] of Object.entries(base)) {
    if (Object.hasOwn(head, path) && head[path] !== version)
      throw new Error(`Manual version change: ${path}`);
  }
}

/**
 * Does: Tests ancestry while distinguishing a negative result from a Git failure.
 * Called by: baseline and pending-PR selection.
 */
export function isAncestor(ancestor, descendant) {
  try {
    git('merge-base', '--is-ancestor', ancestor, descendant);
    return true;
  } catch (error) {
    if (error.status === 1) return false;
    throw error;
  }
}

/**
 * Does: Finds the highest stable version tag reachable from the checked-out snapshot.
 * Called by: normal release selection and recovery before accessing GitHub Releases.
 */
export function baseline(snapshot = 'HEAD') {
  const tags = git('tag', '--merged', snapshot, '--sort=-v:refname').split(
    '\n'
  );
  const tag = tags.find(value =>
    /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
  );
  if (!tag) throw new Error('No valid stable baseline tag');
  const version = JSON.parse(git('show', `${tag}:package.json`)).version;
  if (`v${version}` !== tag)
    throw new Error('Baseline tag and version disagree');
  return tag;
}

/**
 * Does: Retrieves JSON from GitHub with explicit HTTP error handling.
 * Called by: release discovery, PR validation, and recovery.
 * Why: Only an actual 404 can represent a missing Release; other failures abort.
 */
export async function github(
  path,
  { method = 'GET', body, missing = false } = {}
) {
  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }
  );
  if (missing && response.status === 404) return null;
  if (!response.ok)
    throw new Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
  return response.json();
}

/**
 * Does: Reads every page of closed PR metadata without the search index.
 * Called by: release selection after fixing its Git snapshot.
 */
export async function mergedPulls(api = github) {
  const pulls = [];
  for (let page = 1; ; page++) {
    const batch = await api(
      `pulls?state=closed&base=main&per_page=100&page=${page}`
    );
    pulls.push(...batch);
    if (batch.length < 100) return pulls;
  }
}

/**
 * Does: Chooses the largest bump from merged PRs within the unreleased Git history.
 * Called by: release selection; event labels are deliberately not inputs.
 */
export function selectBump(pulls, tag, snapshot) {
  let selected = 'none';
  const ranks = ['none', 'patch', 'minor', 'major'];
  for (const pr of pulls) {
    if (!pr.merged_at || !pr.merge_commit_sha) continue;
    // Commits from merges beyond the fetched snapshot may not exist locally.
    try {
      git('cat-file', '-e', `${pr.merge_commit_sha}^{commit}`);
    } catch {
      continue;
    }
    if (
      !isAncestor(pr.merge_commit_sha, snapshot) ||
      isAncestor(pr.merge_commit_sha, tag)
    )
      continue;
    const type = bumpType(pr.labels.map(label => label.name));
    if (ranks.indexOf(type) > ranks.indexOf(selected)) selected = type;
  }
  return selected;
}

/**
 * Does: Creates only a confirmed missing GitHub Release for an existing verified tag.
 * Called by: recovery and publication after the tag is available remotely.
 */
export async function ensureRelease(
  tag,
  api = github,
  tagObject = git('rev-parse', tag)
) {
  if (await api(`releases/tags/${tag}`, { missing: true })) return;
  const remote = await api(`git/ref/tags/${tag}`);
  if (remote.object.sha !== tagObject)
    throw new Error('Remote release tag changed');
  await api('releases', {
    method: 'POST',
    body: {
      tag_name: tag,
      name: `Release ${tag.slice(1)}`,
      generate_release_notes: true,
    },
  });
}

/**
 * Does: Promotes valid release notes while retaining historical bytes.
 * Called by: publication after all repository checks pass.
 */
export function promote(
  text,
  version,
  date = new Date().toISOString().slice(0, 10)
) {
  const parts = changelogParts(text);
  if (!bullets(parts.body).length)
    throw new Error('Cannot release empty Unreleased notes');
  return `${parts.prefix}## [Unreleased]\n\n## [v${version}] - ${date}\n\n${parts.body.trim()}\n\n${parts.history}`;
}

/**
 * Does: Bumps the root version and atomically publishes its commit and annotated tag.
 * Called by: the workflow only after checks pass for the unchanged selected snapshot.
 */
export function publish(type, snapshot) {
  if (!['patch', 'minor', 'major'].includes(type))
    throw new Error('Invalid bump type');
  if (git('rev-parse', 'HEAD') !== snapshot || git('status', '--porcelain'))
    throw new Error('Release snapshot changed or working tree is dirty');
  const notes = readFileSync('CHANGELOG.md', 'utf8');
  promote(notes, '0.0.0'); // Validate before npm modifies files.
  execFileSync(
    'npm',
    [
      'version',
      type,
      '--no-git-tag-version',
      '--ignore-scripts',
      '--workspaces=false',
    ],
    { stdio: 'pipe' }
  );
  const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
  writeFileSync('CHANGELOG.md', promote(notes, version));
  git('add', 'package.json', 'package-lock.json', 'CHANGELOG.md');
  git('-c', 'core.hooksPath=/dev/null', 'commit', '-s', '-m', version);
  git('tag', '-a', `v${version}`, '-m', `v${version}`);
  git(
    'push',
    '--atomic',
    'origin',
    'HEAD:refs/heads/main',
    `refs/tags/v${version}`
  );
  return `v${version}`;
}

/**
 * Does: Executes the workflow's selection, recovery, or publication phase.
 * Called by: the release workflow through the command-line entry point.
 */
async function main() {
  const mode = process.argv[2];
  if (mode === 'select') {
    const snapshot = git('rev-parse', 'HEAD');
    const tag = baseline(snapshot);
    if (
      JSON.parse(readFileSync('package.json', 'utf8')).version !== tag.slice(1)
    )
      throw new Error('Snapshot version differs from baseline');
    const type =
      process.env.GITHUB_EVENT_NAME === 'workflow_dispatch'
        ? 'none'
        : selectBump(await mergedPulls(), tag, snapshot);
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `type=${type}\ntag=${tag}\nsnapshot=${snapshot}\n`
    );
  } else if (mode === 'recover') {
    const tag = baseline();
    await ensureRelease(tag);
  } else if (mode === 'publish') {
    await ensureRelease(
      publish(process.env.RELEASE_TYPE, process.env.RELEASE_SNAPSHOT)
    );
  } else throw new Error('Expected select, recover, or publish');
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
