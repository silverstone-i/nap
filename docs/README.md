# NAP documentation

This directory contains the base documentation for building NAP. Each document
has one purpose; documents link to one another instead of restating the same
rules.

## Documentation contract

There is no single linear hierarchy in which every document answers every
question. Authority is divided by purpose:

| Document | Sole purpose | Authority |
| --- | --- | --- |
| [`PRD 0000`](PRDs/0000-nap-platform-architecture.md) | Current platform requirements and architectural guardrails | Current architecture source of truth |
| Component PRDs | Current behavior, data, API, and acceptance criteria for one functional component | Current component source of truth |
| [`PROJECT-STRUCTURE.md`](architecture/PROJECT-STRUCTURE.md) | Current repository layout, import boundaries, module ownership, and deployment mapping | Current structural source of truth |
| [`ADRs`](ADRs/INDEX.md) | Why a decision was made, alternatives, consequences, and supersession history | Decision record |
| [`RULES`](RULES/) | Exact implementation or documentation conventions for a defined scope | Current local implementation rules |
| [`DEVELOPMENT-ROADMAP.md`](roadmaps/DEVELOPMENT-ROADMAP.md) | Build order, dependencies, and phase gates | Planning only |
| [`reference/`](reference/) | Inputs used while preparing PRDs and migrations | Non-authoritative |
| [`CLAUDE.md`](../CLAUDE.md) | Contributor and coding-agent entry point | Navigation and repository operations only |

Documents with different purposes must agree. None may silently override
another document's scope.

## Reading order

Before planning or implementing work:

1. Read PRD 0000 for the platform requirements that apply everywhere.
2. Read `PROJECT-STRUCTURE.md` for code and document placement.
3. Read the relevant component PRD.
4. Read `ADRs/INDEX.md`, then every ADR related to the work.
5. Read every RULES file governing the files being changed.
6. Consult the roadmap only for sequencing and dependency context.
7. Consult reference material only as input; never treat it as a decision.

If the component PRD does not exist, writing and accepting it is the first
implementation step.

## Change workflow

An architectural decision is incomplete until all affected current documents
are updated in the same change:

```text
accept or supersede an ADR
          │
          ▼
update every affected PRD requirement
          │
          ├──► update PROJECT-STRUCTURE if ownership or layout changed
          ├──► update applicable RULES if implementation changed
          ├──► update ADR index and cross-references
          └──► update roadmap only if sequencing changed
```

A RULES change that alters externally observable behavior or architecture also
requires the affected PRD and, when architectural, an ADR. A pull request must
not leave PRDs, structure, ADR status, and RULES inconsistent.

## Duplication policy

- A requirement is written once in its owning PRD and given a stable ID.
- ADRs reference requirement IDs and explain rationale; they do not restate the
  complete requirement set.
- `PROJECT-STRUCTURE.md` maps requirement IDs to folders and ownership; it does
  not redefine the requirements.
- RULES reference requirement IDs and specify the coding pattern that satisfies
  them.
- The roadmap references requirement IDs and module ownership rather than
  copying requirements or table inventories.
- `CLAUDE.md` links to authoritative documents rather than summarizing them.
- Reference material may overlap historical inputs because it is explicitly
  non-authoritative; current PRDs and migrations own implemented details.

Document locations and the complete repository skeleton are defined once in
[`PROJECT-STRUCTURE.md`](architecture/PROJECT-STRUCTURE.md).
