# Opening the PR

## What to summarize

Build the body from the commit range, reading real diffs rather than
trusting commit messages:

```bash
git log --oneline main..HEAD
git diff main...HEAD --stat
git diff main...HEAD            # read enough to describe behavior
```

Summarize what changed and why at the level a reviewer needs: user-visible
behavior first, then notable internal changes, then anything risky or
follow-up-worthy. Skip file-by-file narration — the diff already shows that.

## Body template

```markdown
## Summary

One or two sentences: what this PR does and why.

## Changes

- User-visible change, stated as behavior
- Notable internal change (refactor, dependency, test infrastructure)

## Notes

Anything the reviewer should look at closely, known limitations, or
follow-ups deliberately left out. Omit the section if there is nothing.
```

Create with:

```bash
gh pr create --base main --title "<imperative summary of the work>" --body "<body>"
```

Print the URL and stop — merging belongs to the `ship` intent.

## Labeling at creation

Invoked with a merge option, add its label to the PR as it is created, by
passing `--label <label>` to `gh pr create`:

- a release level — "pr with release:minor" — uses `release:minor`;
- `unlabeled` — "/ship pr unlabeled" — uses the `unlabeled` label, which
  records that this PR deliberately triggers no release. It is inert to the
  release workflow, which matches only `release:*`.

Naming the option is the approval, so do not ask; report that the label was
applied alongside the URL. `ship` will then find the option already decided
and merge without re-proposing it (see merge.md).

Confirm the label exists in the repository before passing it — `gh pr create`
fails outright on an unknown label:

```bash
gh label list --limit 200 | grep -q '^unlabeled	' \
  || gh label create unlabeled --description "Merge triggers no release" --color cfd3d7
```

Create a missing `release:*` label the same way, using the description and
color the repository's release workflow documents. Creating the label carries
out the approval already given by naming the option; it is not a separate
decision to confirm.

Invoked with no option at all, create the PR with no label. The merge option
is a release decision, and `ship` owns it.

## Review automation

Use the repository's documented review automation and actual PR state to decide
whether a fresh review is automatic or needs a request. Do not impose a global
assumption about Copilot re-review behavior.
