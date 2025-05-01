/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

CREATE OR REPLACE VIEW tenantid.project_profitability AS
SELECT
  p.id AS project_id,
  p.tenant_id,
  p.name AS project_name,
  p.project_code,

  -- Budget aggregation (optional)
  SUM(COALESCE(ab.budgeted_cost, 0)) AS total_budgeted_cost,
  SUM(COALESCE(ab.budgeted_price, 0)) AS total_budgeted_price,

  -- Actual cost/price
  SUM(cl.quantity * vp.unit_cost) AS actual_cost,
  SUM(cl.quantity * vp.unit_cost * (1 + COALESCE(cl.markup_pct, vp.markup_pct, 0)/100)) AS actual_price,

  -- Profitability
  SUM(cl.quantity * vp.unit_cost * (1 + COALESCE(cl.markup_pct, vp.markup_pct, 0)/100)) -
  SUM(cl.quantity * vp.unit_cost) AS profit,

  -- Variance to budget
  SUM(COALESCE(ab.budgeted_cost, 0)) -
  SUM(cl.quantity * vp.unit_cost) AS cost_variance,

  SUM(COALESCE(ab.budgeted_price, 0)) -
  SUM(cl.quantity * vp.unit_cost * (1 + COALESCE(cl.markup_pct, vp.markup_pct, 0)/100)) AS price_variance

FROM tenantid.projects p
JOIN tenantid.activities a ON a.project_id = p.id
LEFT JOIN tenantid.activity_budgets ab ON ab.activity_id = a.id
LEFT JOIN tenantid.cost_lines cl ON cl.activity_id = a.id
LEFT JOIN tenantid.vendor_parts vp ON cl.vendor_part_id = vp.id
GROUP BY p.id, p.tenant_id, p.name, p.project_code;