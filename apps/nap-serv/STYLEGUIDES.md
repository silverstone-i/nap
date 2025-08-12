

# nap-serv Style Guide

This document outlines coding and architectural conventions for the `nap-serv` project. It is intended to guide contributors and Copilot agents to produce consistent, maintainable code.

---

## JavaScript

- Always use **ES Modules (ESM)**.
  ```js
  import express from 'express';
  export function handler(req, res) { ... }
  ```
- Avoid CommonJS (`require`, `module.exports`).
- Use `async/await` for all asynchronous flows.

---

## Project Structure

- Organize code by **domain feature**, not by type.
- Keep files small and functions focused.
- Use named exports for all modules.
- Maintain flat directories when possible; avoid deep nesting.

---

## API Design

- Base path: `/api/tenants/v1/`
- Use RESTful routes:
  ```
  GET    /projects/:id
  POST   /projects
  PUT    /projects/:id
  DELETE /projects/:id
  ```
- Use consistent plural nouns (e.g., `/projects`, `/bids`, `/skus`).

---

## Database (PostgreSQL via pg-schemata)

- Use `snake_case` for all table and column names.
- Track deletions via a `deleted_at TIMESTAMP` (soft delete).
- Foreign keys should be explicit, nullable when soft-deleted.
- Use migrations and schema versioning via `pg-schemata`.
- All updates and deletes must use transactions.

---

## Business Logic Conventions

- Implement soft delete behavior first:
  - Set `deleted_at` when removing records.
  - Only perform hard deletes after client confirms intent.
- Normalize SKU and BOM data before embedding or scoring.
- All pricing and costing logic must be traceable to source (vendor or model).

---

## Logging & Errors

- Use structured logging with Winston.
- Include tenant ID and request ID in all logs.
- Avoid `console.log`; use `logger.info/warn/error`.
- Always return meaningful HTTP errors (no silent failures).

---

## Testing

- Use **Vitest** (not Jest).
- Write integration tests for all route handlers.
- Use test factories and fixtures for multi-tenant data.
- Mock external services (e.g. OpenAI, vendor APIs).

---

## AI & Copilot Notes

- Style and patterns in this file are optimized for Copilot agent mode (16k token context).
- Keep high-quality examples nearby in the file to guide completions.
- Use in-line comments like `// nap-serv convention: soft delete check` to signal intent.