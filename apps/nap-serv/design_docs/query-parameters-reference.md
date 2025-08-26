# Query Parameters Reference for BaseController Endpoints

This document describes the query string parameters supported by `get`, `getWhere`, and `getArchived` endpoints in the `BaseController`.

---

## ✅ Shared Parameters

| Param              | Type     | Description |
|--------------------|----------|-------------|
| `limit`            | number   | Max number of records to return |
| `offset`           | number   | Number of records to skip (for `getWhere`) |
| `orderBy`          | string or array | Comma-separated or JSON array of column names to sort by |
| `columnWhitelist`  | string   | Comma-separated list of columns to return |
| `includeDeactivated` | boolean | If `true`, includes soft-deleted/archived records |

---

## 🧭 Cursor Pagination (`get`)

| Param             | Type     | Description |
|-------------------|----------|-------------|
| `cursor.{column}` | string   | Value of column to use as paging cursor (e.g., `cursor.id=abc123`) |
| `conditions`      | JSON     | JSON array of condition objects (e.g., `[{"status":"active"}]`) |
| `{column}`        | string   | Additional filters by column (e.g., `status=active`, `type=residential`) |

---

## 🔎 Offset Pagination with Filtering (`getWhere` and `getArchived`)

| Param             | Type     | Description |
|-------------------|----------|-------------|
| `conditions`      | JSON     | JSON array of condition objects (supports advanced logic like `$or`, `$ne`) |
| `joinType`        | string   | Join type for combining conditions (default: `AND`) |
| `{column}`        | string   | Flat filters by column (like `status=active`) |

---

## 📌 Example Usage

### Basic Pagination
```
?limit=25&orderBy=created_at
```

### Filtering by fields
```
?status=active&region=northeast
```

### Complex query using conditions
```
?conditions=[{"$or":[{"status":"active"},{"region":"west"}]}]
```

### Cursor Pagination
```
?cursor.id=abc123&limit=50&orderBy=id
```

---

## 🔐 Notes
- All query values are strings and may need URL encoding
- `conditions` must be a valid JSON string
- Use `getWhere` for advanced queries, and `get` for fast pagination

