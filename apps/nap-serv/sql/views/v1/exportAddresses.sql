CREATE OR REPLACE VIEW tenantid.export_addresses AS
SELECT
  s.source_type,
  CASE s.source_type
    WHEN 'vendor' THEN v.vendor_code
    WHEN 'client' THEN c.client_code
    WHEN 'employee' THEN e.employee_code
  END AS code,
  a.label,
  a.address_line1,
  a.address_line2,
  a.city,
  a.state,
  a.zip,
  a.country
FROM tenantid.addresses a
JOIN tenantid.sources s ON a.source_id = s.id
LEFT JOIN tenantid.vendors v ON s.source_type = 'vendor' AND s.table_id = v.id
LEFT JOIN tenantid.clients c ON s.source_type = 'client' AND s.table_id = c.id
LEFT JOIN tenantid.employees e ON s.source_type = 'employee' AND s.table_id = e.id
WHERE a.deactivated_at IS NULL;