# ADR 0010 — Conventional Commits

**Status:** Accepted
**Date:** 2025-02-22
**Deciders:** NapSoft Engineering

## Context

A monorepo with multiple workspaces (`nap-serv`, `nap-client`, `shared`) needs clear commit history that identifies which workspace and which type of change each commit represents.

## Decision

All commits follow the **Conventional Commits** specification with workspace scopes.

### Format

```
<type>(<scope>): <description>

[optional body]
```

### Types

| Type | Usage |
|------|-------|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `chore` | Maintenance, config, deps |
| `docs` | Documentation only |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `test` | Adding or updating tests |

### Scopes

| Scope | Workspace |
|-------|-----------|
| `nap-serv` | Backend server |
| `nap-client` | Frontend client |
| `shared` | Shared package |
| *(none)* | Root configs, monorepo tooling |

### Husky Enforcement

A pre-commit hook blocks commits that touch files in **both** `apps/nap-client/` and `apps/nap-serv/` in the same commit. This ensures clean separation of server and client changes in git history.

## Consequences

- Git log is machine-parseable for changelog generation.
- Mixed-workspace commits are rejected at commit time, enforcing discipline.
- Each commit clearly identifies the affected workspace and change type.
