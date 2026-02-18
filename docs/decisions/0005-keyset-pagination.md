# 0005. Keyset Pagination over Offset-Based Pagination

**Date:** 2025-02-17
**Status:** accepted
**Author:** NapSoft

## Context

NAP's list endpoints return potentially large result sets (invoices, journal entries, SKU catalogs) that must be paginated. The two standard approaches are offset-based (`LIMIT x OFFSET y`) and keyset-based (also called cursor-based: `WHERE id > :lastSeen ORDER BY id LIMIT x`). NAP is a multi-user ERP where records are frequently inserted and archived concurrently, meaning the dataset shifts between page requests.

## Decision

All list endpoints use keyset pagination via pg-schemata's `findAfterCursor()` method. Clients provide:

- `cursor` — the last seen ID or composite sort value from the previous page
- `limit` — page size
- `orderBy` — sort column(s)
- `columnWhitelist` — optional restriction on returned columns

The API returns the result set plus the cursor value for the next page. First-page requests omit the cursor parameter.

## Alternatives Considered

| Alternative | Pros | Cons |
|---|---|---|
| Offset-based (`LIMIT/OFFSET`) | Simple to implement; page number navigation possible; widely understood | Performance degrades linearly with offset (database must scan and discard rows); concurrent inserts/deletes cause skipped or duplicated rows between pages |
| Hybrid (offset for small sets, keyset for large) | Flexibility per endpoint | Inconsistent API contract; two pagination implementations to maintain; client must handle both patterns |

## Consequences

**Positive:**
- Stable performance at any depth — the database seeks directly to the cursor position using an index, regardless of how deep into the result set the client has paginated
- No skipped or duplicated rows — concurrent inserts and deletes do not shift page boundaries because pagination is anchored to a specific row, not a numeric offset
- Consistent API contract — all list endpoints use the same cursor-based pattern

**Negative:**
- No arbitrary page jumping — clients cannot request "page 47" directly; they must traverse sequentially (acceptable for NAP's data grid use case with infinite scroll)
- Compound sort keys (e.g., `created_at` + `id`) require careful cursor encoding
- Slightly more complex client logic compared to simple page numbers
