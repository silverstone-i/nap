# 0007 — Shared-origin cell routing

- **Status:** Accepted
- **Date:** 2026-09-08
- **Requirements:** `ARCH-005`, `ARCH-007`, `ARCH-009`, `ARCH-010`, `ARCH-022`, `ARCH-028`, `ARCH-050`

## Context

The owner authorized the Cell tenancy and provisioning implementation plan.
One-cell authentication filtered memberships by the receiving deployment, which
cannot support a stable origin and cross-cell tenant selection.

## Decision

Use the existing API artifact in an admin-only router mode, with Node HTTP(S)
forwarding to deployment-configured private origins. Central authentication and
selection run locally; tenant data and cell-writing operator commands go to the
assigned cell. Each cell independently verifies central authority and permits
tenant data only for its configured assignment. The specification's shared-origin
routing contract owns transport limits, trust and lifecycle details.

This supersedes ADR 0006's one-cell selection limitation only. Its platform
permissions, audit, ownership and root exception remain unchanged.

## Alternatives and consequences

Giving one API multiple cell database pools violates ARCH-009. Selecting a cell
in a customer URL violates ARCH-007. Routing all central requests through a
single cell couples login to that cell's outage. An admin-only mode retains
factory-generated routes and needs no proxy package. Operations must configure
private origins and restrict direct backend access. Central availability is a
shared dependency; individual cell outages do not stop central account operations.
