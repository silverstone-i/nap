# Project workflow and cost architecture reference

**Date:** 2026-09-05

**Status:** Non-authoritative planning input for subsequent component PRDs.

The [platform specification](../specs/nap-platform-specification.md#module-ownership-map)
owns module boundaries. Its `ARCH-041`, `ARCH-046`, and `ARCH-047` requirements
govern this discussion; [ADR 0001](../ADRs/0001-project-workflow-module-boundaries.md)
records the amendment rationale. This reference preserves the workflow examples
and design questions from the module restructuring discussion. It defines no
tables, APIs, accepted state machine, or implemented behavior.

## Workflow from definition to production

An estimate template describes repeatable scope: a house plan in construction,
a project type in consulting, or a product-related project in manufacturing.
A project-specific estimate adapts that template, gathers cost inputs, obtains
bids, and proceeds through approval before release to production.

The working sequence is:

1. Define scope using catalog materials/assemblies and turnkey or lump-sum inputs.
2. Organize costs for bidding and execution using shared cost codes.
3. Obtain vendor or internal bids, clarify scope, compare revisions, and select bids.
4. Approve the estimate and preserve the version authorized for release.
5. Release against a specific project or Project Component and establish its
   approved production cost baseline.
6. Schedule work, issue purchase orders, record acceptance and invoices, and
   compare commitments, actuals, and forecasts against the approved baseline.

These are workflow stages, not a finalized list of database statuses. Draft,
out for bid, accepted, and rejected are useful starting examples for PRD work.
Release need not create the project itself: Projects can already provide the
structure to which estimates and production records refer.

## Cost-code axes: definitions and usage

Cost categories describe the kind of work or cost, such as Electrical, Plumbing,
Framing, or HVAC. Activity definitions describe what happens, such as Rough-in,
Install, Frame First Floor, or Inspect. A cost code identifies a valid combination
of category and activity; not every possible pair must be meaningful.

| View                 | Example                                      | Purpose                                                  |
| -------------------- | -------------------------------------------- | -------------------------------------------------------- |
| Category / noun      | Electrical                                   | Group scope for vendor bidding and cost analysis         |
| Activity / verb      | Rough-in                                     | Define a repeatable kind of work                         |
| Combined cost code   | Electrical × Rough-in                        | Connect estimated, scheduled, committed, and actual work |
| Scheduled occurrence | Unit 37 electrical rough-in on October 12–15 | Place that work in a project's schedule                  |

A definition and its use have different lifecycles. Repeating an activity across
many units does not create a new shared activity definition for each unit.
Material/labor treatment is a separate concern whose exact representation remains
for component design; it should not be silently substituted for either axis.

## Catalog, BOM, and turnkey inputs

A BOM assembly describes material composition and quantities, including nested
assemblies. A first-floor framing package could include studs, joists, sheathing,
and fasteners. Its components refer to catalog items. A catalog can exist without
assemblies; the assemblies cannot exist without their catalog. This dependency
motivated combining the former Catalog and BOM owners.

A turnkey input is a fixed-price commercial scope. It may cover material and
labor together, material alone, or labor alone. Examples include electrical
fixtures plus installation, fixtures only, or framing labor only. A BOM can
supply the material basis for an estimate scope, but it does not describe that
scope's labor or commercial obligations.

Estimating needs to preserve material/labor breakdowns where the business or
applicable reporting requirements call for them. Exact allocation, pricing,
rounding, substitution, and version rules belong in the relevant PRDs.

## Bidding and estimate approval

Several vendors should be able to bid on the same trade package. Planning needs
include vendor questions, responses, revised bids, comparison, acceptance of a
selected bid, and rejection of alternatives. Internal responsible parties can
also provide cost commitments during estimating.

The estimate combines those inputs without collapsing vendor-specific proposals
into a single mutable price. PRDs must settle bid visibility, revision history,
selection rules, approval permissions, and how a selected bid later informs a PO.
An accepted bid is not itself a paid invoice.

## Release and production cost tracking

The release boundary separates the estimate that was authorized from the costs
that follow during execution. Subsequent POs, invoices, or site changes should
not rewrite that approved estimating history.

For illustration, an approved framing baseline might be $100,000, with $92,000
committed through POs, $45,000 invoiced, and a $103,000 forecast. Those are distinct
measures. Invoiced and paid amounts also represent different states; the example
does not define which measure a report calls actual cost.

Project Costs needs source references and reconciliation rather than duplicate
purchase-order or invoice ownership. Baseline creation, later approved changes,
replays, partial failures, and commitment-to-actual transitions need explicit
contracts so a PO and its invoice are not counted as two independent costs.
The baseline handoff should preserve the approved source version and provenance.

## Project structure and scheduling

A project can contain one home, a development of homes and townhomes, several
apartment buildings, or mixed residential and commercial work. The existing
recursive Project Component model accommodates buildings, units, floors, and
other tenant-configured work units without adding industry-specific owners.

Each work unit may have a schedule. Scheduled activities include first-, second-,
and third-floor framing, roofing, sheathing, and separate mechanical, electrical,
and plumbing work. Pre-construction meetings and inspections can gate later work.
Dependencies, operational milestones, deliverables, and completion belong in the
scheduling design, using the shared activity definitions.

Contractual milestone state remains distinct from operational completion. A
schedule event can supply evidence for a contractual milestone or financial
approval, but it does not by itself mean that an invoice is approved or a vendor
payment is authorized. `ARCH-046` governs the consumer-owned downstream decision.

## Operational and contractual changes

A site condition may require additional work on a unit, approved by a project
manager. A customer may request an enclosed porch that changes the binding
agreement. The first is operational change control; the second requires the
contractual change process. Exact approval authority remains PRD work.

Both can lead to an approved project cost adjustment and one or more additional
POs. A/P owns those POs. Project Costs tracks their financial impact, while the
originating operational or contractual record preserves why the change occurred
and how it was approved. Linked changes do not merge these records' ownership.

## Purchase orders, acceptance, and payment

The vendor-side workflow under discussion is PO → receipt or work acceptance →
vendor invoice → approval → payment. A/P owns the PO and payable transaction
lifecycle. Project Costs consumes the commitment and actual-cost references for
project analysis; it does not become a second purchasing ledger.

On the client side, a milestone can lead to a request for payment and an approval
process before an A/R invoice is sent. Vendor work acceptance can similarly feed
payment approval. Scheduling completion, contractual entitlement, invoice
approval, and settlement remain separate decisions. Exact acceptance-record
placement, matching rules, event payloads, and accounting recognition require
component PRDs; this reference does not settle them.

## Generality and remaining component design

Construction supplies the concrete examples. Consulting can reuse templates,
cost classification, bidding, project structure, and scheduling where its
requirements fit. Manufacturing may require specialized production behavior;
there is no decision here to force it into construction schedules or introduce
an industry abstraction before that need is established.

A user-facing Projects area can compose budgets, schedules, POs, changes, and
actual costs across several module owners. Navigation does not decide who owns
the underlying records.

Before implementation, component PRDs must resolve the exact schemas, workflow
states, permissions, approval rules, event and release contracts, historical
versioning, reconciliation, and accounting treatment. The
[roadmap](../roadmaps/DEVELOPMENT-ROADMAP.md) records dependencies and implementation
status. The older initial-table-schema reference remains historical planning
input, not an alternative ownership map.
