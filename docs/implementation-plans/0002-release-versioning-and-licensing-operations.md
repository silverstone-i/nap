# Release, versioning, and licensing operations

## Features

- Strict release-label, changelog, and version validation.
- Ancestry-based batched releases and atomic commit/tag publication.
- Idempotent GitHub Release recovery.
- Production-license failure-path coverage.
- Owning requirements, conventions, and recovery instructions.

## Accepted design and delivery

Implements [PRD 0002](../PRDs/0002-release-versioning-and-licensing-operations.md),
approved by the owner on 2026-09-07. Deliver as one coherent change: write owning
documents, implement scripts and workflow orchestration, add isolated tests,
then run repository checks. This record does not own implementation status.

## Impact and risks

Replaces inline release shell logic and the permissive changelog check. Keeps
the root application version, deploy-key authentication, generated release
notes, and license allowlist. GitHub metadata failures stop publication;
concurrent main updates reject the atomic push and require a fresh run.
No application API, database, deployment, or workspace version changes.

## Evidence and recovery

Exercise PR inputs, Git ancestry, pagination, atomic pushes, repeated runs,
GitHub failures, and license inventory failures in temporary fixtures. Run
Node 24.19.0 lint, format check, typecheck, tests, build, licenses, and diff check.
Follow [release operations](../RULES/release-operations.md) for recovery.
Leave changes uncommitted; live merge/release evidence is a later shipping step.

## Merge and CI evidence

[PR #12](https://github.com/silverstone-i/nap/pull/12) merged on 2026-09-07
with the `changelog`, `checks`, and `release` workflows passing and published
version 0.8.0. A manual recovery dispatch on 2026-09-07 succeeded without
changes, and the `REL-007` workflow-contract test was added during
reconciliation; PRD 0002 and the roadmap record the run links.
