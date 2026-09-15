# 0014 — Register cell provisioning

- **Status:** Accepted
- **Date:** 2026-09-13
- **Requirements:** ARCH-005, ARCH-008, ARCH-009, ARCH-019, ARCH-022, ARCH-044, ARCH-047

## Decision

Implement the specification's Database provisioning and Environment configuration
contracts through Register cell. One API executes resumable provisioning and loads
new cells without restarting. DEV/TEST share local provisioning; PROD uses Render.
Management accepts DEV/PROD; TEST fixtures call the shared service directly.
Use UUID and database name throughout cell storage and contracts.

## Rationale and consequences

The existing operator session authorizes the workflow. The server already owns
configuration access; manual browser-cookie transfer and activation deployments
are unnecessary. Durable progress preserves resources and identity across retries.
A forward migration preserves existing assignments and verified database names.

This supersedes ADR 0011's startup-only pool lifecycle, ADR 0012's exclusion of
maintenance secrets from the API, and ADR 0013's separate cell CLI activation.
Their other decisions remain in effect. Remove cell CLI commands; retain admin CLI.

Implementation-boundary amendment: [ADR 0016](0016-provisioning-implementation-boundaries.md) records the approved language, seed-import, and polling exceptions. The lifecycle above remains in effect.
