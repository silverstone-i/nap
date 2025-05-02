
/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

DROP VIEW IF EXISTS tenantid.project_actuals_profitability CASCADE;

CREATE OR REPLACE VIEW tenantid.project_actuals_profitability AS
SELECT
  p.id AS project_id,
  p.tenant_id,
  p.name AS project_name,
  p.project_code,

  -- Budgeted values from activity_budgets
  COALESCE(SUM(ab.budgeted_cost), 0) AS total_budgeted_cost,
  COALESCE(SUM(ab.budgeted_price), 0) AS total_budgeted_price,

  -- Actual values from costlines
  COALESCE(SUM(cl.quantity * vp.unit_cost), 0) AS actual_cost,
  COALESCE(SUM(cl.quantity * vp.unit_cost * (1 + COALESCE(cl.markup_pct, vp.markup_pct, 0) / 100)), 0) AS actual_price,

  -- Profit and variance
  COALESCE(SUM(cl.quantity * vp.unit_cost * (1 + COALESCE(cl.markup_pct, vp.markup_pct, 0) / 100)), 0) -
  COALESCE(SUM(cl.quantity * vp.unit_cost), 0) AS profit,

  COALESCE(SUM(ab.budgeted_cost), 0) -
  COALESCE(SUM(cl.quantity * vp.unit_cost), 0) AS cost_variance,

  COALESCE(SUM(ab.budgeted_price), 0) -
  COALESCE(SUM(cl.quantity * vp.unit_cost * (1 + COALESCE(cl.markup_pct, vp.markup_pct, 0) / 100)), 0) AS price_variance

FROM tenantid.projects p
LEFT JOIN tenantid.costlines cl
  ON p.id = cl.project_id
LEFT JOIN tenantid.vendorparts vp
  ON cl.tenant_id = vp.tenant_id
 AND cl.vendor_id = vp.vendor_id
 AND cl.tenant_sku = vp.tenant_sku
LEFT JOIN tenantid.activity_budgets ab
  ON cl.tenant_id = ab.tenant_id AND cl.activity_id = ab.activity_id
GROUP BY p.id, p.tenant_id, p.name, p.project_code;