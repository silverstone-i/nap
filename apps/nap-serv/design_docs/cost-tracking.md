# 📊 Cost Tracking Module Overview

## ✅ Purpose

This module tracks project expenses (`cost_lines`) against planned budgets (`activity_budgets`) by categorizing costs (`categories`) and linking them to specific projects (`projects`). It supports variance reporting, budget enforcement, and financial transparency.

---

## 📥 What Data is Collected?

| Entity           | Purpose                                             | Data Source                |
|------------------|------------------------------------------------------|-----------------------------|
| `projects`       | Represents a job or engagement                      | Manually created by PMs     |
| `categories`     | Classifies types of costs (labor, materials, etc.)  | Setup by Admin              |
| `activity_budgets` | Planned amounts per category for a project         | Defined during planning     |
| `cost_lines`     | Actual incurred costs                               | Manually or via CSV import  |

---

## 🔗 How It Connects (ER Diagram)

```plaintext
projects
│
├──< cost_lines >── categories
│
└──< activity_budgets >── categories
```

### Schema Relationships

- `cost_lines.project_id → projects.id`
- `cost_lines.category_id → categories.id`
- `activity_budgets.project_id → projects.id`
- `activity_budgets.category_id → categories.id`

### Key Schema Highlights

```js
// costLinesSchema.js (excerpt)
columns: [
  { name: 'id', type: 'uuid', default: 'gen_random_uuid()', nullable: false },
  { name: 'project_id', type: 'uuid', nullable: false },
  { name: 'category_id', type: 'uuid', nullable: false },
  { name: 'amount', type: 'numeric(12,2)', nullable: false },
  { name: 'description', type: 'text' }
],
constraints: {
  primaryKey: ['id'],
  foreignKeys: [
    { columns: ['project_id'], references: { table: 'tenantid.projects', columns: ['id'] }},
    { columns: ['category_id'], references: { table: 'tenantid.categories', columns: ['id'] }}
  ]
}
```

---

## 🔄 How Data Flows

### Lifecycle

1. **Create Project** – Added to `projects` table
2. **Define Budget** – Added to `activity_budgets` per category
3. **Enter Costs** – Added to `cost_lines` via UI or CSV
4. **View Variance Report** – Aggregates actual vs budgeted per category

---

## 📈 Why It Matters

- **Budget Control**: Enables cost monitoring throughout a project.
- **Reporting**: Roll-up data across tenants, categories, and periods.
- **Forecasting**: Uses cost history to improve future project planning.
- **Multi-Tenant Separation**: All records include `tenant_id` for isolation.

---

## 🗺️ Data Action Mapping

| Action             | Source            | Target Table        | Key Fields                        |
|--------------------|-------------------|---------------------|-----------------------------------|
| Add Cost Entry     | UI / CSV Upload   | `cost_lines`        | `project_id`, `category_id`, `amount` |
| Define Budget      | Planning Tool     | `activity_budgets`  | `project_id`, `category_id`, `amount` |
| Classify Category  | Admin Setup       | `categories`        | `name` |
| View Report        | Report Engine     | Join on all tables  | `projects`, `cost_lines`, `activity_budgets` |

---

## 🧮 Example Aggregation SQL

```sql
SELECT
  p.id AS project_id,
  c.name AS category,
  COALESCE(SUM(cl.amount), 0) AS actual_cost,
  ab.amount AS budget
FROM projects p
LEFT JOIN cost_lines cl ON cl.project_id = p.id
LEFT JOIN categories c ON c.id = cl.category_id
LEFT JOIN activity_budgets ab ON ab.project_id = p.id AND ab.category_id = c.id
GROUP BY p.id, c.name, ab.amount;
```

---

## 📌 Notes

- `gen_random_uuid()` is used for all IDs for decentralized primary keys.
- All tables include `tenant_id` for multi-tenant isolation.
- Reports may be filtered by `project_code`, `category`, or `date ranges`.
