# 0010. Conventional Commits over Freeform Messages

**Date:** 2025-02-17
**Status:** accepted
**Author:** NapSoft

## Context

NAP is a monorepo with two workspaces (`apps/nap-serv`, `apps/nap-client`) and a shared package. Commit history needs to be filterable by scope (which workspace or module was changed) and by type (feature, fix, refactor, etc.) to support code review, changelog generation, and release management. Freeform commit messages vary in format and provide no machine-parseable structure.

## Decision

All commits follow the Conventional Commits format: `<type>(<scope>): <subject>`

**Types:** `feat`, `fix`, `refactor`, `test`, `chore`, `docs`

**Scopes:** `serv`, `client`, `deps`, or specific modules (`ap`, `ar`, `accounting`)

**Examples:**
- `feat(serv): add AR aging SQL view and report endpoint`
- `fix(client): correct tenant bar dropdown not updating on switch`
- `refactor(serv): extract posting logic into PostingService`
- `test(serv): add RBAC integration tests for AP module`
- `chore(deps): bump pg-schemata to 1.3.1`
- `docs: update PRD with cashflow module specification`

**Enforcement:** Husky pre-commit hook rejects commits that touch files in both `apps/nap-client/` and `apps/nap-serv/` simultaneously, ensuring each commit is scoped to a single workspace. Cross-workspace changes (shared types, config) use `--no-verify` when necessary.

## Alternatives Considered

| Alternative | Pros | Cons |
|---|---|---|
| Freeform commit messages | No tooling required; no learning curve; maximum flexibility | No machine parsing; inconsistent format across developers; cannot auto-generate changelogs; difficult to filter history by scope or type |
| Commitizen (interactive CLI prompt) | Guided commit message creation; enforces format interactively | Adds a CLI dependency; slower commit workflow; same underlying format (Conventional Commits) can be adopted without the tool |

## Consequences

**Positive:**
- Parseable history — commits can be filtered by type and scope using standard tools (`git log --grep`)
- Automated changelog potential — tools can generate release notes from structured commit messages
- Scope-based filtering — quickly identify all changes to a specific module or workspace
- Consistent format across all contributors

**Negative:**
- Learning curve for contributors unfamiliar with the convention
- Requires discipline (or linting) to maintain — improperly formatted commits reduce the value of the convention
- The Husky single-workspace enforcement occasionally requires `--no-verify` for legitimate cross-workspace changes
