CREATE OR REPLACE VIEW tenantid.vw_template_tasks_export AS
SELECT
  tu.name AS unit_name,
  tu.version,
  tt.task_code,
  tt.name,
  tt.duration_days
FROM tenantid.template_tasks tt
JOIN tenantid.template_units tu
  ON tt.template_unit_id = tu.id;