CREATE OR REPLACE VIEW merged_budget_lines AS
SELECT
  id,
  deliverable_id,
  budget_id,
  activity_id,
  amount,
  'budget' AS source,
  created_at,
  updated_at
FROM cost_lines
WHERE status = 'locked'

UNION ALL

SELECT
  id,
  deliverable_id,
  NULL AS budget_id,
  activity_id,
  change_amount AS amount,
  'change_order' AS source,
  created_at,
  updated_at
FROM change_order_lines
WHERE status = 'approved';