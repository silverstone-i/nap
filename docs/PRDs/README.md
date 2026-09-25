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
`-- inter-module-workflows/
    `-- I0001-application-entry-and-shell.md
```

- Module PRDs define an area that owns tables and module-specific rules.
- Inter-module workflow PRDs own no tables. They define behavior that uses
  several modules' data, whether a user or a background worker starts it.

Elsewhere, "workflow" and "feature" keep their plain English meaning, such as
the steps a user takes to sign in.

"Capability" is reserved for authorization identifiers in `module::router::action` form.

Each category has its own four-digit sequence. Numbers identify documents; they
do not set implementation order.

## File And Document Names

Use these filename patterns:

```text
M0001-admin-tenancy.md
I0001-application-entry-and-shell.md
```

Use the same identifier in the document title:

```markdown
# M0001: Admin Tenancy
```

Refer to another PRD by identifier and title, such as `I0001: Application Entry and Shell`.

## Status

A PRD has one status:

- `Draft`: under discussion and not approved for implementation.
- `Accepted`: explicitly approved for implementation.
- `Implemented`: delivered and verified against the accepted requirements.
- `Superseded`: replaced by another identified PRD or decision.

Only explicit developer approval moves a PRD from `Draft` to `Accepted`. Code alone
does not change a PRD's status. Use `Implemented` only when the relevant code
and tests have been verified.

## Required Format

Every standalone or Work Unit PRD follows the sections in
[TEMPLATE.md](TEMPLATE.md), in this order:

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
14. Outstanding Questions

The Purpose section is mandatory. Other sections must remain present. Write
`Not applicable` with a short reason when a section does not apply.

Use a decision table when behavior changes by actor, permission, state, or
context. A decision table is required for authorization decisions.

## Requirements

Give every normative requirement a stable identifier based on its PRD:

```text
M0001-R001
M0001-01-R001
I0002-R001
I0003-R001
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
- an inter-module workflow PRD owns behavior that uses module data, including
  cross-module sequencing, retry, and failure recovery.

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

### Independently Delivered Work Units

For a module delivered in Work Units, the parent document is a mini roadmap.
It defines the scope, lists the work in its planned order, and tracks each
WU's implementation status.

```text
modules/
|-- M0001-admin-tenancy.md
`-- M0001-admin-tenancy/
    |-- M0001-00-admin-database-foundation.md
    |-- M0001-01-tenant-and-portal-user-access.md
    `-- M0001-02-root-user-provisioning.md
```

The mini roadmap contains:

- The work included in the module and the work delivered elsewhere.
- The planned start order and prerequisites that affect that order.
- Each Work Unit's deliverable and link to its PRD.
- Each WU's status, blocker when applicable, and completion evidence.

Use `Not started`, `In progress`, `Blocked`, and `Complete` for implementation
status. Update a WU when work starts, a blocker changes, or its accepted
requirements have been verified. Record the blocker for `Blocked` and the
verification evidence for `Complete`.

Keep architecture descriptions and detailed requirements in their owning
documents. The mini roadmap is exempt from the 14-section PRD template.
The project roadmap tracks overall delivery; the mini roadmap tracks the
module's individual Work Units.

Each Work Unit PRD follows the full template and has its own acceptance status.
Each PRD must be implementable as a single atomic unit. If it cannot be, split
it into multiple Work Unit PRDs that each can.
A `Draft` PRD is not permission to implement its requirements. Use stable
identifiers such as `M0001-01` and `M0001-01-R001`; record delivery order
separately so reordering work does not rename its PRDs.

Number a module's Work Units from `-01`. M0001 predates this rule and starts at
`M0001-00`; its identifiers stay as they are.

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
