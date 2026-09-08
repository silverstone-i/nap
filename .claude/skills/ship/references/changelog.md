# Changelog entries

## Entry style

Keep a Changelog format. Entries go under `## [Unreleased]`, grouped by:

```markdown
## [Unreleased]

### Added
- New user-facing capability

### Changed
- Behavior that differs from the previous release

### Fixed
- Bug that no longer occurs

### Removed
- Capability that no longer exists
```

Only include the sections that have entries. Match the file's existing tone
and formatting (some repos decorate headings — follow what is already
there). Describe user-visible behavior, not implementation: "reads
`.xlsx` files with inline strings" not "refactored the parser".

## Deriving entries from the PR diff

Read the actual changes, not just commit messages:

```bash
git log --oneline main..HEAD
git diff main...HEAD --stat
git diff main...HEAD            # read the parts that matter
```

Write one bullet per user-visible change. Internal refactors with no
behavior change usually get one `### Changed` bullet or none at all — if
the PR is CI/docs-only and heading for an unlabeled merge, it may
legitimately add no entries (confirm with the user before treating it that
way, since `ship` refuses to merge with an empty section).

## Mapping entry types to a suggested bump

| entries look like | suggest |
|---|---|
| only Fixed, dependency updates, doc fixes, internal refactors | `release:patch` |
| any Added (new features, new exports, new optional parameters) | `release:minor` |
| any Removed, renamed exports, changed behavior, breaking schema changes | `release:major` |
| CI/docs/tooling only | no label |

This is a suggestion for merge.md's proposal step, not a decision — the
effective bump also depends on labels already queued (see merge.md).

## Repair: missing `## [Unreleased]`

Should be unreachable since the release workflows re-insert a fresh
`## [Unreleased]` when promoting (shipped 2026-07-31 on branch
`ci/changelog-unreleased-reinsert` in all three repos) and self-heal when
the heading is absent. If it still happens (e.g. hand-edited file):

1. Insert `## [Unreleased]` followed by a blank line directly above the
   newest `## [<version>]` heading.
2. Do not move any existing entries under it — they belong to released
   versions.
3. Commit it with the changelog entries, not as a separate fix.
