# Accounting Module Design Summary - nap-serv

## Core Architecture Decisions

### 1. Strict Intra-Tenant Isolation

* All accounting data is scoped by `tenant_id`.
* No cross-tenant access, except for nap superusers (minimal need).

### 2. No Constraints on `tenant_id`

* `tenant_id` is used only as a filter.
* It is not included in foreign keys, indexes, unique, or check constraints.

### 3. Vendor-Driven Activity Costs

* Every entry from the `activities` module must include a `vendor_id`.
* Journal entries must reflect vendor-associated transactions (e.g., DR project expense, CR accounts payable).

## Required Features

### 4. Dynamic COA Mapping

* `category_id` is mapped to a default `account_id` (usually an expense account).
* Used to determine the debit account automatically when recording activity costs.
* Table example:

```sql
category_account_map (
  tenant_id,
  category_id,
  account_id,
  valid_from,
  valid_to
)
```

### 5. Internal Transfer Journals

* For intra-department or intra-unit fund reallocations.
* Journal format:

  * DR: Receiving department/unit account
  * CR: Giving department/unit account

### 6. Journal Engine / Posting Queue

* Journal entries are first added with status `pending`.
* A background job or manual trigger processes and posts them in order.
* Posting engine ensures:

  * Entries are balanced
  * Accounts exist and are active
  * Posting is auditable and reliable

## Optional Feature

### 7. Budget Encumbrance (configurable)

* Upon budget approval, an optional encumbrance entry may be created:

  * DR: Encumbrance Expense
  * CR: Budget Reserve Liability
* Reversed upon actual cost posting.
* This is tenant-configurable or globally toggled.

## Next Steps

* Model the following tables:

  * `chart_of_accounts`
  * `journal_entries`
  * `journal_entry_lines`
  * `posting_queue`
  * `category_account_map`
* Define API and controller structure
* Implement the posting engine logic
