# Label proposal, merge, and cleanup

## Why the diff alone is not enough

NAP's [release script](../../../../scripts/release.mjs), run by the
[Release on Merge workflow](../../../../.github/workflows/release-on-merge.yml),
selects pending labeled PRs from the unreleased Git history and applies the
highest bump: patch < minor < major. The current PR's label is combined with
labels on merged-but-unreleased PRs. An unlabeled merge contributes no bump,
but can trigger publication of that existing backlog, so the effective release
cannot be inferred from the current diff alone.

## Query the queued labels

```bash
last_tag=$(git tag --list 'v[0-9]*' --sort=-v:refname | grep -v -- '-rc\.' | head -1)
since=$(git log -1 --format=%cI "$last_tag")
gh pr list --state merged --base main --search "merged:>$since" --limit 200 \
  --json number,labels
```

If there is no release tag yet, only this PR's label counts.

## Present the decision

Present all three pieces before asking:

1. The level this diff suggests (from the entry-type mapping in
   changelog.md).
2. Any level already queued on merged, unreleased PRs.
3. The resulting effective bump. Example: a `release:minor` is already
   pending, so adding `release:patch` to this PR will not change the
   outcome — the release will be minor either way.

## Skip the proposal when the level is already decided

The proposal exists to pick a release level. When the user has already
picked one, skip it — do not re-ask a settled question. Two ways it is
settled:

- **Named in the invocation** — "ship with release:minor".
- **Already on the PR** — `gh pr view --json labels` shows a `release:*`
  label, applied by `pr`, by the user, or by an earlier session.

In either case: apply the label if it is not already there, merge, perform the
standard post-merge cleanup below, and report what was done. No proposal and no
merge confirmation — naming or applying the label is the approval for the
label, merge, and cleanup.

This does not skip the _preconditions_. Still refuse to merge on red
checks or an empty `## [Unreleased]`, and still say so rather than merging
anyway. If the invocation names a level that conflicts with a label
already on the PR, stop and ask — that is a genuine ambiguity, not a
settled question.

## Default is unlabeled

With no level decided, an unlabeled merge is the safer default: it is
reversible — the entries can be labeled into a later release or followed by
a labeled PR. A published npm version (or a production deploy, for seqori)
is not. Present both options — merge with the `unlabeled` label vs. add the
proposed `release:*` label — and require an explicit choice. State that either
merge choice also performs the standard cleanup below. Never add a label, run `gh pr merge`, or delete a
branch without confirmation covering those actions.

An explicit `/ship unlabeled` invocation is not an undecided default. It is the
user's direct choice and authorization to finalize the changelog, commit and
push as needed, wait for required CI, apply the `unlabeled` label, merge without
a release label, and perform the standard cleanup. Do not present the options
again and do not request another confirmation. Pending CI means wait. Stop only
when a required check fails or another concrete merge or cleanup precondition
fails.

## Every merge option is recorded as a label

A merge this skill performs always leaves the decision visible on the PR:

- a decided release level applies that `release:*` label;
- an unlabeled merge — chosen at the proposal or via `/ship unlabeled` —
  applies the `unlabeled` label, which the release workflow ignores because it
  matches only `release:*`.

Apply the label before merging, with `gh pr edit <number> --add-label <label>`.
The label must already exist in the repository, so check first and create a
missing one:

```bash
gh label list --limit 200 | grep -q '^unlabeled	' \
  || gh label create unlabeled --description "Merge triggers no release" --color cfd3d7
gh pr edit <number> --add-label unlabeled
```

Creating and applying the label carries out an approval already given — the
named level, the selected option, or `/ship unlabeled`. It is never a reason to
ask again, and `unlabeled` never changes what CI releases.

## Cleanup deletes exactly one branch

Cleanup deletes **one** branch and only one: the head of the PR this run just
merged, by the exact `headRefName` captured before the merge. Nothing else is
ever in scope — not a branch that looks stale, merged, obsolete, or abandoned,
not the head of a closed-unmerged PR, not a leftover from an earlier session,
and not a branch the user mentioned in conversation.

