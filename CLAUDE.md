# Project guidance

NAP is a JavaScript-only Node 24 ESM monorepo. Do not add TypeScript, declaration
files, `@types/*` packages, or typechecking tools.

## Working approach

- Inspect current code before making changes.
- Keep changes scoped to the requested outcome.
- Preserve the module boundaries under `apps/api/src`.
- Add source-file copyright headers to new `.js`, `.jsx`, and `.mjs` files.

## Checks

- `npm run lint`
- `npm run format:check`
- `npm test`
- `npm run build`
- `npm run licenses`

Use `.claude/skills/ship/SKILL.md` for commit, PR, review, merge, changelog, and
release operations after Git has been initialized.
