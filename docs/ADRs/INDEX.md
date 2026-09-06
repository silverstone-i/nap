# Architecture decision records

The [platform specification](../specs/nap-platform-specification.md) governs.
ADRs record decisions and amendment rationale; implementation status belongs in
the [development roadmap](../roadmaps/DEVELOPMENT-ROADMAP.md).

| ADR                                                                                     | Status   | Requirements                       | Scope                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------- | -------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [0001 — Project workflow module boundaries](0001-project-workflow-module-boundaries.md) | Accepted | `ARCH-041`, `ARCH-046`, `ARCH-047` | Module ownership map; Catalog/BOM; Cost Codes; Estimating release; Project Costs baselines; Scheduling occurrences; A/P purchase orders; operational changes and contractual milestones |
| [0002 — Specification-owned plan filenames](0002-specification-owned-plan-filenames.md) | Accepted | —                                  | `docs/implementation-plans/`; capability-only filenames for specification-owned work without a PRD; numbered filenames for PRD-owned plans                                              |
| [0003 — Safe database log messages](0003-safe-database-log-messages.md)                 | Accepted | `ARCH-045`                         | Safe message selection, metadata omission, and boundary-owned request failure logs                                                                                                      |
