# Product Requirements Documents

## Purpose

PRDs define what NAP must do. Architecture documents define system boundaries
and structure. ADRs record decisions, roadmaps define sequence and status, and
implementation plans coordinate delivery.

## Organization

PRDs are grouped by what they describe:

```text
docs/PRDs/
|-- modules/
|   `-- M0001-admin-tenancy.md
|-- capabilities/
|   `-- C0001-authentication.md
`-- workflows/
    `-- W0001-tenant-provisioning.md
```

- Module PRDs define an area that owns tables and module-specific rules.
- Capability PRDs define application behavior that may use several modules.
- Workflow PRDs define sequencing across modules or infrastructure.

Each category has its own four-digit sequence. Numbers identify documents; they
do not set implementation order.

## File And Document Names

Use these filename patterns:

```text
M0001-admin-tenancy.md
C0001-authentication.md
W0001-tenant-provisioning.md
```

Use the same identifier in the document title:

```markdown
# M0001: Admin Tenancy
```

Refer to another PRD by identifier and title, such as `C0003: RBAC`.

## Status

A PRD has one status:

- `Draft`: under discussion and not approved for implementation.
- `Accepted`: explicitly approved for implementation.
- `Implemented`: delivered and verified against the accepted requirements.
- `Superseded`: replaced by another identified PRD or decision.

Only explicit owner approval moves a PRD from `Draft` to `Accepted`. Code alone
does not change a PRD's status. Use `Implemented` only when the relevant code
and tests have been verified.

## Required Format

Every PRD follows the sections in [TEMPLATE.md](TEMPLATE.md), in this order:

1. Document Control
2. Purpose
3. Scope
4. Actors And Permissions
5. Concepts And Terminology
6. Functional Requirements
7. Business Rules And Invariants
8. Lifecycle And State Transitions
9. Data Requirements
10. API Requirements
11. Cross-Module Interactions
12. Security And Audit
13. Acceptance Criteria
14. Open Questions

The Purpose section is mandatory. Other sections must remain present. Write
`Not applicable` with a short reason when a section does not apply.

Use a decision table when behavior changes by actor, permission, state, or
context. A decision table is required for authorization decisions.

## Requirements

Give every normative requirement a stable identifier based on its PRD:

```text
M0001-R001
C0002-R001
W0001-R001
```

Do not reuse or renumber an existing identifier. Acceptance criteria should
reference the requirements they verify.

Use normative terms consistently:

- `must`: mandatory;
- `must not`: prohibited;
- `should`: expected unless a documented reason justifies an exception;
- `may`: optional.

Keep requirements separate from implementation plans. A requirement states an
outcome, rule, or constraint. It names an implementation detail only when that
detail is part of the accepted contract.

## Ownership And Cross-References

Each requirement has one authoritative PRD. Other documents link to that
requirement instead of restating it.

For example:

- a module PRD owns its stored data and module invariants;
- a capability PRD owns behavior that uses module data;
- a workflow PRD owns cross-module sequencing, retry, and failure recovery.

Large PRDs may use supporting chapters:

```text
modules/
|-- M0001-admin-tenancy.md
`-- M0001-admin-tenancy/
    `-- tenant-registry.md
```

The numbered PRD remains authoritative. A supporting chapter must link to its
parent, inherits the parent's status, and must not introduce a requirement that
the parent does not reference. Split a chapter only when the material becomes
difficult to review in the parent document.

## Writing And Review

Prerequisite: install and configure the `human-writing` and `check-relevancy`
skills in your coding agent's local environment. These required skills are not
bundled in this repository.

Use the `human-writing` skill while drafting or editing every PRD and supporting
chapter. Then use the `check-relevancy` skill and revise the text before review
or completion.

The relevance review must confirm that:

- every section supports the document's purpose;
- every requirement belongs to the document's stated scope;
- domain terms are defined before use;
- repeated requirements are replaced with links to their authoritative PRD;
- implementation details appear only when they define required behavior or a
  constraint.
