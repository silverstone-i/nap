CREATE OR REPLACE VIEW tenantid.vw_export_contacts AS
SELECT
  s.source_type,
  CASE s.source_type
    WHEN 'vendor' THEN v.vendor_code
    WHEN 'client' THEN c.client_code
    WHEN 'employee' THEN e.employee_code
  END AS code,
  cs.label,
  cs.name,
  cs.email,
  cs.phone,
  cs.mobile,
  cs.fax,
  cs.position
FROM tenantid.contacts cs
JOIN tenantid.sources s ON cs.source_id = s.id
LEFT JOIN tenantid.vendors v ON s.source_type = 'vendor' AND s.table_id = v.id
LEFT JOIN tenantid.clients c ON s.source_type = 'client' AND s.table_id = c.id
LEFT JOIN tenantid.employees e ON s.source_type = 'employee' AND s.table_id = e.id
WHERE cs.deactivated_at IS NULL;