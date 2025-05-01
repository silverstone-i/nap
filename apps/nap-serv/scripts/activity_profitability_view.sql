/*
* Copyright © 2024-present, Ian Silverstone
*
* See the LICENSE file at the top-level directory of this distribution
* for licensing information.
*
* Removal or modification of this copyright notice is prohibited.
*/

CREATE OR REPLACE VIEW tenantid.activity_profitability AS
SELECT
  a.id AS activity_id,
  a.tenant_id,
  a.name AS activity_name,
  COALESCE(b.budgeted_cost, 0) AS budgeted_cost,
  COALESCE(b.budgeted_price, 0) AS budgeted_price,

  -- Actuals based on vendor_parts + cost_lines
  SUM(cl.quantity * vp.unit_cost) AS actual_cost,
  SUM(cl.quantity * vp.unit_cost * (1 + COALESCE(cl.markup_pct, vp.markup_pct, 0) / 100)) AS actual_price,

  -- Profitability
  SUM(cl.quantity * vp.unit_cost * (1 + COALESCE(cl.markup_pct, vp.markup_pct, 0) / 100)) -
  SUM(cl.quantity * vp.unit_cost) AS profit,

  -- Budget vs actual variance
  COALESCE(b.budgeted_price, 0) -
  SUM(cl.quantity * vp.unit_cost * (1 + COALESCE(cl.markup_pct, vp.markup_pct, 0) / 100)) AS price_variance,

  COALESCE(b.budgeted_cost, 0) -
  SUM(cl.quantity * vp.unit_cost) AS cost_variance

FROM tenantid.activities a
LEFT JOIN tenantid.activity_budgets b ON a.id = b.activity_id
LEFT JOIN tenantid.cost_lines cl ON a.id = cl.activity_id
LEFT JOIN tenantid.vendor_parts vp ON cl.vendor_part_id = vp.id
GROUP BY a.id, a.tenant_id, a.name, b.budgeted_cost, b.budgeted_price;