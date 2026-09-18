# M0001-12: Administrative Events

## 1. Document Control

| Field                | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status               | Draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Type                 | Module work unit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Family               | [M0001: Admin Tenancy](../M0001-admin-tenancy.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Owner                | To be confirmed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Related architecture | [Admin and cells](../../../architecture/admin-cells.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Related PRDs         | [M0001-01: Tenant and Portal-User Foundation](M0001-01-tenant-and-portal-user-foundation.md), [M0001-02: Root-User Provisioning](M0001-02-root-user-provisioning.md), [M0001-03: Authentication](M0001-03-authentication.md), [M0001-04: Session Management](M0001-04-session-management.md), [M0001-05: Authorization](M0001-05-authorization.md), [M0001-06: Cell Management](M0001-06-cell-management.md), [M0001-07: Tenant Creation](M0001-07-tenant-creation.md), [M0001-08: Portal-User and Membership Administration](M0001-08-portal-user-and-membership-administration.md), [M0001-09: Tenant Selection and Support Access](M0001-09-tenant-selection-and-support-access.md), [M0001-10: Module Entitlements](M0001-10-module-entitlements.md), [M0001-11: Cache Consistency](M0001-11-cache-consistency.md) |
| Related decisions    | None recorded separately; unresolved decisions are in section 14                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Last reviewed        | 2026-09-18                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 2. Purpose

Record the required administrative actions from units 1–11 in an append-only
central event history that operators can use to establish what happened.

## 3. Scope

### Included

- The central administrative event catalogue and payload contract.
- Append-only `admin.managed_events` storage and authorized reads.
- Event recording at the originating admin operations.

### Excluded

- Cell-local audit events owned by cell modules.
- General request logs, metrics, and arbitrary database-query logging.
- Using audit events as a replacement for provisioning or cache state.

## 4. Actors And Permissions

| Context                            | Actor                            | Required authority or condition              | Result                          |
| ---------------------------------- | -------------------------------- | -------------------------------------------- | ------------------------------- |
| Append event                       | Authorized originating operation | Event matches the agreed catalogue           | Append validated event          |
| Read administrative history        | Operator                         | Explicit event-read capability and scope     | Return permitted records        |
| Edit or delete through runtime API | Any portal user                  | Stored event is append-only                  | Reject                          |
| Attribute support action           | Originating operation            | Real and effective actor context from unit 9 | Preserve real-actor attribution |

Retention/purge authority and event-read capabilities remain open in Q02–Q03;
append-only runtime behavior does not settle the retention period.

## 5. Concepts And Terminology

| Term                  | Meaning                                                                       |
| --------------------- | ----------------------------------------------------------------------------- |
| Managed event         | Structured record of an administrative action under this catalogue            |
| Event catalogue       | Defined action categories and their required recording contract               |
| Append-only           | Existing events cannot be edited or deleted through normal runtime operations |
| Originating operation | The action responsible for both the business result and its event             |

## 6. Functional Requirements

- M0001-12-R001: The module must define and record the applicable administrative action categories in the catalogue below.
- M0001-12-R002: Events must be stored in `admin.managed_events` through a validated append interface.
- M0001-12-R003: Normal runtime operations must not update or delete existing events.
- M0001-12-R004: Authorized operators must be able to inspect events within their permitted scope.

| Source unit              | Required action category                                                                  | Contract to finalize                                               |
| ------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1: Foundation            | Foundational record creation/change performed by an originating admin operation           | Attribution to units 2, 7, or 8 without duplicate low-level events |
| 2: Root provisioning     | Bootstrap establishment, repeat result, and failure                                       | Non-session operator attribution                                   |
| 3: Authentication        | Login outcome, required password change, and throttle enforcement                         | Disclosure, volume, and outcome detail                             |
| 4: Sessions              | Session creation, rotation, expiry, and revocation                                        | Detection/recording of time-driven expiry                          |
| 5: Authorization         | System-role initialization or controlled release change; platform grant/removal           | Role identity and permitted change detail                          |
| 6: Cells                 | Registration, retry, disable, and provisioning progress/failure/result                    | Operation correlation and progress granularity                     |
| 7: Tenants               | Central tenant creation outcome                                                           | Tenant identity and creation result                                |
| 8: Users and memberships | Identity/membership maintenance and provisioning-job outcomes                             | Subject identity and allowed change detail                         |
| 9: Selection and support | Tenant selection, support/impersonation entry and exit, and actions taken in that context | Real/effective actor attribution                                   |
| 10: Entitlements         | Module grant or withdrawal                                                                | Tenant/module and change result                                    |
| 11: Cache consistency    | Central invalidation changes and failures                                                 | Scope, revision, and event-volume rules                            |

This is the required category coverage. Exact event keys, success/failure/denial
variants, payload fields, and recording frequency are acceptance decisions in
Q01.

## 7. Business Rules And Invariants

- M0001-12-R005: Recorded events must preserve the originating action's attribution and outcome without claiming success for a failed action.
- M0001-12-R006: Support or impersonation events must retain the real actor even when an effective actor is present.
- M0001-12-R007: Events must not contain passwords, credential verifiers, session secrets, or database connection secrets.

Whether event insertion shares the source transaction, uses reliable deferred
delivery, or fails the action is open in Q04. Append-only does not by itself
provide cryptographic tamper evidence or exactly-once delivery.

## 8. Lifecycle And State Transitions

| Situation                                       | Result                                                  |
| ----------------------------------------------- | ------------------------------------------------------- |
| Originating action reaches a recordable outcome | Validate and append its event under Q04                 |
| Existing event                                  | Read through an authorized interface                    |
| Runtime edit or delete request                  | Reject                                                  |
| Delivery or action retry                        | Follow the agreed event identity/deduplication contract |
| Retention boundary reached                      | Apply separately approved retention rules               |

## 9. Data Requirements

| Table                  | Required meaning                                                                                                                   | Access and sensitivity                                                            |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `admin.managed_events` | Event identity, catalogue action, attribution, target/context, outcome, and occurrence information under the agreed payload schema | Append; authorized investigation by agreed filters; sensitive operational history |

Exact columns, timestamp semantics, actor representation, tenant scope,
correlation keys, indexes, payload limits, and retention remain open in Q01–Q03.
Events need sufficient retained identity to remain meaningful if source records
later change; the preservation mechanism is a Q02 decision.

## 10. API Requirements

| Operation            | Input                                                    | Result                                              |
| -------------------- | -------------------------------------------------------- | --------------------------------------------------- |
| Append managed event | Trusted originating operation and approved event payload | Stored event identity or agreed persistence failure |
| Read history         | Authorized actor, scope, and approved filters            | Permitted event page                                |

No event-edit or runtime-delete API exists. HTTP exposure, read filters,
pagination, redaction, error schemas, and append retry behavior remain open in
Q03–Q04. Application operations use this contract at their own event points.

## 11. Cross-Module Interactions

Units 1–11 reference this catalogue and implement the events applicable to their
operations. Define it before completing those units; a working event table
alone does not verify that the required actions are recorded.

Cell-local audit belongs to the receiving module and its own roadmap acceptance.
Central event persistence does not establish that an action completed in a cell.

## 12. Security And Audit

Read access is scoped separately from ordinary tenant membership. The event
payload and read response both follow M0001-12-R007. [M0001-09: Tenant Selection and Support Access](M0001-09-tenant-selection-and-support-access.md) supplies attribution
for support activity; bootstrap requires a non-session actor contract.

Which denied attempts are recorded, how failure detail is redacted, and how
operators handle event-storage failures are decisions in Q01 and Q04.

## 13. Acceptance Criteria

| Criterion | Required result                                                                                       | Requirements  |
| --------- | ----------------------------------------------------------------------------------------------------- | ------------- |
| AC01      | Each catalogue category has an agreed event definition and is exercised at its originating operation. | M0001-12-R001 |
| AC02      | Valid events append; invalid payloads follow the agreed rejection contract.                           | M0001-12-R002 |
| AC03      | Runtime event edits and deletes are rejected.                                                         | M0001-12-R003 |
| AC04      | Authorized reads return only permitted events; out-of-scope reads fail.                               | M0001-12-R004 |
| AC05      | Recorded outcomes match action results, including the chosen failure and retry cases.                 | M0001-12-R005 |
| AC06      | Support events retain the real actor and any effective actor.                                         | M0001-12-R006 |
| AC07      | No event payload or read response exposes prohibited secrets.                                         | M0001-12-R007 |

Delivery-failure and duplicate-event tests use the explicit Q04 guarantees.

## 14. Open Questions

| ID  | Decision required before acceptance                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Q01 | What exact event keys, payload fields, outcome variants, redaction rules, and recording frequency apply to each catalogue category? |
| Q02 | What immutable identity, timestamp, attribution, correlation, source-deletion, retention, and purge contracts apply?                |
| Q03 | Who can read which events, through which API, with what filters and pagination?                                                     |
| Q04 | How are action/event atomicity, persistence failures, retries, deduplication, and delivery guarantees handled?                      |
