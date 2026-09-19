# [ID]: [Title]

## 1. Document Control

| Field                | Value                                          |
| -------------------- | ---------------------------------------------- |
| Status               | Draft                                          |
| Type                 | Module, module Work Unit, feature, or workflow |
| Related architecture | [links or `None`]                              |
| Related PRDs         | [identifiers, titles, and links or `None`]     |
| Related decisions    | [links or `None`]                              |
| Last reviewed        | YYYY-MM-DD                                     |

<!-- For a Work Unit PRD, add a Family field linking to its module overview. -->

## 2. Purpose

<!-- Required. State what this area provides, who uses it, and why NAP needs it. -->

## 3. Scope

### Included

<!-- Responsibilities defined by this PRD. -->

### Excluded

<!-- Responsibilities owned elsewhere or intentionally out of scope. -->

## 4. Actors And Permissions

<!-- Identify each actor and the operations that actor may perform. -->

<!--
Use a decision table when behavior changes by actor, permission, state, or
context. A decision table is required for authorization decisions.

| Context | Actor | Required permission | Required state | Result |
| ------- | ----- | ------------------- | -------------- | ------ |
|         |       |                     |                |        |
-->

## 5. Concepts And Terminology

<!-- Define business terms before using table or implementation names. -->

## 6. Functional Requirements

<!--
Use stable identifiers derived from the PRD identifier. Do not renumber an
existing requirement.

- M0001-R001: The system must ...
-->

## 7. Business Rules And Invariants

<!--
Define rules that must hold across interfaces. State whether each rule belongs
in the database, module domain, application workflow, or request authorization
when that placement is part of the requirement.
-->

## 8. Lifecycle And State Transitions

<!--
Define valid states, permitted transitions, authorized actors, prerequisites,
effects, and failure behavior.
-->

## 9. Data Requirements

<!--
For owned data, define its purpose, identifiers, relationships, tenant boundary,
constraints, lifecycle, retention, audit behavior, sensitivity, and required
access patterns. Include exact columns only when their semantics are part of the
contract.
-->

## 10. API Requirements

<!--
For each operation, define its method and route, purpose, authorization,
request, response, rules, errors, idempotency, concurrency, and audit effect.
-->

## 11. Cross-Module Interactions

<!--
Identify data read from other modules, invoked workflows, projections, cache
invalidation, events, and dependency failure behavior.
-->

## 12. Security And Audit

<!--
Cover tenant isolation, sensitive data, credentials or tokens, audit records,
support access, throttling, revocation, and retention as applicable.
-->

## 13. Acceptance Criteria

<!--
State verifiable outcomes and reference the requirements each criterion covers.
-->

## 14. Outstanding Questions

<!-- Record unresolved decisions. Use `None` when all questions are resolved. -->
