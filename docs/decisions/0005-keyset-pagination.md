/**
 * @file ADR-0005: Keyset pagination over offset pagination
 * @module docs/decisions
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

# ADR-0005: Keyset Pagination

## Status

Accepted

## Context

List endpoints need pagination. Two primary strategies:

| Strategy | Performance at depth | Consistency | Complexity |
|---|---|---|---|
| Offset/limit (`OFFSET 5000 LIMIT 50`) | Degrades — DB scans skipped rows | Unstable — inserts shift pages | Low |
| Keyset/cursor (`WHERE id > $cursor`) | Constant — index seek | Stable — cursor is absolute | Medium |

NAP has tables (cost items, vendor SKUs, journal entry lines) that can
grow to hundreds of thousands of rows per tenant. Offset pagination
becomes progressively slower as users page deeper.

## Decision

Use **keyset (cursor-based) pagination** for all list endpoints. The
cursor is an opaque, base64-encoded value derived from the sort column(s)
plus the row's primary key.

Standard response envelope:

```json
{
  "data": [...],
  "pagination": {
    "cursor": "eyJpZCI6Ijk5OSJ9",
    "hasMore": true,
    "pageSize": 50
  }
}
```

The `cursor` value is passed as a query parameter on the next request:
`GET /api/core/v1/employees?cursor=eyJpZCI6Ijk5OSJ9&pageSize=50`

## Consequences

### Positive

- Constant-time page fetches regardless of depth — always an index seek.
- Stable pagination — concurrent inserts/deletes don't shift pages.
- Works naturally with pg-schemata's `QueryModel.find()` and `WHERE`
  clause composition.

### Negative

- Cannot jump to an arbitrary page number (no "go to page 47").
- Sort order must include a unique tiebreaker column (primary key).
- Cursor encodes sort state — changing sort order invalidates cursors.

### Mitigations

- MUI X Data Grid client-side: disable page jumping, use "load more" /
  infinite scroll pattern or next/previous navigation.
- All cursors include the primary key as a final tiebreaker.
- Cursors are short-lived (not persisted) — changing sort simply resets
  to the first page.
