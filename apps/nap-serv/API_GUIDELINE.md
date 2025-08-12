

# nap-serv API Guidelines

These guidelines define the API structure, routing conventions, authentication, and request behavior for nap-serv.

---

## Base Path and Versioning

- All routes must be nested under:
  ```
  /api/tenants/v1/
  ```
- Versioning is required in all public API routes.
- Example:
  ```
  GET /api/tenants/v1/projects/:id
  ```

---

## Resource Naming & REST Semantics

- Use **plural nouns** for resources:
  - `/projects`, `/users`, `/skus`, `/vendors`
- Follow standard HTTP verbs:
  - `GET /resources` — list
  - `GET /resources/:id` — retrieve
  - `POST /resources` — create
  - `PUT /resources/:id` — update
  - `DELETE /resources/:id` — delete or soft-delete

---

## Routing Rules

- Always define routes with full resource paths (no nesting handlers without clear hierarchy).
- Match URL paths exactly to business entities and avoid verbs in route names.
- Optional query parameters should be documented for each route.

---

## Query Parameters

- All filterable routes must accept:
  - `limit`, `offset`, `sort`
- Use snake_case for query parameters.
- Common query parameters:
  - `?tenant_id=...`
  - `?project_id=...`
  - `?include_deleted=true`

---

## Authentication

- All routes require a valid bearer token unless explicitly marked as public.
- Tokens are verified via the nap-serv auth middleware.
- Auth strategy:
  - JWT includes tenant ID and user role.
  - Role-based access controls applied per route.

---

## Soft Deletes

- DELETE routes should perform soft deletes where supported.
  - Mark with `deleted_at` timestamp.
  - Allow `?include_deleted=true` to retrieve them.
- Hard deletes must be confirmed via a separate confirmation step.

---

## Error Handling

- Always return structured errors:
  ```json
  {
    "error": "InvalidRequest",
    "message": "Missing required field: project_id"
  }
  ```
- Common error types:
  - `InvalidRequest`
  - `Unauthorized`
  - `NotFound`
  - `Conflict`
  - `InternalError`

---

## Request Validation

- Validate body, params, and query string before hitting business logic.
- Use consistent error messages on invalid input.
- Required fields must be clearly documented in the OpenAPI spec.

---

## Best Practices

- Use `camelCase` in JSON responses, `snake_case` in DB and query strings.
- Avoid side effects in GET requests.
- Log all authenticated requests with tenant ID and request ID.
- Keep routes flat — avoid deeply nested resource paths unless logically necessary.

---

## AI Agent Notes

- These conventions help ensure Copilot and AI agents generate consistent, production-ready code.
- See `STYLEGUIDE.md` for business logic rules and logging requirements.