Concretely, during cleanup:

- Never enumerate branches to find deletion candidates. `git branch`,
  `git branch -a`, and `gh pr list` are not inputs to what gets deleted.
- Never pass more than one branch name to `git branch -D` or
  `git push origin --delete`, and never a glob, a loop, or a pipeline.
- `git fetch --prune` is allowed — it only drops remote-tracking refs GitHub
  already deleted. Never use it as a reason to delete a local branch.
- A closed-unmerged PR's branch is someone's unshipped work. It is never
  cleanup, even when its PR is closed and its commits look orphaned.

Deleting any other branch requires the user asking for that branch by name in
their current message. Tidying up branches is not part of `ship` and is never
offered as a follow-on to a successful merge.

## Reconcile capability verification before merge

For a PR completing a roadmap capability or work unit, inspect the owning
roadmap, PRD, and implementation plan before merging. Confirm the promised scope
is complete and required checks pass; do not mark partial delivery Verified.

Include the final status and evidence in the capability PR itself. For NAP, Verified
requires merged code and passing CI. State `Verified upon merge of PR #N with
required checks passing` in the PR branch and link the PR and available CI
evidence. This becomes effective when the PR merges; do not describe unmerged
code as already verified. Reconcile completed checklists and stale blocker notes.
Use NAP's existing status vocabulary and owning documents.

Commit and push any documentation corrections on the PR branch, run applicable
local checks, and wait for required CI on the new head before merging. Shipping
authorization covers this reconciliation; no separate approval is needed. After
merge, confirm the merged status and CI satisfy the recorded condition. Do not
leave routine capability verification for a follow-up documentation PR.

## Resolve the cleanup targets before merge

Before asking for merge confirmation, fetch the PR's `headRefName`,
`baseRefName`, and head commit together with its checks and labels. Preserve
those exact names for cleanup; do not reconstruct them from the current branch
after merge.

Refuse to merge or delete anything when either name is empty, the names are
equal, or the head is the repository's default branch. For a cross-repository
PR, explain that remote-head cleanup needs separate handling and ask before
deleting a branch outside the base repository.

The confirmation must describe the full result: merge the PR, switch to and
fast-forward the base branch, delete the PR head locally and remotely, prune,
and verify. A user selecting the unlabeled option or a release level approves
that complete sequence. A release level already decided under the rule above
does the same without another prompt.

## Merge and standard post-merge cleanup

After preconditions pass and approval exists:

1. Merge using the repository-required strategy and request branch deletion
   from GitHub CLI, for example `gh pr merge <number> --squash --delete-branch`
   when the repository requires squash merges.
2. Query the PR again. Continue only when its state is `MERGED`; record the
   merge commit. If merge failed or remains pending, stop without cleanup.
3. Switch to the captured base branch. Do not force checkout or discard a
   dirty worktree.
4. Fast-forward it with `git pull --ff-only origin <base>`. Never reset or
   force-update the base when fast-forwarding fails.
5. If the captured local head branch still exists, delete that exact branch —
   the one captured in step "Resolve the cleanup targets", never a name
   re-derived or re-discovered after the merge.
   A squash merge does not make the feature tip an ancestor of the base, so
   `git branch -D -- <head>` is allowed only after step 2 verified the merged
   PR and after switching away from the head.
6. If the exact remote head still exists in the base repository, delete it
   with `git push origin --delete <head>`. Delete no other remote ref. This is
   the last deletion of the run; cleanup deletes nothing further.
7. Run `git fetch --prune origin`.
8. Verify and report all of these: the current branch is the captured base,
   the worktree is clean, the base is neither ahead of nor behind its
   upstream, the local head branch is absent, and `origin/<head>` is absent.

Cleanup is part of a successful `ship`, not a best-effort suggestion. If a
step fails, preserve the safely completed state, report the exact remaining
branch or sync work, and do not use a reset, force-push, or broader deletion to
hide the failure.
