/*
 * Copyright (c) 2026–present NapSoft, LLC.
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { git } from './release.mjs';

const roadmapPath = 'docs/roadmap/ROADMAP.md';
const statuses = new Set(['Not started', 'In progress', 'Blocked', 'Complete']);

// PR bodies are data only; never interpolate their contents into commands.
export function roadmapReferences(body = '') {
  const sections = [...(body ?? '').matchAll(/^## Roadmap[ \t]*\r?$/gm)];
  if (!sections.length) return [];
  if (sections.length !== 1) throw new Error('Use one Roadmap section');
  const remaining = body.slice(sections[0].index + sections[0][0].length);
  const section = remaining.split(/^## /m)[0].trim();
  if (!section || /^none\.?$/i.test(section)) return [];
  return section
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map(line => {
      const match = /^- (\S.*)$/.exec(line);
      if (!match)
        throw new Error('Roadmap: use None or one deliverable per bullet');
      return match[1].trim();
    });
}

function rows(text) {
  const result = new Map();
  for (const line of text.split('\n')) {
    if (!/^\|\s*\d+\s*\|/.test(line)) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim());
    if (cells.length !== 6)
      throw new Error('Expected six roadmap table columns');
    const [, name, , , status, evidence] = cells;
    if (result.has(name))
      throw new Error(`Duplicate roadmap deliverable: ${name}`);
    if (!statuses.has(status))
      throw new Error(`Invalid roadmap status: ${name}`);
    result.set(name, { status, evidence });
  }
  return result;
}

export function validateRoadmap(baseText, headText, body) {
  const references = roadmapReferences(body);
  if (!references.length && baseText === headText)
    return 'No roadmap updates required';
  const base = rows(baseText);
  const head = rows(headText);
  for (const name of references) {
    const before = base.get(name);
    const after = head.get(name);
    if (!after) throw new Error(`Unknown roadmap deliverable: ${name}`);
    if (
      before &&
      before.status === after.status &&
      before.evidence === after.evidence
    )
      throw new Error(`Update the roadmap status or evidence for: ${name}`);
  }
  for (const [name, after] of head) {
    const before = base.get(name);
    if (
      after.status === 'Complete' &&
      (before?.status !== 'Complete' || before?.evidence !== after.evidence) &&
      (!after.evidence ||
        /^(?:none|n\/a|tbd|pending|[-—])\.?$/i.test(after.evidence))
    )
      throw new Error(`Completion requires verification evidence: ${name}`);
  }
  return 'Roadmap validation passed';
}

function roadmapAt(ref) {
  const exists = git('ls-tree', '--name-only', ref, '--', roadmapPath);
  return exists ? git('show', `${ref}:${roadmapPath}`) : '';
}

export function checkRoadmapPullRequest(pr) {
  const base = git('merge-base', pr.base.sha, pr.head.sha);
  return validateRoadmap(roadmapAt(base), roadmapAt(pr.head.sha), pr.body);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const event = JSON.parse(
      readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')
    );
    console.log(checkRoadmapPullRequest(event.pull_request));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
