/**
 * @file Migration: create reporting & export SQL views
 * @module reports/schema/migrations/202502120080_sqlViews
 *
 * Views created:
 *   vw_project_profitability      — revenue, cost, margin per project
 *   vw_project_cashflow_monthly   — monthly inflows/outflows/cumulative per project
 *   vw_project_cost_by_category   — budget vs actual grouped by activity category
 *   vw_ar_aging                   — AR aging buckets by client
 *   vw_ap_aging                   — AP aging buckets by vendor
 *   vw_export_contacts            — polymorphic contacts with source entity info
 *   vw_export_addresses           — polymorphic addresses with source entity info
 *   vw_export_template_cost_items — template cost items with task/unit hierarchy
 *   vw_template_tasks_export      — template tasks with unit name/version
 *
 * Copyright (c) 2025 NapSoft LLC. All rights reserved.
 */

import { defineMigration } from '../../../../src/db/migrations/defineMigration.js';

export default defineMigration({
  id: '202502120080-sql-views',
  description: 'Create reporting and export SQL views',

  async up({ schema, db }) {
    if (schema === 'admin') return;

    // ── 1. Project Profitability ─────────────────────────────────────
    await db.none(`
      CREATE OR REPLACE VIEW ${schema}.vw_project_profitability AS
      SELECT
        p.id                    AS project_id,
        p.project_code,
        p.name                  AS project_name,
        p.status                AS project_status,
        p.contract_amount,

        -- Invoiced revenue: sum of sent/paid AR invoices
        COALESCE(ar_agg.invoiced_revenue, 0)  AS invoiced_revenue,

        -- Collected revenue: sum of receipts linked to project AR invoices
        COALESCE(ar_agg.collected_revenue, 0) AS collected_revenue,

        -- Committed cost: sum of approved AP invoices for this project
        COALESCE(ap_agg.committed_cost, 0)    AS committed_cost,

        -- Cash out: sum of payments against project AP invoices
        COALESCE(ap_agg.cash_out, 0)          AS cash_out,

        -- Actual spend: sum of approved actual costs
        COALESCE(ac_agg.actual_spend, 0)      AS actual_spend,

        -- Budgeted cost: sum of current budget amounts via cost_items
        COALESCE(ci_agg.total_budgeted_cost, 0) AS total_budgeted_cost,

        -- Change order value: sum of approved change orders
        COALESCE(co_agg.change_order_value, 0)  AS change_order_value,

        -- Derived metrics
        COALESCE(ar_agg.invoiced_revenue, 0) - COALESCE(ap_agg.committed_cost, 0)
          AS gross_profit,
        CASE
          WHEN COALESCE(ar_agg.invoiced_revenue, 0) = 0 THEN 0
          ELSE ROUND(
            (COALESCE(ar_agg.invoiced_revenue, 0) - COALESCE(ap_agg.committed_cost, 0))
            * 100.0 / COALESCE(ar_agg.invoiced_revenue, 0), 2
          )
        END AS gross_margin_pct,

        COALESCE(ar_agg.collected_revenue, 0) - COALESCE(ap_agg.cash_out, 0)
          AS net_cashflow,

        COALESCE(ci_agg.total_budgeted_cost, 0) - COALESCE(ac_agg.actual_spend, 0)
          AS budget_variance,

        COALESCE(ac_agg.actual_spend, 0)
          + GREATEST(COALESCE(ci_agg.total_budgeted_cost, 0) - COALESCE(ac_agg.actual_spend, 0), 0)
          AS est_cost_at_completion

      FROM ${schema}.projects p

      -- AR aggregates
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(ai.total_amount) FILTER (WHERE ai.status IN ('sent','paid')), 0) AS invoiced_revenue,
          COALESCE(SUM(r.amount), 0) AS collected_revenue
        FROM ${schema}.ar_invoices ai
        LEFT JOIN ${schema}.receipts r ON r.ar_invoice_id = ai.id AND r.deactivated_at IS NULL
        WHERE ai.project_id = p.id AND ai.deactivated_at IS NULL
      ) ar_agg ON true

      -- AP aggregates
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(SUM(api.total_amount) FILTER (WHERE api.status IN ('approved','paid')), 0) AS committed_cost,
          COALESCE(SUM(pay.amount), 0) AS cash_out
        FROM ${schema}.ap_invoices api
        LEFT JOIN ${schema}.payments pay ON pay.ap_invoice_id = api.id AND pay.deactivated_at IS NULL
        WHERE api.project_id = p.id AND api.deactivated_at IS NULL
      ) ap_agg ON true

      -- Actual cost aggregates
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(ac.amount), 0) AS actual_spend
        FROM ${schema}.actual_costs ac
        WHERE ac.project_id = p.id AND ac.approval_status = 'approved' AND ac.deactivated_at IS NULL
      ) ac_agg ON true

      -- Budgeted cost via cost_items -> tasks -> units -> project
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(ci.amount), 0) AS total_budgeted_cost
        FROM ${schema}.cost_items ci
        JOIN ${schema}.tasks t ON t.id = ci.task_id AND t.deactivated_at IS NULL
        JOIN ${schema}.units u ON u.id = t.unit_id AND u.deactivated_at IS NULL
        WHERE u.project_id = p.id AND ci.deactivated_at IS NULL
      ) ci_agg ON true

      -- Change order aggregates
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(co.total_amount), 0) AS change_order_value
        FROM ${schema}.change_orders co
        JOIN ${schema}.units u ON u.id = co.unit_id AND u.deactivated_at IS NULL
        WHERE u.project_id = p.id AND co.status = 'approved' AND co.deactivated_at IS NULL
      ) co_agg ON true

      WHERE p.deactivated_at IS NULL
    `);

    // ── 2. Project Cashflow Monthly ──────────────────────────────────
    await db.none(`
      CREATE OR REPLACE VIEW ${schema}.vw_project_cashflow_monthly AS
      WITH inflows AS (
        SELECT
          ai.project_id,
          DATE_TRUNC('month', r.receipt_date)::date AS month,
          SUM(r.amount) AS inflow
        FROM ${schema}.receipts r
        JOIN ${schema}.ar_invoices ai ON ai.id = r.ar_invoice_id AND ai.deactivated_at IS NULL
        WHERE r.deactivated_at IS NULL AND ai.project_id IS NOT NULL
        GROUP BY ai.project_id, DATE_TRUNC('month', r.receipt_date)
      ),
      outflows AS (
        SELECT
          api.project_id,
          DATE_TRUNC('month', pay.payment_date)::date AS month,
          SUM(pay.amount) AS outflow
        FROM ${schema}.payments pay
        JOIN ${schema}.ap_invoices api ON api.id = pay.ap_invoice_id AND api.deactivated_at IS NULL
        WHERE pay.deactivated_at IS NULL AND api.project_id IS NOT NULL
        GROUP BY api.project_id, DATE_TRUNC('month', pay.payment_date)
      ),
      actuals AS (
        SELECT
          ac.project_id,
          DATE_TRUNC('month', ac.incurred_on)::date AS month,
          SUM(ac.amount) AS actual_cost
        FROM ${schema}.actual_costs ac
        WHERE ac.deactivated_at IS NULL AND ac.approval_status = 'approved' AND ac.project_id IS NOT NULL
        GROUP BY ac.project_id, DATE_TRUNC('month', ac.incurred_on)
      ),
      combined AS (
        SELECT project_id, month FROM inflows
        UNION
        SELECT project_id, month FROM outflows
        UNION
        SELECT project_id, month FROM actuals
      )
      SELECT
        c.project_id,
        c.month,
        COALESCE(i.inflow, 0)        AS inflow,
        COALESCE(o.outflow, 0)       AS outflow,
        COALESCE(a.actual_cost, 0)   AS actual_cost,
        COALESCE(i.inflow, 0) - COALESCE(o.outflow, 0) AS net_cashflow,
        SUM(COALESCE(i.inflow, 0)) OVER (PARTITION BY c.project_id ORDER BY c.month) AS cumulative_inflow,
        SUM(COALESCE(o.outflow, 0)) OVER (PARTITION BY c.project_id ORDER BY c.month) AS cumulative_outflow,
        SUM(COALESCE(i.inflow, 0) - COALESCE(o.outflow, 0)) OVER (PARTITION BY c.project_id ORDER BY c.month) AS cumulative_net
      FROM combined c
      LEFT JOIN inflows i ON i.project_id = c.project_id AND i.month = c.month
      LEFT JOIN outflows o ON o.project_id = c.project_id AND o.month = c.month
      LEFT JOIN actuals a ON a.project_id = c.project_id AND a.month = c.month
      ORDER BY c.project_id, c.month
    `);

    // ── 3. Project Cost by Category ──────────────────────────────────
    await db.none(`
      CREATE OR REPLACE VIEW ${schema}.vw_project_cost_by_category AS
      SELECT
        da.project_id,
        cat.id          AS category_id,
        cat.code        AS category_code,
        cat.name        AS category_name,
        COALESCE(SUM(b.budgeted_amount), 0) AS budgeted_amount,
        COALESCE(SUM(ac.amount), 0)         AS actual_amount,
        COALESCE(SUM(b.budgeted_amount), 0) - COALESCE(SUM(ac.amount), 0) AS variance
      FROM ${schema}.deliverable_assignments da
      JOIN ${schema}.budgets b
        ON b.deliverable_id = da.deliverable_id
        AND b.is_current = true
        AND b.deactivated_at IS NULL
      JOIN ${schema}.activities act
        ON act.id = b.activity_id
        AND act.deactivated_at IS NULL
      JOIN ${schema}.categories cat
        ON cat.id = act.category_id
        AND cat.deactivated_at IS NULL
      LEFT JOIN ${schema}.actual_costs ac
        ON ac.activity_id = act.id
        AND ac.project_id = da.project_id
        AND ac.approval_status = 'approved'
        AND ac.deactivated_at IS NULL
      WHERE da.deactivated_at IS NULL
      GROUP BY da.project_id, cat.id, cat.code, cat.name
    `);

    // ── 4. AR Aging ──────────────────────────────────────────────────
    await db.none(`
      CREATE OR REPLACE VIEW ${schema}.vw_ar_aging AS
      SELECT
        ai.client_id,
        cl.name        AS client_name,
        cl.client_code,
        COUNT(ai.id)   AS invoice_count,
        SUM(ai.balance_due) AS total_balance,
        SUM(ai.balance_due) FILTER (WHERE CURRENT_DATE - ai.due_date <= 0)                      AS current_bucket,
        SUM(ai.balance_due) FILTER (WHERE CURRENT_DATE - ai.due_date BETWEEN 1 AND 30)          AS bucket_1_30,
        SUM(ai.balance_due) FILTER (WHERE CURRENT_DATE - ai.due_date BETWEEN 31 AND 60)         AS bucket_31_60,
        SUM(ai.balance_due) FILTER (WHERE CURRENT_DATE - ai.due_date BETWEEN 61 AND 90)         AS bucket_61_90,
        SUM(ai.balance_due) FILTER (WHERE CURRENT_DATE - ai.due_date > 90)                      AS bucket_over_90
      FROM ${schema}.ar_invoices ai
      JOIN ${schema}.ar_clients cl ON cl.id = ai.client_id AND cl.deactivated_at IS NULL
      WHERE ai.deactivated_at IS NULL
        AND ai.balance_due > 0
        AND ai.status IN ('sent', 'open')
      GROUP BY ai.client_id, cl.name, cl.client_code
    `);

    // ── 5. AP Aging ──────────────────────────────────────────────────
    await db.none(`
      CREATE OR REPLACE VIEW ${schema}.vw_ap_aging AS
      SELECT
        api.vendor_id,
        v.name         AS vendor_name,
        v.code         AS vendor_code,
        COUNT(api.id)  AS invoice_count,
        SUM(api.balance_due) AS total_balance,
        SUM(api.balance_due) FILTER (WHERE CURRENT_DATE - api.due_date <= 0)                     AS current_bucket,
        SUM(api.balance_due) FILTER (WHERE CURRENT_DATE - api.due_date BETWEEN 1 AND 30)         AS bucket_1_30,
        SUM(api.balance_due) FILTER (WHERE CURRENT_DATE - api.due_date BETWEEN 31 AND 60)        AS bucket_31_60,
        SUM(api.balance_due) FILTER (WHERE CURRENT_DATE - api.due_date BETWEEN 61 AND 90)        AS bucket_61_90,
        SUM(api.balance_due) FILTER (WHERE CURRENT_DATE - api.due_date > 90)                     AS bucket_over_90
      FROM ${schema}.ap_invoices api
      JOIN ${schema}.vendors v ON v.id = api.vendor_id AND v.deactivated_at IS NULL
      WHERE api.deactivated_at IS NULL
        AND api.balance_due > 0
        AND api.status IN ('open', 'approved')
      GROUP BY api.vendor_id, v.name, v.code
    `);

    // ── 6. Export Contacts ───────────────────────────────────────────
    await db.none(`
      CREATE OR REPLACE VIEW ${schema}.vw_export_contacts AS
      SELECT
        c.id,
        c.source_id,
        s.source_type,
        s.table_id     AS entity_id,
        s.label        AS entity_label,
        c.name,
        c.email,
        c.phone,
        c.mobile,
        c.fax,
        c.position,
        c.is_primary,
        c.created_at,
        c.updated_at
      FROM ${schema}.contacts c
      JOIN ${schema}.sources s ON s.id = c.source_id AND s.deactivated_at IS NULL
      WHERE c.deactivated_at IS NULL
    `);

    // ── 7. Export Addresses ──────────────────────────────────────────
    await db.none(`
      CREATE OR REPLACE VIEW ${schema}.vw_export_addresses AS
      SELECT
        a.id,
        a.source_id,
        s.source_type,
        s.table_id     AS entity_id,
        s.label        AS entity_label,
        a.label        AS address_label,
        a.address_line_1,
        a.address_line_2,
        a.address_line_3,
        a.city,
        a.state_province,
        a.postal_code,
        a.country_code,
        a.is_primary,
        a.created_at,
        a.updated_at
      FROM ${schema}.addresses a
      JOIN ${schema}.sources s ON s.id = a.source_id AND s.deactivated_at IS NULL
      WHERE a.deactivated_at IS NULL
    `);

    // ── 8. Export Template Cost Items ─────────────────────────────────
    await db.none(`
      CREATE OR REPLACE VIEW ${schema}.vw_export_template_cost_items AS
      SELECT
        tci.id,
        tci.template_task_id,
        tt.task_code,
        tt.name           AS task_name,
        tt.template_unit_id,
        tu.name           AS unit_name,
        tu.version        AS unit_version,
        tci.item_code,
        tci.description,
        tci.cost_class,
        tci.cost_source,
        tci.quantity,
        tci.unit_cost,
        tci.amount,
        tci.created_at,
        tci.updated_at
      FROM ${schema}.template_cost_items tci
      JOIN ${schema}.template_tasks tt ON tt.id = tci.template_task_id AND tt.deactivated_at IS NULL
      JOIN ${schema}.template_units tu ON tu.id = tt.template_unit_id AND tu.deactivated_at IS NULL
      WHERE tci.deactivated_at IS NULL
    `);

    // ── 9. Export Template Tasks ─────────────────────────────────────
    await db.none(`
      CREATE OR REPLACE VIEW ${schema}.vw_template_tasks_export AS
      SELECT
        tt.id,
        tt.template_unit_id,
        tu.name           AS unit_name,
        tu.version        AS unit_version,
        tt.task_code,
        tt.name,
        tt.duration_days,
        tt.parent_code,
        tt.created_at,
        tt.updated_at
      FROM ${schema}.template_tasks tt
      JOIN ${schema}.template_units tu ON tu.id = tt.template_unit_id AND tu.deactivated_at IS NULL
      WHERE tt.deactivated_at IS NULL
    `);
  },

  async down({ schema, db }) {
    if (schema === 'admin') return;

    const views = [
      'vw_template_tasks_export',
      'vw_export_template_cost_items',
      'vw_export_addresses',
      'vw_export_contacts',
      'vw_ap_aging',
      'vw_ar_aging',
      'vw_project_cost_by_category',
      'vw_project_cashflow_monthly',
      'vw_project_profitability',
    ];
    for (const vw of views) {
      await db.none(`DROP VIEW IF EXISTS ${schema}.${vw} CASCADE`);
    }
  },
});
