# ADR-0004: Three-Level RBAC

**Status:** Superseded by ADR-0013

**Date:** 2025-02-11

## Context

NAP requires role-based access control to restrict what users
can do within their tenant. The initial design used three
permission levels: none, view, and full.

## Decision

Adopted a three-level RBAC model where policies map
(role, module, router, action) to a permission level of
none, view, or full.

## Consequences

- Simple to implement and reason about.
- Insufficient for row-level filtering (which projects a
  user can see) and column-level restrictions. Superseded
  by ADR-0013 which adds data scope, state filters, and
  field groups as additional layers.
