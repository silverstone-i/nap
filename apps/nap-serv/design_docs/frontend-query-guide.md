# Frontend Query Parameter Guide

This guide explains how to use query parameters when calling API endpoints for list and search operations from the frontend.

---

## ✅ Common Parameters

| Parameter           | Example                          | Description |
|---------------------|----------------------------------|-------------|
| `limit`             | `limit=50`                       | Max number of records to fetch |
| `offset`            | `offset=100`                     | Skip first N records (used in paged views) |
| `orderBy`           | `orderBy=created_at` or `orderBy=["status","created_at"]` | Columns to sort by |
| `columnWhitelist`   | `columnWhitelist=id,name,status` | Limit response to specified columns |
| `includeDeactivated`| `includeDeactivated=true`        | Include archived/inactive rows |

---

## 🧭 Cursor Pagination (`GET /api/{resource}`)

Use when displaying long lists or infinite scrolling.

```http
GET /api/tasks?limit=50&cursor.id=123&orderBy=id
```

- Use `cursor.{field}` to fetch records **after** a known value
- Must match a column used in `orderBy`

Optional filters:
```http
GET /api/tasks?status=active&assigned_to=ian
```

---

## 🔍 Condition-Based Filtering (`GET /api/{resource}/where`)

Use for complex filters and data tables with paging.

```http
GET /api/tasks/where?limit=25&offset=0&orderBy=created_at
```

### Advanced Example with conditions
```http
GET /api/tasks/where?conditions=[{"$or":[{"status":"active"},{"region":"west"}]}]
```

### Combine with filters
```http
GET /api/tasks/where?region=west&priority=high
```

---

## 📦 Archived Records (`GET /api/{resource}/archived`)

Same as `/where` but filters only archived (soft-deleted) data.

```http
GET /api/tasks/archived?limit=100&orderBy=deleted_at
```

---

## 🔐 Notes for Developers

- Use `encodeURIComponent()` when building URLs with `conditions`
- Avoid combining `cursor.*` with `offset` in the same request
- Use `getWhere` for bulk exports or advanced admin search
- Use `get` for scrollable performance-critical views

