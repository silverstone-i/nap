CREATE OR REPLACE VIEW merged_budget_lines AS
SELECT
  id,
  sub_project_id,
  template_id,
  activity_id,
  amount,
  'budget' AS source,
  created_at,
  updated_at
FROM tenantid.cost_lines
WHERE status = 'locked'

UNION ALL

SELECT
  id,
  sub_project_id,
  NULL AS template_id,
  activity_id,
  change_amount AS amount,
  'change_order' AS source,
  created_at,
  updated_at
FROM tenantid.change_order_lines
WHERE status = 'approved';