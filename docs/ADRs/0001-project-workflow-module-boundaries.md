# 0001 — Project workflow module boundaries

- **Status:** Accepted
- **Date:** 2026-09-05
- **Requirements:** `ARCH-041`, `ARCH-046`, `ARCH-047`

## Context

The prior ownership map mixed shared activity definitions, scheduled work, and
production costs, while separating BOM assemblies from the catalog they require.
The owner-approved workflow distinguishes reusable definitions, pre-production
estimating, release, operational delivery, and financial transactions.

## Decision

Adopt the amended [module ownership map](../specs/nap-platform-specification.md#module-ownership-map)
and [ARCH-041](../specs/nap-platform-specification.md#arch-041--project-cost-module-boundaries).
These sections own the boundaries; this record explains their rationale.

Catalog and BOM belong together because assemblies require catalog items while
catalog items can exist independently. Cost Codes provides shared definitions;
Scheduling owns their occurrences. Estimating and Project Costs are separate
because release distinguishes the approved estimate from subsequent production
cost control. A/P owns purchase orders as the vendor-side transaction owner.
Projects and Contracts preserve the operational/contractual distinction in
[ARCH-046](../specs/nap-platform-specification.md#arch-046--binding-agreement-boundaries).

## Alternatives considered

- Keep the former map: leaves definitions, scheduled occurrences, and actuals
  mixed together and retains the unnecessary Catalog/BOM boundary.
- Keep production costs in Estimating: couples ongoing financial changes to
  the record of what was approved at release.
- Put purchase orders in Project Costs or a new procurement module: duplicates
  or splits the vendor transaction lifecycle without a demonstrated need.
- Match modules to menu areas: confuses navigation with exclusive ownership
  under `ARCH-047`.

## Consequences

The specification's product-area map and conformance entries and the development
roadmap are aligned in this change. Component PRDs still define tables, APIs,
permissions, states, events, and exact financial treatment before implementation.
No module implementation or migration is present to move in this repository.
The [workflow reference](../reference/nap-project-workflow-cost-architecture-reference.md)
preserves planning examples without becoming architectural authority.
