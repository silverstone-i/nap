# Repository scripts

Node scripts run by npm and by the GitHub workflows in `.github/workflows/`.
Their tests live in `scripts/tests/` and run with `npm run test:toolchain`.

| Script                 | Run by                    | Purpose                                                                                                                                                |
| ---------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `check-licenses.mjs`   | `npm run licenses`, CI    | Fail when an installed production dependency has a license outside `.licenses-allowed.json` or a version that differs from the lockfile.               |
| `check-release-pr.mjs` | Changelog Check workflow  | Enforce the release contract below on every pull request.                                                                                              |
| `check-roadmap-pr.mjs` | Roadmap Check workflow    | Require a status or evidence change for each deliverable listed under `## Roadmap` in the PR body, and evidence for any deliverable marked `Complete`. |
| `release.mjs`          | Release on Merge workflow | Select the version bump from merged PR labels, bump the root version, promote the changelog, tag, push, and create the GitHub Release.                 |

## Release contract

- Label each PR `release:patch`, `release:minor`, `release:major`, or
  `unlabeled`. Use exactly one. `unlabeled` cannot combine with a release label.
- A PR with a release label must add at least one new bullet under
  `## [Unreleased]` in `CHANGELOG.md` and must not change released history.
- No PR changes a `version` field in `package.json`, a workspace manifest, or
  the lockfile. CI bumps the root version on merge.
- On merge, the workflow takes the largest bump among merged PRs since the last
  `vX.Y.Z` tag, commits the bump and changelog promotion, pushes the tag
  atomically, and creates the Release. A manual `workflow_dispatch` run only
  re-creates a missing Release for the current tag.

## Licensing

`.licenses-allowed.json` is the only list of approved production licenses. Add
an entry in the same PR that introduces the dependency needing it, with the
justification in the PR description. Unknown, missing, or guessed licenses
fail the check.
