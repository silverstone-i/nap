# Release operations

Implements `REL-001`–`REL-007` in [PRD 0002](../PRDs/0002-release-versioning-and-licensing-operations.md).

## Contributor operations

Sign every commit with `git commit -s`. Use `feat/`, `fix/`, `docs/`, or `chore/`
branches and keep a PR to one concern. Main is the only long-lived branch;
contributors never push directly to it. Releasing PRs choose exactly one release
label and add bullets under `## [Unreleased]`. CI owns version changes,
changelog promotion, annotated tags, and GitHub Releases.

The root package manifest owns the application version. Workspace versions are
independent. Dependency lockfile updates are permitted; manual application or
existing workspace version changes in PRs are rejected.

## Licensing

NAP is AGPL-3.0-or-later. Every `.ts`, `.tsx`, `.js`, and `.mjs` file carries
this header using suitable comment syntax; Markdown, JSON, and YAML do not:

```text
Copyright (c) 2026–present NapSoft, LLC.
SPDX-License-Identifier: AGPL-3.0-or-later
```

Run `npm run licenses` against the installed lockfile dependency set.
[.licenses-allowed.json](../../.licenses-allowed.json) is the sole allowlist.
Adding an entry requires justification in the dependency's PR. Exact reported
expressions are checked; uncertain license evidence is not approval.

## Publication and recovery

The release workflow runs serially against a main snapshot. Pending labelled
PRs form one batch; the highest bump wins. An unlabelled event can service that
backlog, but contributes no bump itself. Each new run discovers pending work
from Git ancestry, so event order and reruns do not duplicate releases.

`RELEASE_DEPLOY_KEY` must remain a write deploy key with the existing main
ruleset bypass. The GitHub token needs contents write and pull-request read.
Do not print or copy credential values. The release workflow owns the only
automated direct-main version commit exception.

- Failure before push: correct the reported input/check failure and rerun the
  merged-PR workflow. Nothing has been published.
- Atomic push rejection: rerun against fresh main so batch selection and all
  checks run again. Never rebase a prepared version commit or force-push it.
- Push succeeded but Release creation failed: dispatch Release on Merge
  manually. It verifies the latest reachable stable tag and creates only its
  missing Release. A later merge also repairs this before publishing a batch.
- Existing Release: recovery succeeds without editing it. API authentication,
  permission, or network failures require fixing access and rerunning.
- Missing or inconsistent baseline tag: stop for operator investigation. Do
  not invent, replace, or move a tag to get the workflow green.

A published version is immutable. Correct mistakes through a subsequent PR.
Live shipping and recovery evidence belongs in the roadmap/PRD once obtained;
local fixture tests alone do not justify Verified.
