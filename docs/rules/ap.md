# Accounts Payable (AP) Rules

## Table Hierarchy

| Table | Parent FK | Cascade | Notes |
|-------|-----------|---------|-------|
| `ap_invoices` | inter_companies (RESTRICT), vendors (RESTRICT), projects (SET NULL) | — | Status-gated lifecycle with GL posting |
| `ap_invoice_lines` | ap_invoices (CASCADE) | CASCADE from invoice | Links to chart_of_accounts (RESTRICT), cost_lines (SET NULL), activities (SET NULL) |
| `payments` | vendors (RESTRICT), ap_invoices (SET NULL) | — | Partial payments supported |
| `ap_credit_memos` | vendors (RESTRICT), ap_invoices (SET NULL) | — | Reduces outstanding balance |

## AP Invoice Status Workflow

```
open → approved → paid → voided
  │        │        │
  └→ voided ←┘────────┘
```

- **open**: Initial state; lines can be added/edited
- **approved**: Invoice verified — auto-assigns `invoice_number` via numbering system (note: controller passes `legal_entity_id` to `allocateNumber` but this column is not in the schema — effectively passes `null`); triggers GL posting (debit Expense/WIP, credit AP Liability)
- **paid**: Fully settled — auto-transitions when remaining balance reaches zero
- **voided**: Canceled (terminal); reachable from any prior status

## AP Credit Memo Status Workflow

```
open → applied → voided
  │       │
  └→ voided ←┘
```

- **open**: Initial state
- **applied**: Credit applied to linked invoice — reduces remaining balance; auto-transitions linked invoice to `paid` if balance reaches zero
- **voided**: Canceled (terminal)

## Payment Rules

- Partial payments are supported
- Remaining balance = `total_amount − SUM(payments) − SUM(applied credit memos)`
- Invoice must have status `approved` or `paid` to receive payments (cannot pay `open` invoices)
- Payment amount is validated against remaining balance (cannot overpay)
- On creation: triggers GL posting (debit AP Liability, credit Cash/Bank)
- Auto-transitions invoice to `paid` when remaining balance reaches zero
- Valid payment methods: `check`, `ach`, `wire` (validated in controller; no schema CHECK constraint)

## Soft Delete Convention

All AP tables use `softDelete: true` with a `deactivated_at` column:

- Active records: `deactivated_at IS NULL`
- Archived records: `deactivated_at IS NOT NULL`

## API Routes

All AP module routes are mounted under `/api/ap/v1/`:

| Endpoint | Entity |
|----------|--------|
| `/api/ap/v1/ap-invoices` | AP Invoices |
| `/api/ap/v1/ap-invoice-lines` | AP Invoice Lines |
| `/api/ap/v1/payments` | Payments |
| `/api/ap/v1/ap-credit-memos` | AP Credit Memos |
