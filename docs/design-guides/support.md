# Support access

Napsoft staff support customer tenants through their roles alone. There is no
support mode. Tickets, consent, and impersonation are business rules of the
support module, which is not built yet. This guide records the agreed design so
that module can be built to it.

## Capabilities this guide relies on

This guide assumes the planned four-part capability model below. It differs
from the current M0003 and I0005, which use `module::router::action`; those PRDs
will be rewritten to this model.

Role-based access control (RBAC) checks every request against a capability in
`TENANT::module::router::action` form:

- `TENANT` is the target tenant's uppercase `tenant_code`, for example `ACME`.
  Napsoft's code comes from `ROOT_TENANT_CODE_<ENV>` and is `NAP`.
- A role pattern can use `*` in any part. A tenant `*` never includes the
  Napsoft tenant (`is_napsoft = true`); reaching Napsoft requires naming `NAP`.
- Read-only routes use the action `read`, and no route that changes data uses it.
- A user's role always comes from the cell of the user's own tenant. Napsoft
  staff roles come from the Napsoft cell, whichever tenant they work in.

## Staff roles

Both roles are seeded into the Napsoft cell and cannot be edited.

| Role             | Grants                                                                              |
| ---------------- | ----------------------------------------------------------------------------------- |
| `platform_admin` | `*::*::*::*`, `NAP::*::*::*`                                                        |
| `support`        | `*::*::*::read`, `*::admin-tenancy::users::impersonate`, `NAP::support::tickets::*` |

The `support` module, `tickets` router, and `impersonate` action are placeholder
names until the support module exists.

## What each role may do

`platform_admin`:

- Reads every tenant, including Napsoft.
- Writes to another tenant only with a support ticket.
- Needs no client approval and no impersonation to write.
- May impersonate a user.

`support`:

- Reads every tenant except Napsoft.
- Never writes to a customer tenant, even while impersonating.
- Needs a support ticket and consent from the user or one of the tenant's
  `tenant_admin` users before impersonating.
- Escalates the ticket to a `platform_admin` when the fix needs a write.

## Impersonation

While Sam impersonates Dana, a request is allowed only if both Sam's and
Dana's capabilities allow it. For a `support` user this means reading what Dana
can read and nothing else, because `support` holds only `read` grants. A
`platform_admin` holds every customer-tenant capability, so while impersonating
it can do exactly what Dana can, writes included. Nobody gains privileges
through impersonation.

Many support calls are user errors that a short walkthrough fixes. Impersonation
lets support see the problem as the user sees it. Anything that needs a write
goes to a `platform_admin`.

## Tickets and consent

Tickets and consent are enforced by the support module, not by the capability
check. The capability says a user may provide support. The support rules say
how:

- A `support` user starting an impersonation session needs an open ticket and
  recorded consent.
- A `platform_admin` write to another tenant requires an open ticket.
- Tickets are Napsoft records, stored in the Napsoft cell.

## Support log

Each tenant's cell keeps a support log that the tenant's `tenant_admin` users
can read, for example with `ACME::support::log::read`. The log covers
impersonation sessions and direct `platform_admin` writes. Business records get
no extra column; the log is the only record of support activity.

`support_sessions` holds one row per session:

| Column               | Holds                                                         |
| -------------------- | ------------------------------------------------------------- |
| `id`                 | Support session ID                                            |
| `staff_user_id`      | Napsoft user doing the work                                   |
| `effective_user_id`  | Impersonated user; empty for a direct `platform_admin` write  |
| `ticket_ref`         | Ticket ID in the Napsoft cell                                 |
| `ticket_description` | Copy of the customer-facing ticket text only                  |
| `consent_by`         | User or `tenant_admin` who consented; empty when not required |
| `started_at`         | Session start                                                 |
| `ended_at`           | Session end                                                   |

`support_log` holds one row per write made during a session. Reads are not
logged.

| Column         | Holds                                                          |
| -------------- | -------------------------------------------------------------- |
| `session_id`   | The `support_sessions` row                                     |
| `at`           | Time of the write                                              |
| `capability`   | Capability used, for example `ACME::payables::payments::write` |
| `record_table` | Table written                                                  |
| `record_id`    | Row written                                                    |
| `action`       | Create, update, or archive                                     |
| `before`       | Row values before the write                                    |
| `after`        | Row values after the write                                     |

Copying the ticket text into the tenant's cell lets `tenant_admin` users read
the log without any lookup in the Napsoft cell. Napsoft's internal ticket notes
are never copied.
