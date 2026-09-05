# NAP documentation

Each document has one job. Documents link to an owning requirement or decision
instead of copying it.

## Documentation contract

Authority depends on the question:

| Document                                                    | Purpose                                                                                                                                 | Authority                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [`Specification`](specs/nap-platform-specification.md)      | Platform requirements and architectural guardrails, plus repository layout, import boundaries, module ownership, and deployment mapping | Governing platform requirements and structure |
| Component PRDs                                              | Accepted behavior, data, API, UI, and acceptance criteria for a component                                                               | Intended component design                     |
| [`ADRs`](ADRs/)                                             | Decisions, rationale, alternatives, consequences, and supersession history                                                              | Immutable decision record                     |
| [`RULES`](RULES/)                                           | Shared implementation, delivery, operational, and documentation conventions                                                             | Current convention                            |
| [`DEVELOPMENT-ROADMAP.md`](roadmaps/DEVELOPMENT-ROADMAP.md) | Integrated capability order, dependencies, status, and delivery gaps                                                                    | Current implementation-status record          |
| `implementation-plans/`                                     | Conditional coordination for multi-PR, security-sensitive, migration, or staged delivery                                                | Non-authoritative delivery record             |
| Merged code and migrations                                  | Behavior and schema that are actually present                                                                                           | Implemented state                             |
| Automated tests                                             | Evidence that implementation satisfies accepted contracts                                                                               | Verification evidence                         |
| [`branding/`](branding/)                                    | Brand tokens, typography, visual rules, and assets                                                                                      | Current brand design                          |
| [`reference/`](reference/)                                  | Planning inputs used to prepare PRDs and migrations                                                                                     | Non-authoritative                             |
| [`CLAUDE.md`](../CLAUDE.md)                                 | Contributor and coding-agent entry point                                                                                                | Repository navigation and operations only     |

Accepted design governs work that has not merged. Merged code and migrations
describe what the system actually does. Those states must converge: an
unintended difference is a defect, while an intentional difference requires
the owning PRD, ADR, RULES, and roadmap records to be updated through the
[change workflow](#change-workflow) below.

## Status model

PRDs and roadmap capabilities track two independent states:

| Dimension      | Values                                                  |
| -------------- | ------------------------------------------------------- |
| Design         | `Draft`, `Under review`, `Accepted`, `Superseded`       |
| Implementation | `Not started`, `In progress`, `Implemented`, `Verified` |

An accepted design can remain unimplemented without being mistaken for current
code. `Verified` requires passing evidence and final documentation
reconciliation.

## Reading order

Before designing or implementing work:

1. Read the platform specification for platform-wide requirements, defined
   terms, code placement, module ownership, and import boundaries.
2. Read the relevant component PRD.
3. Read the [ADR index](ADRs/INDEX.md), then every applicable ADR.
4. Read every applicable RULES document. None exists yet: until a subject has
   its own RULES file, the specification section that owns it governs —
   [operational standards](specs/nap-platform-specification.md#operational-standards)
   for runtime work, and [CLAUDE.md](../CLAUDE.md#commit-and-release-operations)
   for repository and release work.
5. Consult the development roadmap for dependencies, status, and planned PRs.
6. When the delivery-workflow triggers apply, create or update the capability
   implementation plan as the first step of implementation.
7. Consult reference material only as input.

If the component PRD does not exist, design and accept it before implementation.
The workflow is defined in [Change workflow](#change-workflow) below, and the
triggers requiring an implementation plan are defined in
[Specification — Documentation placement](specs/nap-platform-specification.md#documentation-placement).

## Change workflow

An architectural change is complete only when the owning current documents
agree:

```text
amend the specification
       |
       v
record the decision and its rationale in an ADR
       |
       v
update affected component PRDs
       |
       +--> update applicable RULES when conventions change
       +--> update the ADR index and cross-references
       +--> update the roadmap when sequencing or status changes
       |
       v
implement and test one-concept PRs
       |
       v
reconcile current documents with merged code and mark Verified
```

The specification is amended first. A PRD, an ADR, or an implementation that
needs something the specification does not permit stops there: the conflict is
raised and resolved with the owner before either document changes.

Accepted ADR rationale is not rewritten. A changed decision receives a new ADR
that supersedes the old one, and both records link the supersession.

## Duplication policy

- A requirement is written once in its owning PRD and receives a stable ID
  when another document needs to reference it.
- ADRs explain the decision and rationale without copying the full requirement
  set.
- The specification's repository-structure sections place each requirement in
  folders, layers, and module owners beside the requirement itself, so no
  second document restates it.
- RULES define reusable conventions and reference the requirements they
  implement.
- The roadmap references accepted documents and records sequencing, status,
  implementation slices, evidence, and gaps.
- Required implementation plans follow the format in
  [Specification — Documentation placement](specs/nap-platform-specification.md#documentation-placement)
  and retain coordination detail without becoming architecture, status, or CI
  authority.
- [`BRAND.md`](branding/BRAND.md) owns brand values and visual specifications;
  code and RULES link to it.
- `.licenses-allowed.json` owns the allowed production licenses; every other
  document links to it and transcribes no entry.
- Reference documents may overlap historical planning inputs because they are
  explicitly non-authoritative.

Document locations and the repository skeleton are defined in
[Specification — Repository structure](specs/nap-platform-specification.md#repository-structure).
