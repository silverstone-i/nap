# 0015 — Operator bootstrap and Tenant Management

- **Status:** Accepted
- **Date:** 2026-09-13
- **Requirements:** ARCH-022, ARCH-023, ARCH-028, ARCH-040, ARCH-047, ARCH-050

## Decision

Complete greenfield operator bootstrap automatically on the first successfully
provisioned available cell in DEV and PROD. Initial root creation records durable
intent; cell completion atomically claims the selected cell. The existing worker
projects the operator tenant and root binding, seeds roles, proves readiness and
isolation, and completes bootstrap. Preserve root credentials and its no-employee
exception. Assignment is immutable across retries. Failures leave the cell available
and expose root-only retry. Existing installations are not enrolled and normal
bootstrap reruns change no existing records. Explicit password recovery remains.

Tenant Management owns all former control-page functions through Tenants, Cells,
Portal users, Platform access, Access and Audit. Permissions remain independent;
access-only operators need no overview grant. Legacy URLs redirect. Replace manual
root reconciliation with bootstrap status/retry in the operator tenant context.

## Consequences

This supersedes PRD 0004's manual root reconciliation policy and extends ADR 0014's
worker lifecycle. The platform specification owns bootstrap invariants; PRDs 0004
and 0009 own commands and presentation. Cell success and bootstrap success are
separate durable outcomes. No upgrade backfill or existing assignment inference.
