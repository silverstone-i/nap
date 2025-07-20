CREATE OR REPLACE VIEW tenantid.vw_export_template_cost_items AS
SELECT
  tu.name AS unit_name,
  tu.version,
  tt.task_code,
  tci.parent_code,
  tci.item_code,
  tci.cost_class,
  tci.cost_source,
  tci.description,
  tci.quantity,
  tci.unit_cost
FROM tenantid.template_cost_items tci
JOIN tenantid.template_tasks tt ON tci.template_task_id = tt.id
JOIN tenantid.template_units tu ON tt.template_unit_id = tu.id;
