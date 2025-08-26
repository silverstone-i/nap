
# nap-serv Business Logic: `change_order_lines`

## 📁 Table Overview

The `change_order_lines` table tracks approved changes to project unit activity budgets — for example, when a Project Manager (PM) or financial controller authorizes scope or budget adjustments.

---

## 1. When Is a Change Order Created?

- A PM anticipates or is informed of a change to a budgeted activity.
- Vendor requests for pricing changes or additions.
- Design or permitting changes.
- Unexpected field conditions (e.g. rock excavation).

---

## 2. What Does a Change Order Line Include?

| Field          | Description                                                              |
|----------------|---------------------------------------------------------------------------|
| `id`           | Unique change order line ID (`uuidv7`)                                   |
| `unit_id`      | The unit of work this change applies to                               |
| `activity_id`  | The activity whose budget is being altered                               |
| `change_amount`| The amount of the change (positive or negative)                          |
| `currency`     | Currency code, typically USD, CAD, etc.                                   |
| `reason`       | Explanation of why the change is being made                               |
| `reference`    | Optional reference code (e.g. CO #23, vendor quote ref)                   |
| `status`       | `'pending'`, `'approved'`, or `'rejected'`                                |
| `approved_by`  | User ID who approved the change                                           |
| `approved_at`  | Timestamp of approval (default: `now()`)                                  |
| `approval_note`| Optional note from the approver                                           |

---

## 3. Approval Workflow

| Step                | Rule                                                                 |
|---------------------|----------------------------------------------------------------------|
| Created as draft    | `status = 'pending'`, `approved_by = null`                           |
| PM or authority reviews | Can approve or reject                                             |
| On approval         | Set `status = 'approved'`, `approved_by`, and `approved_at = now()` |
| On rejection        | Set `status = 'rejected'`, optionally with `approval_note`          |

---

## 4. Constraints and Rules

- ✅ Cannot exceed authority's change order limit (business logic, not DB-enforced).
- ✅ Must tie to a valid `unit_id` and `activity_id` pair.
- 🛑 No duplicate references for the same `tenant_id`, `unit_id`, `activity_id`, and `reference`.

---

## 5. Implications for Budget Tracking

When approved:
- Adds to `unit_budget` allowance for that activity.
- Included in delta calculations for actuals vs. adjusted budget.
- Auditable history for all budget changes.

---

## ⏩ Next Steps

- Enforce workflow in controller/middleware logic.
- Connect to notification or alert system on change order status update.
- Integrate approval authority checks per role in user permissions.
