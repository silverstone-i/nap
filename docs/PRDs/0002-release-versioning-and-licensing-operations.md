# 0002 — Release, versioning, and licensing operations

**Design:** Accepted (owner approved implementation plan, 2026-09-07).
**Implementation:** Implemented (local validation; merge and live release evidence pending).

## Authority

Derives from `ARCH-001`, `ARCH-003`, and `ARCH-051` in the
[platform specification](../specs/nap-platform-specification.md). This capability
owns repository releases, not deployment, migrations, or API protocol versions.

## Accepted behavior

- **REL-001:** A PR has zero or one exact release label (`release:patch`,
  `release:minor`, `release:major`). A releasing PR adds a nonempty bullet under
  exactly one Unreleased heading and preserves existing released history.
- **REL-002:** CI alone changes the root application version and its lockfile
  record. PRs cannot change existing root or workspace version fields.
  Workspace versions do not follow application releases.
- **REL-003:** Each run snapshots main and selects merged PRs reachable from
  that snapshot but outside the latest reachable stable version tag. Paginated
  metadata must be complete; lookup failures abort. The highest pending label
  determines one batch bump. An unlabelled merge may trigger a labelled backlog;
  no pending label means no new release. Old events cannot release old PRs again.
- **REL-004:** All repository checks pass before npm bumps the root version.
  Promotion preserves released history and creates a new empty Unreleased
  section with a UTC release date. A DCO-signed commit and annotated tag are
  pushed atomically without force; concurrent main changes fail safely.
- **REL-005:** A stable baseline tag must agree with its tagged root manifest.
  Before a new release, its predecessor must have a GitHub Release. Recovery
  dispatch only ensures that Release exists; it never bumps or creates a tag.
  Existing Releases are no-ops; only a confirmed missing Release permits
  creation. Authentication and network errors fail visibly.
- **REL-006:** Installed production dependencies, including workspaces and
  hoisted transitives, must match locked versions and have licenses approved by
  [.licenses-allowed.json](../../.licenses-allowed.json). Unknown, missing,
  guessed, or disallowed licenses fail closed. Missing required packages and
  inventory records fail; absent optional packages are permitted. License
  expressions are matched exactly, without interpreting SPDX alternatives.
- **REL-007:** PR content is data and is never executed with write credentials.
  Release automation uses the existing deploy key for Git pushes and GitHub
  token for generated-note Releases. No deployment or package publishing occurs.

## Acceptance evidence

Isolated tests cover each requirement, including reruns and partial failures.
All repository checks must pass before marking Implemented. Verified additionally
requires merged green CI and actual publication/recovery evidence.

## Local evidence

Node 24.19.0 passed lint, format check, typecheck, all 211 tests, build,
production licenses (220 package records), and diff check on 2026-09-07.
The full test suite required local socket/PostgreSQL fixture access outside the
filesystem sandbox. Publication tests used temporary Git repositories and a
local bare remote; GitHub recovery used mocked responses. No live release was
created and no repository version was changed.

## Revisions

| Date       | Change                                                    |
| ---------- | --------------------------------------------------------- |
| 2026-09-07 | Accepted initial release and dependency-license contract. |
