# 0002 — Specification-owned plan filenames

- **Status:** Accepted
- **Date:** 2026-09-06

## Context

Security-sensitive platform foundations require delivery plans but have no
component PRD. The prior filename rule required a PRD number, while the
workspace-and-toolchain plan already used a capability-only filename.

## Decision

Use the specification's amended [documentation placement](../specs/nap-platform-specification.md#documentation-placement)
rule: specification-owned capabilities without a PRD use `<capability>.md`.
PRD-owned plans retain their PRD number. The owner approved this exception
while planning the database and migration foundation.

## Alternatives considered

Inventing a PRD solely to obtain a number would duplicate specification-owned
architecture. Leaving the exception undocumented would preserve contradictory
filename guidance.

## Consequences

The existing workspace plan and the database-foundation plan have valid names.
This changes documentation placement only, not capability requirements or status.
