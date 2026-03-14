# Accounts Receivable (AR) Rules

## Table Hierarchy

| Table | Parent FK | Cascade | Notes |
|-------|-----------|---------|-------|
| `ar_invoices` | inter_companies (RESTRICT), clients (RESTRICT), projects (SET NULL), deliverables (SET NULL) | — | Status-gated lifecycle with GL posting |
| `ar_invoice_lines` | ar_invoices (CASCADE) | CASCADE from invoice | Links to chart_of_accounts (RESTRICT) |
| `receipts` | clients (RESTRICT), ar_invoices (SET NULL) | — | Partial receipts supported |

## AR Invoice Status Workflow

```
open → sent → paid → voided
  │      │      │
  └→ voided ←┘────┘
```

- **open**: Initial state; lines can be added/edited
- **sent**: Invoice dispatched to client — auto-assigns `invoice_number` via numbering system (note: controller passes `legal_entity_id` to `allocateNumber` but this column is not in the schema — effectively passes `null`); triggers GL posting (debit AR Receivable, credit Revenue)
- **paid**: Fully settled — auto-transitions when remaining balance reaches zero
- **voided**: Canceled (terminal); reachable from any prior status

## Receipt Rules

- Partial receipts are supported
- Remaining balance = `total_amount − SUM(receipts)`
- Invoice must have status `sent` or `paid` to receive receipts (cannot record receipts on `open` invoices)
- Receipt amount is validated against remaining balance (cannot overpay)
- On creation: triggers GL posting (debit Cash/Bank, credit AR Receivable)
- Auto-transitions invoice to `paid` when remaining balance reaches zero
- Valid payment methods: `check`, `ach`, `wire` (validated in controller; no schema CHECK constraint)

## Soft Delete Convention

All AR tables use `softDelete: true` with a `deactivated_at` column:

- Active records: `deactivated_at IS NULL`
- Archived records: `deactivated_at IS NOT NULL`

## API Routes

All AR module routes are mounted under `/api/ar/v1/`:

| Endpoint | Entity |
|----------|--------|
| `/api/ar/v1/ar-invoices` | AR Invoices |
| `/api/ar/v1/ar-invoice-lines` | AR Invoice Lines |
| `/api/ar/v1/receipts` | Receipts |
