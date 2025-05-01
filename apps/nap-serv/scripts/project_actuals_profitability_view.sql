/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

CREATE OR REPLACE VIEW tenantid.project_actuals_profitability AS
SELECT
  p.id AS project_id,
  p.tenant_id,
  p.name AS project_name,
  p.project_code,

  -- Budget aggregation (optional)
  SUM(COALESCE(ab.budgeted_cost, 0)) AS total_budgeted_cost,
  SUM(COALESCE(ab.budgeted_price, 0)) AS total_budgeted_price,

  -- Actual cost from activity_actuals
  SUM(aa.quantity * aa.unit_cost) AS actual_cost,

  -- Estimated price from markup (placeholder logic)
  SUM(aa.quantity * aa.unit_cost * 1.15) AS actual_price, -- assume avg 15% markup if none available

  -- Profit
  SUM(aa.quantity * aa.unit_cost * 1.15) - SUM(aa.quantity * aa.unit_cost) AS profit,

  -- Variance
  SUM(COALESCE(ab.budgeted_cost, 0)) - SUM(aa.quantity * aa.unit_cost) AS cost_variance,
  SUM(COALESCE(ab.budgeted_price, 0)) - SUM(aa.quantity * aa.unit_cost * 1.15) AS price_variance

FROM tenantid.projects p
JOIN tenantid.activities a ON a.project_id = p.id
LEFT JOIN tenantid.activity_budgets ab ON ab.activity_id = a.id
LEFT JOIN tenantid.activity_actuals aa ON aa.activity_id = a.id
GROUP BY p.id, p.tenant_id, p.name, p.project_code;