# Project guidance

NAP uses JavaScript with Node 24 and ESM. JSDoc type annotations and JavaScript
typechecking tools may be used when useful.

## Working approach

- Inspect current code before making changes.
- Keep changes scoped to the requested outcome.
- Preserve the module boundaries under `apps/api/src`.
- Add source-file copyright headers to new `.js`, `.jsx`, and `.mjs` files.

## Product requirements documents

- Follow `docs/PRDs/README.md` and start new PRDs from
  `docs/PRDs/TEMPLATE.md`.
- For every PRD or supporting chapter, use the `human-writing` skill, then use
  `check-relevancy` and revise the document before completion.

## Checks

When work changes roadmap progress, update `docs/roadmap/ROADMAP.md` and list
the affected deliverables under `## Roadmap` in the PR description.
Unrelated PRs may omit that section or use `None`.

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run build`
- `npm run licenses`

## Shipping

Use `.claude/skills/ship/SKILL.md` for commit, PR, review, merge, changelog, and
release operations after Git has been initialized.
