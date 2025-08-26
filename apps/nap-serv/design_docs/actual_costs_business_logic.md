
# nap-serv Business Logic: `actual_costs`

## 📁 Table Overview

Tracks real-world, approved incurred expenses tied to `cost_lines`.

---

## 1. Who Can Create an Actual Cost?

- A Project Manager (PM) or system-integrated process (e.g. invoice import) can initiate.
- User must have permission to the tenant and associated project.

---

## 2. When Is an Actual Cost Created?

- Upon:
  - Manual PM entry (e.g. invoice arrived)
  - Automated import (e.g. from vendor portal)
  - Approval of a project milestone, depending on workflow

---

## 3. Default Behavior on Create

| Field              | Behavior                                            |
|--------------------|-----------------------------------------------------|
| `id`               | Auto-generated (`uuidv7()`)                         |
| `tenant_id`        | Required from session/request context               |
| `cost_line_id`     | Must exist and belong to same `tenant_id`           |
| `amount`           | Must be ≤ remaining budget, unless overage is allowed |
| `currency`         | Default to project or tenant setting                |
| `reference`        | Optional — e.g. PO number, invoice ref              |
| `approval_status`  | Defaults to `'pending'`                             |
| `incurred_on`      | Required at the point of final approval             |

---

## 4. Approval Flow

| Step              | Rule                                                              |
|-------------------|-------------------------------------------------------------------|
| PM submits cost   | `approval_status = 'pending'`                                     |
| System checks     | Total `actual_costs.amount` for this cost_line must not exceed budget unless within tolerance or change order exists |
| If within rules   | System sets `approval_status = 'approved'` + `approved_by` + `incurred_on = today()` |
| If over limit     | Requires change order or elevated approval                        |
| Rejections        | Set `approval_status = 'rejected'` with `approval_note`           |

---

## 5. Business Constraints

- 🚫 Cannot approve > 100% of budgeted line **unless**:
  - Approved change order exists **OR**
  - Overrun is within allowed `tolerance_pct` (e.g. 1–2%)

- ✅ Can approve partial amounts (e.g. down payments)

- 🧾 `reference` field may be used for invoice grouping (can hold multiple PO refs)

---

## 6. Audit & History

- Use `hasAuditFields` to track created/updated
- `approval_note` is for human-readable approval context

---

## ⏩ Next Steps

- Add controller logic to enforce these rules
- Add role-based guardrails in middleware
- Create API endpoints for:
  - Draft submission
  - Approve/Reject flow
  - Actuals-by-budget reporting
