# RULES — PRD format

Governs `docs/PRDs/`. Every new PRD follows this format. PRDs written before
this document may predate parts of it and must adopt the format when materially
revised.

## Scope of a PRD

- One PRD per functional component of a module, not per module. The
  Auth module's components are Authentication, RBAC, Platform
  administration, and Licensing and entitlements — four PRDs, not one.
- The component-to-module map lives in
  [architecture/PROJECT-STRUCTURE.md](../architecture/PROJECT-STRUCTURE.md). Doc modules
  and code modules differ: each PRD names the code module that owns
  every table and router it defines.
- Filenames are `NNNN-kebab-case-title.md`, numbered sequentially with
  four digits.

## Structure

Header: H1 `# PRD NNNN — Title`, then `**Status:**`, `**Date:**`, and
`**Related:**` bullets linking the governing ADRs and RULES docs.

Sections, in order (omit a section only when it is genuinely empty):

1. `## Overview` — what the component does and why it exists.
2. `## Users and scenarios` — the actors, each with a scenario tying
   them to the requirements.
3. `## Data tables` — one column/type/notes table per database table,
   grouped under H3s. Audit columns are omitted and said to be.
4. `## API` — a method/path/description table per router. List every endpoint
   required by the component. A custom action's row states its transition, its
   gate, and what it records.
5. `## Business rules` — the behavioral requirements, individually
   testable as written.
6. `## Out of scope` — what this PRD deliberately does not cover, each
   item naming where it is covered instead.
7. `## Success criteria` — the load-bearing rules restated as
   observable assertions.
8. `## Revisions` — see below.

## Writing rules

- Requirements are testable declarative statements, not aspirations.
- Requirements that are referenced outside their owning PRD use stable IDs.
  PRD 0000 uses `ARCH-NNN`; another PRD defines a short, unique component
  prefix when it needs externally referenced requirements.
- Permissions are written `module::router::action`, mapping one-to-one to the
  RBAC cell triple.
- Decisions live in ADRs. A PRD states the behavior and cites the ADR;
  it never restates rationale or alternatives.
- A requirement is written in one PRD only. ADRs, RULES, structure documents,
  and roadmaps link to its stable ID instead of restating it.
- RULES define implementation conventions. If a RULES change alters required
  behavior, update the owning PRD in the same change; add or supersede an ADR
  when the change is architectural.
- Open questions are stated as open, never silently decided. A PRD
  with no open questions omits the section.

## Living document

- PRDs change as the architecture evolves. Every meaningful change
  appends a `## Revisions` entry: date, one line on what changed, and
  a link to the driving ADR when the change reverses or supersedes a
  decision.
- A change that reverses an accepted decision requires the new ADR
  first; the PRD edit cites it.
