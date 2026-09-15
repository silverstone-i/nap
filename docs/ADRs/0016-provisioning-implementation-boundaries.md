# 0016 — Provisioning implementation boundaries

- **Status:** Accepted
- **Date:** 2026-09-15
- **Requirements:** ARCH-042, ARCH-043, ARCH-045, ARCH-048, ARCH-051

## Decision

Adopt the owner-approved specification amendments for the existing provisioning
implementation. The technology stack permits its four named JavaScript files;
the import contract permits its two named reference-seed imports; operational
standards define bounded readiness polling separately from application retries.
The specification owns the exact limits. Tests enforce the language and import
exceptions across TypeScript and JavaScript.

The owner also approved retaining the shared package's existing `transport/`
contracts and direct root export of `transport/control.ts`. Endpoint ownership
and the prohibition on consumer deep imports remain unchanged. The specification
now describes those files instead of requiring an absent identity domain folder.

## Rationale

The API and maintenance CLI already share these provisioning modules. Converting
them or moving seed operations would change implementation structure without
changing the requested behavior. The owner chose to retain that implementation
and make its narrow boundaries explicit.

Readiness polling performs reads while a provider becomes available. Fixed
intervals preserve existing behavior. This decision grants no permission to
retry resource creation, credential changes, or business mutations.

The shared package already exposes these contracts through its public entry
point. Documenting their actual location preserves the public API and avoids an
unrelated file move during documentation reconciliation.

## Alternatives

Converting provisioning to TypeScript and moving its seed calls was considered.
The owner selected architecture amendments instead. A blanket exemption for all
services or JavaScript files was rejected because it would hide unrelated imports.

## Consequences

This amends the implementation boundaries used by ADR 0014; its provisioning
lifecycle remains in force. It adds no tables, routes, dependencies, or deployment
steps. Earlier ADR rationale and historical verification remain unchanged.
Module layout and descriptor documentation now describe the existing code.

The documentation index owns delivery-plan policy; the specification retains
physical documentation placement and links to that policy.
