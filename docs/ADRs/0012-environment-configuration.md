# 0012 — Environment configuration

- **Status:** Accepted
- **Date:** 2026-09-12
- **Requirements:** ARCH-008, ARCH-009, ARCH-019, ARCH-025

## Decision

Use Development (with isolated TEST), Production, and Common configuration
sections. Construct connections from credential-free endpoints and fixed role
names. Share each role password within a local PostgreSQL instance; use distinct
role passwords per production database environment. Keep each production cell's
endpoint and credentials in one UUID-keyed entry. API deployments omit maintenance
passwords. The specification's Environment configuration section owns the contract.

## Rationale and consequences

Endpoint and credential components avoid repeating full connection strings.
Grouping production credentials with their cell removes a second UUID lookup map.
Independent production passwords limit compromise and require per-database rotation.
Local roles are instance-wide, so DEV and TEST require separate instances when their
passwords differ. Existing commands gain explicit UUID configuration selection;
registry and physical identity verification remain separate delivery work.

This supersedes complete-URL configuration described with ADR 0011 without
changing its API topology, pool lifecycle, or tenant dispatch decision.
